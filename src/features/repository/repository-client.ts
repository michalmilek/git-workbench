import { invoke } from "@tauri-apps/api/core";

import type { BranchList, FileDiff, GitOperationResult, RepositoryStatus, StashEntry } from "./repository-types";

type RepositoryPathArgs = {
  repositoryPath: string;
};

type FileDiffArgs = RepositoryPathArgs & {
  filePath: string;
  staged: boolean;
};

type FileOperationArgs = RepositoryPathArgs & {
  filePath: string;
};

type CommitArgs = RepositoryPathArgs & {
  summary: string;
  body: string;
  amend: boolean;
};

type BranchNameArgs = RepositoryPathArgs & {
  branchName: string;
};

type CreateStashArgs = RepositoryPathArgs & {
  message: string;
};

type StashRefArgs = RepositoryPathArgs & {
  stashRef: string;
};

type InvokeCommand = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export type RepositoryClient = {
  getRepositoryStatus(repositoryPath: string): Promise<RepositoryStatus>;
  getFileDiff(args: FileDiffArgs): Promise<FileDiff>;
  stageFile(args: FileOperationArgs): Promise<GitOperationResult>;
  unstageFile(args: FileOperationArgs): Promise<GitOperationResult>;
  commitChanges(args: CommitArgs): Promise<GitOperationResult>;
  fetchRepository(args: RepositoryPathArgs): Promise<GitOperationResult>;
  pullRepository(args: RepositoryPathArgs): Promise<GitOperationResult>;
  pushRepository(args: RepositoryPathArgs): Promise<GitOperationResult>;
  listBranches(repositoryPath: string): Promise<BranchList>;
  checkoutBranch(args: BranchNameArgs): Promise<GitOperationResult>;
  createBranch(args: BranchNameArgs): Promise<GitOperationResult>;
  deleteBranch(args: BranchNameArgs): Promise<GitOperationResult>;
  listStashes(repositoryPath: string): Promise<StashEntry[]>;
  createStash(args: CreateStashArgs): Promise<GitOperationResult>;
  applyStash(args: StashRefArgs): Promise<GitOperationResult>;
  popStash(args: StashRefArgs): Promise<GitOperationResult>;
  dropStash(args: StashRefArgs): Promise<GitOperationResult>;
};

export function createRepositoryClient(invokeCommand: InvokeCommand): RepositoryClient {
  return {
    commitChanges(args) {
      return invokeCommand<GitOperationResult>("commit_changes", args);
    },
    applyStash(args) {
      return invokeCommand<GitOperationResult>("apply_stash", args);
    },
    checkoutBranch(args) {
      return invokeCommand<GitOperationResult>("checkout_branch", args);
    },
    createBranch(args) {
      return invokeCommand<GitOperationResult>("create_branch", args);
    },
    createStash(args) {
      return invokeCommand<GitOperationResult>("create_stash", args);
    },
    deleteBranch(args) {
      return invokeCommand<GitOperationResult>("delete_branch", args);
    },
    dropStash(args) {
      return invokeCommand<GitOperationResult>("drop_stash", args);
    },
    fetchRepository(args) {
      return invokeCommand<GitOperationResult>("fetch_repository", args);
    },
    getFileDiff(args) {
      return invokeCommand<FileDiff>("get_file_diff", args);
    },
    getRepositoryStatus(repositoryPath) {
      return invokeCommand<RepositoryStatus>("get_repository_status", { repositoryPath });
    },
    listBranches(repositoryPath) {
      return invokeCommand<BranchList>("list_branches", { repositoryPath });
    },
    listStashes(repositoryPath) {
      return invokeCommand<StashEntry[]>("list_stashes", { repositoryPath });
    },
    popStash(args) {
      return invokeCommand<GitOperationResult>("pop_stash", args);
    },
    pullRepository(args) {
      return invokeCommand<GitOperationResult>("pull_repository", args);
    },
    pushRepository(args) {
      return invokeCommand<GitOperationResult>("push_repository", args);
    },
    stageFile(args) {
      return invokeCommand<GitOperationResult>("stage_file", args);
    },
    unstageFile(args) {
      return invokeCommand<GitOperationResult>("unstage_file", args);
    }
  };
}

