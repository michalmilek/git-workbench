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
