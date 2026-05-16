import { invoke } from "@tauri-apps/api/core";

import type {
  BranchList,
  CommitDetails,
  CommitSummary,
  FileDiff,
  GitOperationResult,
  OperationPreview,
  OperationPreviewCommit,
  OperationPreviewKind,
  ProviderAccount,
  ProviderAccountInput,
  ProviderConnectionResult,
  ProviderRemoteList,
  ProviderWorkItemList,
  RepositoryStatus,
  StashEntry
} from "./repository-types";

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

type CommitHistoryArgs = RepositoryPathArgs & {
  query: string;
};

type CommitDetailsArgs = RepositoryPathArgs & {
  commitOid: string;
};

type PreviewMergeArgs = RepositoryPathArgs & {
  sourceBranch: string;
};

type PreviewRebaseArgs = RepositoryPathArgs & {
  targetBranch: string;
};

type InvokeCommand = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export type RepositoryClient = {
  getRepositoryStatus(repositoryPath: string): Promise<RepositoryStatus>;
  listProviderRemotes(repositoryPath: string): Promise<ProviderRemoteList>;
  listProviderWorkItems(repositoryPath: string): Promise<ProviderWorkItemList>;
  listProviderAccounts(): Promise<ProviderAccount[]>;
  saveProviderAccount(input: ProviderAccountInput): Promise<ProviderAccount>;
  deleteProviderAccount(accountId: string): Promise<GitOperationResult>;
  testProviderConnection(accountId: string): Promise<ProviderConnectionResult>;
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
  listCommitHistory(args: CommitHistoryArgs): Promise<CommitSummary[]>;
  getCommitDetails(args: CommitDetailsArgs): Promise<CommitDetails>;
  previewMerge(args: PreviewMergeArgs): Promise<OperationPreview>;
  previewRebase(args: PreviewRebaseArgs): Promise<OperationPreview>;
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
    getCommitDetails(args) {
      return invokeCommand<CommitDetails>("get_commit_details", args);
    },
    previewMerge(args) {
      return invokeCommand<OperationPreview>("preview_merge", args);
    },
    previewRebase(args) {
      return invokeCommand<OperationPreview>("preview_rebase", args);
    },
    getRepositoryStatus(repositoryPath) {
      return invokeCommand<RepositoryStatus>("get_repository_status", { repositoryPath });
    },
    listProviderRemotes(repositoryPath) {
      return invokeCommand<ProviderRemoteList>("list_provider_remotes", { repositoryPath });
    },
    listProviderWorkItems(repositoryPath) {
      return invokeCommand<ProviderWorkItemList>("list_provider_work_items", { repositoryPath });
    },
    listProviderAccounts() {
      return invokeCommand<ProviderAccount[]>("list_provider_accounts", {});
    },
    saveProviderAccount(input) {
      return invokeCommand<ProviderAccount>("save_provider_account", { input });
    },
    deleteProviderAccount(accountId) {
      return invokeCommand<GitOperationResult>("delete_provider_account", { accountId });
    },
    testProviderConnection(accountId) {
      return invokeCommand<ProviderConnectionResult>("test_provider_connection", { accountId });
    },
    listBranches(repositoryPath) {
      return invokeCommand<BranchList>("list_branches", { repositoryPath });
    },
    listStashes(repositoryPath) {
      return invokeCommand<StashEntry[]>("list_stashes", { repositoryPath });
    },
    listCommitHistory(args) {
      return invokeCommand<CommitSummary[]>("list_commit_history", args);
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
    getCommitDetails(args) {
      const details =
        browserCommitDetails.find((commitDetails) => commitDetails.commit.oid === args.commitOid) ?? browserCommitDetails[0];
      return Promise.resolve(details);
    },
    previewMerge(args) {
      return Promise.resolve(
        browserOperationPreview({
          command: `git merge ${args.sourceBranch}`,
          kind: "merge",
          message: `Preview merge from ${args.sourceBranch} into browser-preview.`,
          sourceBranch: args.sourceBranch,
          targetBranch: "browser-preview"
        })
      );
    },
    previewRebase(args) {
      return Promise.resolve(
        browserOperationPreview({
          command: `git rebase ${args.targetBranch}`,
          kind: "rebase",
          message: `Preview rebase from browser-preview onto ${args.targetBranch}.`,
          sourceBranch: "browser-preview",
          targetBranch: args.targetBranch
        })
      );
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
    listProviderRemotes() {
      return Promise.resolve({
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
    },
    listProviderWorkItems() {
      return Promise.resolve(browserProviderWorkItems);
    },
    listProviderAccounts() {
      return Promise.resolve(Array.from(browserProviderAccounts.values()).map(copyProviderAccount));
    },
    saveProviderAccount(input) {
      const account = createBrowserProviderAccount(input);
      browserProviderAccounts.set(account.id, account);
      return Promise.resolve(copyProviderAccount(account));
    },
    deleteProviderAccount(accountId) {
      browserProviderAccounts.delete(accountId);
      return Promise.resolve({
        command: `delete_provider_account ${accountId}`,
        stderr: "",
        stdout: "Provider account removed from browser preview state."
      });
    },
    testProviderConnection(accountId) {
      const account = browserProviderAccounts.get(accountId);
      return Promise.resolve({
        accountId,
        message:
          account === undefined
            ? "Provider account not found in browser preview state."
            : `Browser preview simulated connection for ${account.label}.`,
        ok: account !== undefined,
        statusCode: account === undefined ? null : 200
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
    listCommitHistory(args) {
      const query = args.query.trim().toLocaleLowerCase();
      if (query.length === 0) {
        return Promise.resolve(browserCommitHistory);
      }

      return Promise.resolve(browserCommitHistory.filter((commit) => isBrowserCommitMatch(commit, query)));
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

export function listProviderRemotes(repositoryPath: string): Promise<ProviderRemoteList> {
  return repositoryClient.listProviderRemotes(repositoryPath);
}

export function listProviderWorkItems(repositoryPath: string): Promise<ProviderWorkItemList> {
  return repositoryClient.listProviderWorkItems(repositoryPath);
}

export function listProviderAccounts(): Promise<ProviderAccount[]> {
  return repositoryClient.listProviderAccounts();
}

export function saveProviderAccount(input: ProviderAccountInput): Promise<ProviderAccount> {
  return repositoryClient.saveProviderAccount(input);
}

export function deleteProviderAccount(accountId: string): Promise<GitOperationResult> {
  return repositoryClient.deleteProviderAccount(accountId);
}

export function testProviderConnection(accountId: string): Promise<ProviderConnectionResult> {
  return repositoryClient.testProviderConnection(accountId);
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

export function listCommitHistory(args: CommitHistoryArgs): Promise<CommitSummary[]> {
  return repositoryClient.listCommitHistory(args);
}

export function getCommitDetails(args: CommitDetailsArgs): Promise<CommitDetails> {
  return repositoryClient.getCommitDetails(args);
}

export function previewMerge(args: PreviewMergeArgs): Promise<OperationPreview> {
  return repositoryClient.previewMerge(args);
}

export function previewRebase(args: PreviewRebaseArgs): Promise<OperationPreview> {
  return repositoryClient.previewRebase(args);
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

function browserOperationPreview(args: {
  command: string;
  kind: OperationPreviewKind;
  message: string;
  sourceBranch: string;
  targetBranch: string;
}): OperationPreview {
  return {
    changedFiles: ["src/app/App.tsx", "src/features/repository/repository-client.ts"],
    command: args.command,
    commits: [browserOperationPreviewCommit(browserCommitHistory[0])],
    kind: args.kind,
    likelyConflictFiles: ["src/app/App.tsx"],
    message: args.message,
    sourceBranch: args.sourceBranch,
    targetBranch: args.targetBranch
  };
}

function browserOperationPreviewCommit(commit: CommitSummary): OperationPreviewCommit {
  return {
    authorEmail: commit.authorEmail,
    authorName: commit.authorName,
    authoredAt: commit.authoredAt,
    oid: commit.oid,
    shortOid: commit.shortOid,
    subject: commit.subject
  };
}

const browserProviderAccounts = new Map<string, ProviderAccount>();

const browserProviderWorkItems: ProviderWorkItemList = {
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
};

function createBrowserProviderAccount(input: ProviderAccountInput): ProviderAccount {
  const baseUrl = input.baseUrl.trim();
  const label = input.label.trim();

  return {
    baseUrl,
    id: `browser-${input.providerKind}-${slugBrowserAccountPart(baseUrl)}-${slugBrowserAccountPart(label)}`,
    label,
    providerKind: input.providerKind,
    tokenConfigured: input.token.trim().length > 0
  };
}

function copyProviderAccount(account: ProviderAccount): ProviderAccount {
  return { ...account };
}

function slugBrowserAccountPart(value: string): string {
  const slug = value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.length === 0 ? "account" : slug;
}

function isBrowserCommitMatch(commit: CommitSummary, query: string): boolean {
  return (
    commit.subject.toLocaleLowerCase().includes(query) ||
    commit.authorName.toLocaleLowerCase().includes(query) ||
    commit.authorEmail.toLocaleLowerCase().includes(query) ||
    commit.oid.toLocaleLowerCase().includes(query) ||
    commit.shortOid.toLocaleLowerCase().includes(query) ||
    commit.refs.some((commitRef) => commitRef.toLocaleLowerCase().includes(query))
  );
}

const browserCommitHistory: CommitSummary[] = [
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
];

const browserCommitDetails: CommitDetails[] = [
  {
    body: "Show commit history and changed files in the browser preview.",
    commit: browserCommitHistory[0],
    diffText: `diff --git a/src/app/App.tsx b/src/app/App.tsx
index 1111111..2222222 100644
--- a/src/app/App.tsx
+++ b/src/app/App.tsx
@@ -1,3 +1,4 @@
 import { Button } from "@/components/ui/button";
+import { Badge } from "@/components/ui/badge";

 export function App() {
   return <GitWorkbench />;
`,
    files: [
      {
        additions: 42,
        changeType: "modified",
        deletions: 8,
        path: "src/app/App.tsx",
        previousPath: null
      }
    ]
  },
  {
    body: "Create the initial repository status workspace used by the preview.",
    commit: browserCommitHistory[1],
    diffText: `diff --git a/src/features/repository/repository-client.ts b/src/features/repository/repository-client.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/features/repository/repository-client.ts
@@ -0,0 +1,3 @@
+export function getRepositoryStatus() {
+  return Promise.resolve();
+}
`,
    files: [
      {
        additions: 73,
        changeType: "added",
        deletions: 0,
        path: "src/features/repository/repository-client.ts",
        previousPath: null
      }
    ]
  }
];
