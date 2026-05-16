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
  conflict: boolean;
};

export type RepositoryStatus = {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: StatusFile[];
};

export type ConflictOperation = "none" | "merge" | "rebase";

export type ConflictFile = {
  path: string;
  indexStatus: GitFileStatus;
  worktreeStatus: GitFileStatus;
};

export type ConflictState = {
  operation: ConflictOperation;
  files: ConflictFile[];
  canAbortMerge: boolean;
  canAbortRebase: boolean;
  canContinueRebase: boolean;
  message: string;
};

export type ProviderKind = "github" | "gitlab" | "customGitlab" | "unknown";
export type ProviderAccountKind = Exclude<ProviderKind, "unknown">;

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

export type ProviderAccount = {
  id: string;
  providerKind: ProviderAccountKind;
  baseUrl: string;
  label: string;
  tokenConfigured: boolean;
};

export type ProviderAccountInput = {
  providerKind: ProviderAccountKind;
  baseUrl: string;
  label: string;
  token: string;
};

export type ProviderCheckStatus = "pending" | "running" | "success" | "failed" | "canceled" | "unknown";

export type ProviderWorkItem = {
  id: string;
  providerKind: ProviderAccountKind;
  accountId: string | null;
  providerBaseUrl: string;
  remoteName: string;
  title: string;
  author: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  state: string;
  webUrl: string | null;
  ciUrl: string | null;
  checkStatus: ProviderCheckStatus;
};

export type ProviderWorkItemList = {
  items: ProviderWorkItem[];
  message: string;
};

export type ProviderConnectionResult = {
  accountId: string;
  ok: boolean;
  statusCode: number | null;
  message: string;
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

export type OperationPreviewKind = "merge" | "rebase";

export type OperationPreviewCommit = {
  oid: string;
  shortOid: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string;
};

export type OperationPreview = {
  kind: OperationPreviewKind;
  sourceBranch: string;
  targetBranch: string;
  command: string;
  message: string;
  commits: OperationPreviewCommit[];
  changedFiles: string[];
  likelyConflictFiles: string[];
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
