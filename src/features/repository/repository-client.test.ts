import { describe, expect, test } from "vitest";

import { createRepositoryClient, getBrowserRepositoryClient } from "./repository-client";
import type { FileDiff, GitOperationResult, RepositoryStatus } from "./repository-types";

type InvokeCall = {
  command: string;
  args: Record<string, unknown>;
};

describe("createRepositoryClient", () => {
  test("uses Tauri command names with camelCase payloads", async () => {
    const calls: InvokeCall[] = [];
    const client = createRepositoryClient(async <T,>(command: string, args: Record<string, unknown>): Promise<T> => {
      calls.push({ args, command });
      const response = await responseForCommand(command);
      return response as T;
    });

    await client.getRepositoryStatus("/repo");
    await client.getFileDiff({ filePath: "src/App.tsx", repositoryPath: "/repo", staged: true });
    await client.stageFile({ filePath: "src/App.tsx", repositoryPath: "/repo" });
    await client.unstageFile({ filePath: "src/App.tsx", repositoryPath: "/repo" });
    await client.commitChanges({ amend: false, body: "", repositoryPath: "/repo", summary: "commit" });
    await client.fetchRepository({ repositoryPath: "/repo" });
    await client.pullRepository({ repositoryPath: "/repo" });
    await client.pushRepository({ repositoryPath: "/repo" });

    expect(calls).toEqual([
      { args: { repositoryPath: "/repo" }, command: "get_repository_status" },
      {
        args: { filePath: "src/App.tsx", repositoryPath: "/repo", staged: true },
        command: "get_file_diff"
      },
      { args: { filePath: "src/App.tsx", repositoryPath: "/repo" }, command: "stage_file" },
      { args: { filePath: "src/App.tsx", repositoryPath: "/repo" }, command: "unstage_file" },
      {
        args: { amend: false, body: "", repositoryPath: "/repo", summary: "commit" },
        command: "commit_changes"
      },
      { args: { repositoryPath: "/repo" }, command: "fetch_repository" },
      { args: { repositoryPath: "/repo" }, command: "pull_repository" },
      { args: { repositoryPath: "/repo" }, command: "push_repository" }
    ]);
  });
});

describe("browser repository client", () => {
  test("returns demo status and clear mutating operation output", async () => {
    const client = getBrowserRepositoryClient();

    await expect(client.getRepositoryStatus("/repo")).resolves.toMatchObject({
      branch: "browser-preview",
      files: expect.arrayContaining([expect.objectContaining({ path: "src/app/App.tsx" })])
    });
    await expect(client.stageFile({ filePath: "src/app/App.tsx", repositoryPath: "/repo" })).resolves.toEqual({
      command: "git add -- src/app/App.tsx",
      stderr: "",
      stdout: "Open the app through Tauri to run mutating Git commands."
    });
  });
});

function responseForCommand(command: string): Promise<RepositoryStatus | FileDiff | GitOperationResult> {
  if (command === "get_repository_status") {
    return Promise.resolve({
      ahead: 0,
      behind: 0,
      branch: "main",
      files: [],
      upstream: null
    });
  }

  if (command === "get_file_diff") {
    return Promise.resolve({
      isBinary: false,
      path: "src/App.tsx",
      text: "diff"
    });
  }

  return Promise.resolve({
    command,
    stderr: "",
    stdout: ""
  });
}
