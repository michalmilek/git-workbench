export type GitFileStatus =
  | "unmodified"
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged"
  | "untracked"
  | "ignored"
  | "unknown";

export type StatusFile = {
  path: string;
  indexStatus: GitFileStatus;
  worktreeStatus: GitFileStatus;
};

export type RepositoryStatus = {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: StatusFile[];
};

export type FileDiff = {
  path: string;
  text: string;
  isBinary: boolean;
};

export type GitOperationResult = {
  command: string;
  stdout: string;
  stderr: string;
};

export type DiffMode = "worktree" | "staged";

export type BranchInfo = {
  name: string;
  branchType: "local" | "remote";
  current: boolean;
  upstream: string | null;
};

export type BranchList = {
  branches: BranchInfo[];
};

export type StashEntry = {
  selector: string;
  index: number;
  message: string;
};
