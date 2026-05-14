import { invoke } from "@tauri-apps/api/core";

import type { FileDiff, GitOperationResult, RepositoryStatus } from "./repository-types";

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
};

export function createRepositoryClient(invokeCommand: InvokeCommand): RepositoryClient {
  return {
    commitChanges(args) {
      return invokeCommand<GitOperationResult>("commit_changes", args);
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
    commitChanges(args) {
      return Promise.resolve(browserMutationResult(`git commit -m ${args.summary}`));
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
