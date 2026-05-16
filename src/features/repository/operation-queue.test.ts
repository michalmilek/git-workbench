import { describe, expect, test } from "vitest";

import {
  createOperationQueueEntry,
  applyOperationEvent,
  finishOperationQueueEntry,
  trimOperationQueueEntries,
  type OperationQueueEntry,
  type OperationQueueStatus
} from "./operation-queue";
import type { GitOperationResult } from "./repository-types";

type FinishedOperationQueueStatus = Exclude<OperationQueueStatus, "running">;

describe("operation queue helpers", () => {
  test("creates a running queue entry with no logs or result", () => {
    expect(createOperationQueueEntry({ command: "git fetch", id: "operation-1", operation: "Fetch" })).toEqual({
      command: "git fetch",
      id: "operation-1",
      logs: [],
      operation: "Fetch",
      result: null,
      status: "running"
    });
  });

  test("appends stdout and stderr event lines without mutating entries", () => {
    const entry = createOperationQueueEntry({ command: "git pull", id: "operation-1", operation: "Pull" });
    const entries = [entry];

    const withStdout = applyOperationEvent(entries, {
      command: "git pull",
      event: "output",
      line: "Fetching origin",
      operationId: "operation-1",
      status: null,
      stream: "stdout"
    });
    const withStderr = applyOperationEvent(withStdout, {
      command: "git pull",
      event: "output",
      line: "From github.com:example/repo",
      operationId: "operation-1",
      status: null,
      stream: "stderr"
    });

    expect(withStderr[0]).toMatchObject({
      logs: [
        { line: "Fetching origin", stream: "stdout" },
        { line: "From github.com:example/repo", stream: "stderr" }
      ],
      status: "running"
    });
    expect(entries[0]?.logs).toEqual([]);
  });

  test.each<FinishedOperationQueueStatus>(["success", "error"])(
    "marks operation event as %s when it finishes",
    (status) => {
      const entries = [createOperationQueueEntry({ command: "git push", id: "operation-1", operation: "Push" })];

      expect(
        applyOperationEvent(entries, {
          command: "git push",
          event: "finished",
          line: null,
          operationId: "operation-1",
          status,
          stream: null
        })
      ).toEqual([{ ...entries[0], command: "git push", status }]);
    }
  );

  test("finishes entries with result output for browser fallback logs", () => {
    const result: GitOperationResult = {
      command: "git merge feature/demo",
      stderr: "warning: skipped previously applied commit",
      stdout: "Updating abc123..def456\nFast-forward"
    };
    const entries = [createOperationQueueEntry({ command: result.command, id: "operation-1", operation: "Merge" })];

    expect(finishOperationQueueEntry(entries, "operation-1", "success", result)).toEqual([
      {
        command: result.command,
        id: "operation-1",
        logs: [
          { line: "Updating abc123..def456", stream: "stdout" },
          { line: "Fast-forward", stream: "stdout" },
          { line: "warning: skipped previously applied commit", stream: "stderr" }
        ],
        operation: "Merge",
        result,
        status: "success"
      }
    ]);
  });

  test("keeps streamed logs when finishing entries with a final result", () => {
    const result: GitOperationResult = {
      command: "git rebase origin/main",
      stderr: "",
      stdout: "Successfully rebased"
    };
    const streamed = applyOperationEvent(
      [createOperationQueueEntry({ command: result.command, id: "operation-1", operation: "Rebase" })],
      {
        command: result.command,
        event: "output",
        line: "Rebasing (1/1)",
        operationId: "operation-1",
        status: null,
        stream: "stdout"
      }
    );

    expect(finishOperationQueueEntry(streamed, "operation-1", "success", result)[0]?.logs).toEqual([
      { line: "Rebasing (1/1)", stream: "stdout" }
    ]);
  });

  test("trims queue entries to the newest visible entries", () => {
    const entries: OperationQueueEntry[] = Array.from({ length: 4 }, (_, index) =>
      createOperationQueueEntry({
        command: `git command ${index}`,
        id: `operation-${index}`,
        operation: `Operation ${index}`
      })
    );

    expect(trimOperationQueueEntries(entries, 2)).toEqual(entries.slice(0, 2));
  });

  test("ignores events and finishes for unknown operation ids", () => {
    const entries = [createOperationQueueEntry({ command: "git fetch", id: "operation-1", operation: "Fetch" })];
    const result: GitOperationResult = { command: "git fetch", stderr: "", stdout: "" };

    expect(
      applyOperationEvent(entries, {
        command: "git fetch",
        event: "started",
        line: null,
        operationId: "operation-unknown",
        status: null,
        stream: null
      })
    ).toBe(entries);
    expect(finishOperationQueueEntry(entries, "operation-unknown", "error", result)).toBe(entries);
  });
});
