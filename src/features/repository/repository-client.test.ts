import { describe, expect, test } from "vitest";

import { createRepositoryClient, getBrowserRepositoryClient } from "./repository-client";
import type { BranchList, FileDiff, GitOperationResult, RepositoryStatus, StashEntry } from "./repository-types";

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
    await client.listBranches("/repo");
    await client.checkoutBranch({ branchName: "feature/worktree", repositoryPath: "/repo" });
    await client.createBranch({ branchName: "feature/new", repositoryPath: "/repo" });
    await client.deleteBranch({ branchName: "feature/old", repositoryPath: "/repo" });
    await client.listStashes("/repo");
    await client.createStash({ message: "wip changes", repositoryPath: "/repo" });
    await client.applyStash({ repositoryPath: "/repo", stashRef: "stash@{0}" });
    await client.popStash({ repositoryPath: "/repo", stashRef: "stash@{1}" });
    await client.dropStash({ repositoryPath: "/repo", stashRef: "stash@{2}" });

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
      { args: { repositoryPath: "/repo" }, command: "push_repository" },
      { args: { repositoryPath: "/repo" }, command: "list_branches" },
      { args: { branchName: "feature/worktree", repositoryPath: "/repo" }, command: "checkout_branch" },
      { args: { branchName: "feature/new", repositoryPath: "/repo" }, command: "create_branch" },
      { args: { branchName: "feature/old", repositoryPath: "/repo" }, command: "delete_branch" },
      { args: { repositoryPath: "/repo" }, command: "list_stashes" },
      { args: { message: "wip changes", repositoryPath: "/repo" }, command: "create_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{0}" }, command: "apply_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{1}" }, command: "pop_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{2}" }, command: "drop_stash" }
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
    await expect(client.listBranches("/repo")).resolves.toEqual({
      branches: [
        { branchType: "local", current: true, name: "browser-preview", upstream: "origin/browser-preview" },
        { branchType: "local", current: false, name: "feature/demo-branch", upstream: null },
        { branchType: "remote", current: false, name: "origin/main", upstream: null }
      ]
    });
    await expect(client.listStashes("/repo")).resolves.toEqual([
      { index: 0, message: "Browser preview stash", selector: "stash@{0}" },
      { index: 1, message: "Saved local edits", selector: "stash@{1}" }
    ]);
    await expect(client.checkoutBranch({ branchName: "feature/demo-branch", repositoryPath: "/repo" })).resolves.toEqual({
      command: "git checkout feature/demo-branch",
      stderr: "",
      stdout: "Open the app through Tauri to run mutating Git commands."
    });
    await expect(client.createStash({ message: "", repositoryPath: "/repo" })).resolves.toEqual({
      command: "git stash push",
      stderr: "",
      stdout: "Open the app through Tauri to run mutating Git commands."
    });
  });
});

function responseForCommand(command: string): Promise<RepositoryStatus | FileDiff | GitOperationResult | BranchList | StashEntry[]> {
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

  if (command === "list_branches") {
    return Promise.resolve({ branches: [] });
  }

  if (command === "list_stashes") {
    return Promise.resolve([]);
  }

  return Promise.resolve({
    command,
    stderr: "",
    stdout: ""
  });
}
