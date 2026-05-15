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

export type ProviderKind = "github" | "gitlab" | "customGitlab" | "unknown";

export type ProviderRemote = {
  remoteName: string;
  providerKind: ProviderKind;
  host: string | null;
  owner: string | null;
  repository: string | null;
  fetchUrl: string | null;
  pushUrl: string | null;
  webUrl: string | null;
};

export type ProviderRemoteList = {
  remotes: ProviderRemote[];
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

export type CommitSummary = {
  oid: string;
  shortOid: string;
  parents: string[];
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  refs: string[];
};

export type CommitChangedFile = {
  path: string;
  previousPath: string | null;
  changeType: "added" | "modified" | "deleted" | "renamed" | "copied" | "binary" | "unknown";
  additions: number | null;
  deletions: number | null;
};

export type CommitDetails = {
  commit: CommitSummary;
  body: string;
  files: CommitChangedFile[];
  diffText: string;
};
