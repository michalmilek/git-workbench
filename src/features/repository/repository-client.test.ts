import { describe, expect, test } from "vitest";

import { createRepositoryClient, getBrowserRepositoryClient } from "./repository-client";
import type {
  BranchList,
  FileDiff,
  GitOperationResult,
  OperationPreview,
  ProviderAccount,
  ProviderConnectionResult,
  ProviderWorkItemList,
  ProviderRemoteList,
  RepositoryStatus,
  StashEntry
} from "./repository-types";

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

    expect(client).toEqual(
      expect.objectContaining({
        previewMerge: expect.any(Function),
        previewRebase: expect.any(Function)
      })
    );

    await client.getRepositoryStatus("/repo");
    await client.listProviderRemotes("/repo");
    await client.listProviderWorkItems("/repo");
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
    await client.listCommitHistory({ query: "feature history", repositoryPath: "/repo" });
    await client.getCommitDetails({ commitOid: "abc1234", repositoryPath: "/repo" });
    await client.previewMerge({ repositoryPath: "/repo", sourceBranch: "feature/operation-previews" });
    await client.previewRebase({ repositoryPath: "/repo", targetBranch: "origin/main" });
    await client.createStash({ message: "wip changes", repositoryPath: "/repo" });
    await client.applyStash({ repositoryPath: "/repo", stashRef: "stash@{0}" });
    await client.popStash({ repositoryPath: "/repo", stashRef: "stash@{1}" });
    await client.dropStash({ repositoryPath: "/repo", stashRef: "stash@{2}" });
    await client.listProviderAccounts();
    await client.saveProviderAccount({
      baseUrl: "https://gitlab.company.test",
      label: "Company GitLab",
      providerKind: "customGitlab",
      token: "secret-token"
    });
    await client.deleteProviderAccount("company-gitlab");
    await client.testProviderConnection("company-gitlab");

    expect(calls).toEqual([
      { args: { repositoryPath: "/repo" }, command: "get_repository_status" },
      { args: { repositoryPath: "/repo" }, command: "list_provider_remotes" },
      { args: { repositoryPath: "/repo" }, command: "list_provider_work_items" },
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
      { args: { query: "feature history", repositoryPath: "/repo" }, command: "list_commit_history" },
      { args: { commitOid: "abc1234", repositoryPath: "/repo" }, command: "get_commit_details" },
      {
        args: { repositoryPath: "/repo", sourceBranch: "feature/operation-previews" },
        command: "preview_merge"
      },
      { args: { repositoryPath: "/repo", targetBranch: "origin/main" }, command: "preview_rebase" },
      { args: { message: "wip changes", repositoryPath: "/repo" }, command: "create_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{0}" }, command: "apply_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{1}" }, command: "pop_stash" },
      { args: { repositoryPath: "/repo", stashRef: "stash@{2}" }, command: "drop_stash" },
      { args: {}, command: "list_provider_accounts" },
      {
        args: {
          input: {
            baseUrl: "https://gitlab.company.test",
            label: "Company GitLab",
            providerKind: "customGitlab",
            token: "secret-token"
          }
        },
        command: "save_provider_account"
      },
      { args: { accountId: "company-gitlab" }, command: "delete_provider_account" },
      { args: { accountId: "company-gitlab" }, command: "test_provider_connection" }
    ]);
  });
});