export function getBrowserRepositoryClient(): RepositoryClient {
  return {
    applyStash(args) {
      return Promise.resolve(browserMutationResult(`git stash apply ${args.stashRef}`));
    },
    checkoutBranch(args) {
      return Promise.resolve(browserMutationResult(`git checkout ${args.branchName}`));
    },
    commitChanges(args) {
      return Promise.resolve(browserMutationResult(`git commit -m ${args.summary}`));
    },
    createBranch(args) {
      return Promise.resolve(browserMutationResult(`git branch ${args.branchName}`));
    },
    createStash(args) {
      const message = args.message.trim();
      return Promise.resolve(browserMutationResult(message.length === 0 ? "git stash push" : `git stash push -m ${message}`));
    },
    deleteBranch(args) {
      return Promise.resolve(browserMutationResult(`git branch -d ${args.branchName}`));
    },
    dropStash(args) {
      return Promise.resolve(browserMutationResult(`git stash drop ${args.stashRef}`));
    },
    fetchRepository() {
      return Promise.resolve(browserMutationResult("git fetch"));
    },
    getFileDiff(args) {
      return Promise.resolve({
        isBinary: false,
        path: args.filePath,
        text: `diff --git a/${args.filePath} b/${args.filePath}
--- a/${args.filePath}
+++ b/${args.filePath}
@@ -1,2 +1,3 @@
 export function App() {
+  return <GitWorkbench />;
 }
`
      });
    },
    getRepositoryStatus(repositoryPath) {
      return Promise.resolve({
        ahead: 1,
        behind: 0,
        branch: "browser-preview",
        files: [
          { indexStatus: "modified", path: "src/app/App.tsx", worktreeStatus: "modified" },
          { indexStatus: "added", path: "src/features/repository/repository-client.ts", worktreeStatus: "unmodified" },
          { indexStatus: "untracked", path: "scratch file.txt", worktreeStatus: "untracked" }
        ],
        upstream: repositoryPath
      });
    },
    listBranches() {
      return Promise.resolve({
        branches: [
          { branchType: "local", current: true, name: "browser-preview", upstream: "origin/browser-preview" },
          { branchType: "local", current: false, name: "feature/demo-branch", upstream: null },
          { branchType: "remote", current: false, name: "origin/main", upstream: null }
        ]
      });
    },
    listStashes() {
      return Promise.resolve([
        { index: 0, message: "Browser preview stash", selector: "stash@{0}" },
        { index: 1, message: "Saved local edits", selector: "stash@{1}" }
      ]);
    },
    popStash(args) {
      return Promise.resolve(browserMutationResult(`git stash pop ${args.stashRef}`));
    },
    pullRepository() {
      return Promise.resolve(browserMutationResult("git pull"));
    },
    pushRepository() {
      return Promise.resolve(browserMutationResult("git push"));
    },
    stageFile(args) {
      return Promise.resolve(browserMutationResult(`git add -- ${args.filePath}`));
    },
    unstageFile(args) {
      return Promise.resolve(browserMutationResult(`git restore --staged -- ${args.filePath}`));
    }
  };
}

const repositoryClient = hasTauriRuntime() ? createRepositoryClient(invoke) : getBrowserRepositoryClient();

export function getRepositoryStatus(repositoryPath: string): Promise<RepositoryStatus> {
  return repositoryClient.getRepositoryStatus(repositoryPath);
}

export function getFileDiff(args: FileDiffArgs): Promise<FileDiff> {
  return repositoryClient.getFileDiff(args);
}

export function stageFile(args: FileOperationArgs): Promise<GitOperationResult> {
  return repositoryClient.stageFile(args);
}

export function unstageFile(args: FileOperationArgs): Promise<GitOperationResult> {
  return repositoryClient.unstageFile(args);
}

export function commitChanges(args: CommitArgs): Promise<GitOperationResult> {
  return repositoryClient.commitChanges(args);
}

export function fetchRepository(args: RepositoryPathArgs): Promise<GitOperationResult> {
  return repositoryClient.fetchRepository(args);
}

export function pullRepository(args: RepositoryPathArgs): Promise<GitOperationResult> {
  return repositoryClient.pullRepository(args);
}

export function pushRepository(args: RepositoryPathArgs): Promise<GitOperationResult> {
  return repositoryClient.pushRepository(args);
}

export function listBranches(repositoryPath: string): Promise<BranchList> {
  return repositoryClient.listBranches(repositoryPath);
}

export function checkoutBranch(args: BranchNameArgs): Promise<GitOperationResult> {
  return repositoryClient.checkoutBranch(args);
}

export function createBranch(args: BranchNameArgs): Promise<GitOperationResult> {
  return repositoryClient.createBranch(args);
}

export function deleteBranch(args: BranchNameArgs): Promise<GitOperationResult> {
  return repositoryClient.deleteBranch(args);
}

export function listStashes(repositoryPath: string): Promise<StashEntry[]> {
  return repositoryClient.listStashes(repositoryPath);
}

export function createStash(args: CreateStashArgs): Promise<GitOperationResult> {
  return repositoryClient.createStash(args);
}

export function applyStash(args: StashRefArgs): Promise<GitOperationResult> {
  return repositoryClient.applyStash(args);
}

export function popStash(args: StashRefArgs): Promise<GitOperationResult> {
  return repositoryClient.popStash(args);
}

export function dropStash(args: StashRefArgs): Promise<GitOperationResult> {
  return repositoryClient.dropStash(args);
}

function hasTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function browserMutationResult(command: string): GitOperationResult {
  return {
    command,
    stderr: "",
    stdout: "Open the app through Tauri to run mutating Git commands."
  };
}
