import { describe, expect, test } from "vitest";

import {
  addCommandLogEntry,
  parseCommandLog,
  serializeCommandLog,
  trimCommandLogEntries,
  type CommandLogEntry
} from "./command-log";

const baseEntry: CommandLogEntry = {
  id: "entry-1",
  message: "git fetch",
  operation: "Fetch",
  status: "success",
  timestamp: "2026-05-16T08:00:00.000Z"
};

describe("command log helpers", () => {
  test("round-trips serialized entries", () => {
    const entries: CommandLogEntry[] = [
      {
        ...baseEntry,
        command: "git fetch",
        stderr: "",
        stdout: "Already up to date."
      }
    ];

    expect(parseCommandLog(serializeCommandLog(entries))).toEqual(entries);
  });

  test("ignores invalid stored values", () => {
    expect(parseCommandLog(null)).toEqual([]);
    expect(parseCommandLog("not json")).toEqual([]);
    expect(parseCommandLog(JSON.stringify([{ id: "missing-fields" }]))).toEqual([]);
  });

  test("adds newest entries first and keeps the configured limit", () => {
    const older: CommandLogEntry = {
      ...baseEntry,
      id: "entry-0",
      timestamp: "2026-05-16T07:00:00.000Z"
    };
    const newest: CommandLogEntry = {
      ...baseEntry,
      id: "entry-2",
      operation: "Checkout",
      timestamp: "2026-05-16T09:00:00.000Z"
    };

    expect(addCommandLogEntry([older, baseEntry], newest, 2)).toEqual([newest, older]);
  });

  test("trims existing entries without mutating the input", () => {
    const entries = [
      { ...baseEntry, id: "entry-1" },
      { ...baseEntry, id: "entry-2" },
      { ...baseEntry, id: "entry-3" }
    ];

    expect(trimCommandLogEntries(entries, 2)).toEqual(entries.slice(0, 2));
    expect(entries).toHaveLength(3);
  });
});