describe("browser repository client", () => {
  test("returns demo status and clear mutating operation output", async () => {
    const client = getBrowserRepositoryClient();

    expect(client).toEqual(
      expect.objectContaining({
        previewMerge: expect.any(Function),
        previewRebase: expect.any(Function)
      })
    );

    await expect(client.getRepositoryStatus("/repo")).resolves.toMatchObject({
      branch: "browser-preview",
      files: expect.arrayContaining([expect.objectContaining({ path: "src/app/App.tsx" })])
    });
    await expect(client.listProviderRemotes("/repo")).resolves.toEqual({
      remotes: [
        {
          fetchUrl: "git@github.com:openai/codex.git",
          host: "github.com",
          owner: "openai",
          providerKind: "github",
          pushUrl: "git@github.com:openai/codex.git",
          remoteName: "origin",
          repository: "codex",
          webUrl: "https://github.com/openai/codex"
        },
        {
          fetchUrl: "ssh://git@gitlab.company.test/platform/workbench.git",
          host: "gitlab.company.test",
          owner: "platform",
          providerKind: "customGitlab",
          pushUrl: null,
          remoteName: "company",
          repository: "workbench",
          webUrl: "https://gitlab.company.test/platform/workbench"
        }
      ]
    });
    await expect(client.listProviderWorkItems("/repo")).resolves.toEqual({
      items: [
        {
          accountId: "browser-github-github-com-personal-github",
          author: "alex-rivera",
          checkStatus: "running",
          ciUrl: "https://github.com/openai/codex/actions/runs/1516",
          id: "github:origin:42",
          providerBaseUrl: "https://github.com",
          providerKind: "github",
          remoteName: "origin",
          sourceBranch: "feature/provider-work-panel",
          state: "open",
          targetBranch: "main",
          title: "Add provider work panel",
          webUrl: "https://github.com/openai/codex/pull/42"
        },
        {
          accountId: "browser-customGitlab-gitlab-company-test-company-gitlab",
          author: "sam-chen",
          checkStatus: "failed",
          ciUrl: "https://gitlab.company.test/platform/workbench/-/pipelines/20260516",
          id: "gitlab:company:17",
          providerBaseUrl: "https://gitlab.company.test",
          providerKind: "customGitlab",
          remoteName: "company",
          sourceBranch: "fix/provider-refresh",
          state: "opened",
          targetBranch: "main",
          title: "Refresh provider work after account changes",
          webUrl: "https://gitlab.company.test/platform/workbench/-/merge_requests/17"
        }
      ],
      message: "Browser preview provider work items."
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
    await expect(client.listCommitHistory({ query: "", repositoryPath: "/repo" })).resolves.toEqual([
      {
        authorEmail: "alex@example.test",
        authorName: "Alex Rivera",
        authoredAt: "2026-05-16T09:15:00+02:00",
        oid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        parents: ["6f5e4d3c2b1a0987654321fedcba9876543210ab"],
        refs: ["HEAD", "browser-preview"],
        shortOid: "a1b2c3d",
        subject: "Add repository history view"
      },
      {
        authorEmail: "sam@example.test",
        authorName: "Sam Chen",
        authoredAt: "2026-05-15T17:42:00+02:00",
        oid: "6f5e4d3c2b1a0987654321fedcba9876543210ab",
        parents: [],
        refs: ["origin/main"],
        shortOid: "6f5e4d3",
        subject: "Wire repository status panel"
      }
    ]);
    await expect(
      client.getCommitDetails({
        commitOid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        repositoryPath: "/repo"
      })
    ).resolves.toMatchObject({
      body: "Show commit history and changed files in the browser preview.",
      commit: {
        oid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
        subject: "Add repository history view"
      },
      diffText: expect.stringContaining("diff --git a/src/app/App.tsx b/src/app/App.tsx"),
      files: [
        {
          additions: 42,
          changeType: "modified",
          deletions: 8,
          path: "src/app/App.tsx",
          previousPath: null
        }
      ]
    });
    await expect(client.previewMerge({ repositoryPath: "/repo", sourceBranch: "feature/demo-branch" })).resolves.toEqual({
      changedFiles: ["src/app/App.tsx", "src/features/repository/repository-client.ts"],
      command: "git merge feature/demo-branch",
      commits: [
        {
          authorEmail: "alex@example.test",
          authorName: "Alex Rivera",
          authoredAt: "2026-05-16T09:15:00+02:00",
          oid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          shortOid: "a1b2c3d",
          subject: "Add repository history view"
        }
      ],
      kind: "merge",
      likelyConflictFiles: ["src/app/App.tsx"],
      message: "Preview merge from feature/demo-branch into browser-preview.",
      sourceBranch: "feature/demo-branch",
      targetBranch: "browser-preview"
    });
    await expect(client.previewRebase({ repositoryPath: "/repo", targetBranch: "origin/main" })).resolves.toEqual({
      changedFiles: ["src/app/App.tsx", "src/features/repository/repository-client.ts"],
      command: "git rebase origin/main",
      commits: [
        {
          authorEmail: "alex@example.test",
          authorName: "Alex Rivera",
          authoredAt: "2026-05-16T09:15:00+02:00",
          oid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
          shortOid: "a1b2c3d",
          subject: "Add repository history view"
        }
      ],
      kind: "rebase",
      likelyConflictFiles: ["src/app/App.tsx"],
      message: "Preview rebase from browser-preview onto origin/main.",
      sourceBranch: "browser-preview",
      targetBranch: "origin/main"
    });
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

  test("persists provider accounts in memory without returning saved tokens", async () => {
    const client = getBrowserRepositoryClient();
    const input = {
      baseUrl: "https://github.com",
      label: "Personal GitHub",
      providerKind: "github" as const,
      token: "very-secret-token"
    };

    const savedAccount = await client.saveProviderAccount(input);

    expect(savedAccount).toMatchObject({
      baseUrl: "https://github.com",
      label: "Personal GitHub",
      providerKind: "github",
      tokenConfigured: true
    });
    expect(JSON.stringify(savedAccount)).not.toContain(input.token);

    await expect(client.listProviderAccounts()).resolves.toContainEqual(savedAccount);

    await expect(client.testProviderConnection(savedAccount.id)).resolves.toEqual({
      accountId: savedAccount.id,
      message: "Browser preview simulated connection for Personal GitHub.",
      ok: true,
      statusCode: 200
    });

    await expect(client.deleteProviderAccount(savedAccount.id)).resolves.toEqual({
      command: `delete_provider_account ${savedAccount.id}`,
      stderr: "",
      stdout: "Provider account removed from browser preview state."
    });
    await expect(client.listProviderAccounts()).resolves.not.toContainEqual(savedAccount);
  });
});

function responseForCommand(
  command: string
): Promise<
  | RepositoryStatus
  | FileDiff
  | GitOperationResult
  | OperationPreview
  | BranchList
  | StashEntry[]
  | ProviderRemoteList
  | ProviderWorkItemList
  | ProviderAccount[]
  | ProviderAccount
  | ProviderConnectionResult
> {
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

  if (command === "list_provider_remotes") {
    return Promise.resolve({ remotes: [] });
  }

  if (command === "list_provider_work_items") {
    return Promise.resolve({ items: [], message: "No provider work items." });
  }

  if (command === "list_provider_accounts") {
    return Promise.resolve([]);
  }

  if (command === "save_provider_account") {
    return Promise.resolve({
      baseUrl: "https://gitlab.company.test",
      id: "company-gitlab",
      label: "Company GitLab",
      providerKind: "customGitlab",
      tokenConfigured: true
    });
  }

  if (command === "test_provider_connection") {
    return Promise.resolve({
      accountId: "company-gitlab",
      message: "Connected",
      ok: true,
      statusCode: 200
    });
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
