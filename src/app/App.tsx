import {
  IconCloudUpload,
  IconDownload,
  IconFileDiff,
  IconFolderOpen,
  IconGitBranch,
  IconGitCommit,
  IconHistory,
  IconInbox,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconStack2,
  IconTrash,
  IconUpload
} from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  COMMAND_LOG_STORAGE_KEY,
  addCommandLogEntry,
  parseCommandLog,
  serializeCommandLog,
  type CommandLogEntry
} from "@/features/repository/command-log";
import { isCommitSummaryValid } from "@/features/repository/commit-validation";
import {
  applyStash,
  checkoutBranch,
  commitChanges,
  createBranch,
  createStash,
  deleteBranch,
  dropStash,
  fetchRepository,
  getFileDiff,
  getRepositoryStatus,
  listBranches,
  listStashes,
  popStash,
  pullRepository,
  pushRepository,
  stageFile,
  unstageFile
} from "@/features/repository/repository-client";
import {
  RECENT_REPOSITORIES_STORAGE_KEY,
  parseRecentRepositories,
  serializeRecentRepositories,
  updateRecentRepositories
} from "@/features/repository/repository-recents";
import {
  getPreferredDiffMode,
  hasRepositoryStagedChanges,
  hasStagedChanges,
  hasWorktreeChanges,
  summarizeRepositoryStatus
} from "@/features/repository/repository-status";
import type {
  BranchInfo,
  DiffMode,
  FileDiff,
  GitOperationResult,
  RepositoryStatus,
  StashEntry,
  StatusFile
} from "@/features/repository/repository-types";
import { cn } from "@/lib/utils";

const navigationItems = [
  { active: true, icon: IconInbox, label: "Changes" },
  { active: false, icon: IconHistory, label: "History" },
  { active: false, icon: IconStack2, label: "Stashes" }
] as const;

type OperationErrorDetails = {
  message: string;
  command?: string;
  stdout?: string;
  stderr?: string;
};

type OperationFeedback =
  | { kind: "result"; result: GitOperationResult }
  | { kind: "error"; error: OperationErrorDetails }
  | null;

type SyncAction = "fetch" | "pull" | "push";
type BranchAction = "checkout-branch" | "create-branch" | "delete-branch";
type StashAction = "create-stash" | "apply-stash" | "pop-stash" | "drop-stash";
type BusyAction =
  | "status"
  | "diff"
  | "stage"
  | "unstage"
  | "commit"
  | SyncAction
  | BranchAction
  | StashAction
  | null;

export function App() {
  const [recentRepositories, setRecentRepositories] = useState(readRecentRepositories);
  const [repositoryPathInput, setRepositoryPathInput] = useState(readInitialRepositoryPath);
  const [repositoryPath, setRepositoryPath] = useState<string | null>(null);
  const [status, setStatus] = useState<RepositoryStatus | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>("worktree");
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [commitSummary, setCommitSummary] = useState("");
  const [commitBody, setCommitBody] = useState("");
  const [amendCommit, setAmendCommit] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchNameInput, setBranchNameInput] = useState("");
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [stashMessage, setStashMessage] = useState("");
  const [selectedStashRef, setSelectedStashRef] = useState<string | null>(null);
  const [commandLog, setCommandLog] = useState(readCommandLogEntries);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<OperationFeedback>(null);
  const diffRequestId = useRef(0);
  const referenceRequestId = useRef(0);
  const commandLogId = useRef(0);

  const summary = useMemo(() => (status === null ? null : summarizeRepositoryStatus(status)), [status]);
  const selectedFile = getSelectedFile(status, selectedFilePath);
  const selectedStash = getSelectedStash(stashes, selectedStashRef);
  const selectedFileHasStagedChanges = selectedFile === null ? false : hasStagedChanges(selectedFile);
  const selectedFileHasWorktreeChanges = selectedFile === null ? false : hasWorktreeChanges(selectedFile);
  const canCommit =
    repositoryPath !== null &&
    status !== null &&
    hasRepositoryStagedChanges(status) &&
    isCommitSummaryValid(commitSummary) &&
    busyAction === null;
  const canCreateBranch = repositoryPath !== null && branchNameInput.trim().length > 0 && busyAction === null;
  const canCreateStash = repositoryPath !== null && busyAction === null;
  const canRunSelectedStashOperation = repositoryPath !== null && selectedStash !== null && busyAction === null;

  async function openRepository() {
    const path = repositoryPathInput.trim();
    if (path.length === 0) {
      setFeedback({ kind: "error", error: { message: "Enter a repository path." } });
      return;
    }

    await loadRepositoryStatus(path, selectedFilePath);
  }

  async function refreshRepository() {
    if (repositoryPath === null) {
      await openRepository();
      return;
    }

    await loadRepositoryStatus(repositoryPath, selectedFilePath);
  }

  async function loadRepositoryStatus(path: string, requestedFilePath: string | null) {
    invalidateDiffRequests();
    const referenceRequest = createReferenceRequest();
    setBusyAction("status");

    try {
      const nextStatus = await getRepositoryStatus(path);
      const nextFile = chooseSelectedFile(nextStatus.files, requestedFilePath);
      const nextDiffMode = nextFile === null ? "worktree" : getPreferredDiffMode(nextFile);

      setRepositoryPath(path);
      setStatus(nextStatus);
      setSelectedFilePath(nextFile?.path ?? null);
      setDiffMode(nextDiffMode);
      setDiff(null);
      rememberRepository(path);

      if (nextFile !== null) {
        await loadFileDiff(path, nextFile.path, nextDiffMode);
      }

      await loadRepositoryReferences(path, referenceRequest);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Refresh repository", operationError);
      setDiff(null);
      setBranches([]);
      setStashes([]);
      setSelectedStashRef(null);
    } finally {
      setBusyAction(null);
    }
  }

  async function loadRepositoryReferences(path: string, requestId: number) {
    await Promise.all([loadRepositoryBranches(path, requestId), loadRepositoryStashes(path, requestId)]);
  }

  async function loadRepositoryBranches(path: string, requestId: number) {
    try {
      const nextBranches = await listBranches(path);
      if (isCurrentReferenceRequest(requestId)) {
        setBranches(nextBranches.branches);
      }
    } catch (error) {
      if (isCurrentReferenceRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("List branches", operationError);
        setBranches([]);
      }
    }
  }

  async function loadRepositoryStashes(path: string, requestId: number) {
    try {
      const nextStashes = await listStashes(path);
      if (isCurrentReferenceRequest(requestId)) {
        setStashes(nextStashes);
        setSelectedStashRef((currentRef) => chooseSelectedStashRef(nextStashes, currentRef));
      }
    } catch (error) {
      if (isCurrentReferenceRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("List stashes", operationError);
        setStashes([]);
        setSelectedStashRef(null);
      }
    }
  }

  async function loadFileDiff(repository: string, filePath: string, mode: DiffMode) {
    const requestId = diffRequestId.current + 1;
    diffRequestId.current = requestId;
    setBusyAction("diff");

    try {
      const nextDiff = await getFileDiff({ repositoryPath: repository, filePath, staged: mode === "staged" });
      if (diffRequestId.current === requestId) {
        setDiff(nextDiff);
      }
    } catch (error) {
      if (diffRequestId.current === requestId) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("Load diff", operationError);
        setDiff(null);
      }
    } finally {
      if (diffRequestId.current === requestId) {
        setBusyAction(null);
      }
    }
  }

  async function selectFile(file: StatusFile) {
    if (repositoryPath === null) {
      return;
    }

    const nextDiffMode = getPreferredDiffMode(file);
    setSelectedFilePath(file.path);
    setDiffMode(nextDiffMode);
    setDiff(null);
    await loadFileDiff(repositoryPath, file.path, nextDiffMode);
  }

  async function showDiffMode(mode: DiffMode) {
    if (repositoryPath === null || selectedFile === null) {
      return;
    }

    setDiffMode(mode);
    setDiff(null);
    await loadFileDiff(repositoryPath, selectedFile.path, mode);
  }

  async function stageSelectedFile() {
    if (repositoryPath === null || selectedFile === null) {
      return;
    }

    invalidateDiffRequests();
    setBusyAction("stage");

    try {
      const result = await stageFile({ repositoryPath, filePath: selectedFile.path });
      setFeedback({ kind: "result", result });
      recordOperationResult("Stage file", result);
      await loadRepositoryStatus(repositoryPath, selectedFile.path);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Stage file", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function unstageSelectedFile() {
    if (repositoryPath === null || selectedFile === null) {
      return;
    }

    invalidateDiffRequests();
    setBusyAction("unstage");

    try {
      const result = await unstageFile({ repositoryPath, filePath: selectedFile.path });
      setFeedback({ kind: "result", result });
      recordOperationResult("Unstage file", result);
      await loadRepositoryStatus(repositoryPath, selectedFile.path);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Unstage file", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function commitCurrentChanges() {
    if (
      repositoryPath === null ||
      status === null ||
      !hasRepositoryStagedChanges(status) ||
      !isCommitSummaryValid(commitSummary)
    ) {
      return;
    }

    invalidateDiffRequests();
    setBusyAction("commit");

    try {
      const result = await commitChanges({
        amend: amendCommit,
        body: commitBody.trim(),
        repositoryPath,
        summary: commitSummary.trim()
      });
      setFeedback({ kind: "result", result });
      recordOperationResult("Commit", result);
      setCommitSummary("");
      setCommitBody("");
      setAmendCommit(false);
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Commit", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function runRepositoryOperation(action: SyncAction) {
    if (repositoryPath === null) {
      return;
    }

    invalidateDiffRequests();
    setBusyAction(action);

    try {
      const result = await runSyncCommand(action, repositoryPath);
      setFeedback({ kind: "result", result });
      recordOperationResult(syncOperationLabel(action), result);
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError(syncOperationLabel(action), operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function checkoutRepositoryBranch(branchName: string) {
    if (repositoryPath === null) {
      return;
    }

    invalidateDiffRequests();
    setBusyAction("checkout-branch");

    try {
      const result = await checkoutBranch({ branchName, repositoryPath });
      setFeedback({ kind: "result", result });
      recordOperationResult("Checkout branch", result);
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Checkout branch", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function createRepositoryBranch() {
    if (repositoryPath === null) {
      return;
    }

    const branchName = branchNameInput.trim();
    if (branchName.length === 0) {
      return;
    }

    setBusyAction("create-branch");

    try {
      const result = await createBranch({ branchName, repositoryPath });
      setFeedback({ kind: "result", result });
      recordOperationResult("Create branch", result);
      setBranchNameInput("");
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Create branch", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteRepositoryBranch(branchName: string) {
    if (repositoryPath === null) {
      return;
    }

    setBusyAction("delete-branch");

    try {
      const result = await deleteBranch({ branchName, repositoryPath });
      setFeedback({ kind: "result", result });
      recordOperationResult("Delete branch", result);
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Delete branch", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function createRepositoryStash() {
    if (repositoryPath === null) {
      return;
    }

    setBusyAction("create-stash");

    try {
      const result = await createStash({ message: stashMessage.trim(), repositoryPath });
      setFeedback({ kind: "result", result });
      recordOperationResult("Create stash", result);
      setStashMessage("");
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Create stash", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function runSelectedStashOperation(action: Exclude<StashAction, "create-stash">) {
    if (repositoryPath === null || selectedStash === null) {
      return;
    }

    setBusyAction(action);

    try {
      const result = await runStashCommand(action, repositoryPath, selectedStash.selector);
      setFeedback({ kind: "result", result });
      recordOperationResult(stashOperationLabel(action), result);
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError(stashOperationLabel(action), operationError);
    } finally {
      setBusyAction(null);
    }
  }

  function rememberRepository(path: string) {
    const nextRepositories = updateRecentRepositories(recentRepositories, path);
    setRecentRepositories(nextRepositories);
    localStorage.setItem(RECENT_REPOSITORIES_STORAGE_KEY, serializeRecentRepositories(nextRepositories));
  }

  function recordOperationResult(operation: string, result: GitOperationResult) {
    saveCommandLogEntry({
      command: result.command,
      id: createCommandLogId(),
      message: result.command,
      operation,
      status: "success",
      stderr: result.stderr,
      stdout: result.stdout,
      timestamp: new Date().toISOString()
    });
  }

  function recordOperationError(operation: string, error: OperationErrorDetails) {
    saveCommandLogEntry({
      command: error.command,
      id: createCommandLogId(),
      message: error.message,
      operation,
      status: "error",
      stderr: error.stderr,
      stdout: error.stdout,
      timestamp: new Date().toISOString()
    });
  }

  function saveCommandLogEntry(entry: CommandLogEntry) {
    setCommandLog((entries) => {
      const nextEntries = addCommandLogEntry(entries, entry);
      localStorage.setItem(COMMAND_LOG_STORAGE_KEY, serializeCommandLog(nextEntries));
      return nextEntries;
    });
  }

  function createCommandLogId(): string {
    commandLogId.current += 1;
    return `${Date.now()}-${commandLogId.current}`;
  }

  function invalidateDiffRequests() {
    diffRequestId.current += 1;
  }

  function createReferenceRequest(): number {
    referenceRequestId.current += 1;
    return referenceRequestId.current;
  }

  function isCurrentReferenceRequest(requestId: number): boolean {
    return referenceRequestId.current === requestId;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="flex min-w-0 flex-col border-r bg-muted/30 p-4">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void openRepository();
            }}
          >
            <div className="flex flex-col gap-1">
              <label className="text-sm text-muted-foreground" htmlFor="repository-path">
                Repository path
              </label>
              <input
                className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                id="repository-path"
                onChange={(event) => {
                  setRepositoryPathInput(event.target.value);
                }}
                placeholder="/Users/name/project"
                value={repositoryPathInput}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busyAction !== null || repositoryPathInput.trim().length === 0} type="submit">
                <IconFolderOpen aria-hidden="true" data-icon="inline-start" />
                Open
              </Button>
              <Button
                disabled={busyAction !== null || (repositoryPath === null && repositoryPathInput.trim().length === 0)}
                onClick={() => {
                  void refreshRepository();
                }}
                type="button"
                variant="outline"
              >
                <IconRefresh aria-hidden="true" data-icon="inline-start" />
                Refresh
              </Button>
            </div>
          </form>

          <div className="mt-5 rounded-md border bg-background p-3">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <IconGitBranch aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{summary?.branchLabel ?? "No repository opened"}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{summary?.syncLabel ?? "Open a repository to load Git status"}</p>
            {status?.upstream === undefined || status.upstream === null ? null : (
              <p className="mt-1 truncate text-xs text-muted-foreground">{status.upstream}</p>
            )}
          </div>

          <div className="mt-5 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <IconGitBranch aria-hidden="true" className="size-4 shrink-0" />
                Branches
              </div>
              <Badge variant="secondary">{branches.length}</Badge>
            </div>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createRepositoryBranch();
              }}
            >
              <label className="sr-only" htmlFor="branch-name">
                New branch name
              </label>
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                id="branch-name"
                onChange={(event) => {
                  setBranchNameInput(event.target.value);
                }}
                placeholder="feature/name"
                value={branchNameInput}
              />
              <Button disabled={!canCreateBranch} size="sm" type="submit" variant="secondary">
                <IconPlus aria-hidden="true" data-icon="inline-start" />
                Create
              </Button>
            </form>

            <div className="mt-3 flex max-h-60 flex-col gap-1 overflow-auto">
              {branches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Open or refresh a repository to list branches.</p>
              ) : (
                branches.map((branch) => (
                  <div className="flex min-w-0 items-stretch gap-1 rounded-md hover:bg-muted" key={`${branch.branchType}:${branch.name}`}>
                    <button
                      className="min-w-0 flex-1 rounded-md px-2 py-2 text-left text-sm disabled:cursor-default"
                      disabled={busyAction !== null || repositoryPath === null || branch.current}
                      onClick={() => {
                        void checkoutRepositoryBranch(branch.name);
                      }}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{branch.name}</span>
                        {branch.current ? <Badge variant="secondary">current</Badge> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {branch.branchType}
                        {branch.upstream === null ? "" : ` - ${branch.upstream}`}
                      </span>
                    </button>
                    {branch.branchType === "local" && !branch.current ? (
                      <Button
                        aria-label={`Delete branch ${branch.name}`}
                        className="mt-1 size-8 shrink-0"
                        disabled={busyAction !== null || repositoryPath === null}
                        onClick={() => {
                          void deleteRepositoryBranch(branch.name);
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <IconTrash aria-hidden="true" className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <nav className="mt-5 flex flex-col gap-1">
            {navigationItems.map((item) => (
              <Button
                className={cn("justify-start", item.active && "bg-primary text-primary-foreground hover:bg-primary/80")}
                key={item.label}
                type="button"
                variant={item.active ? "default" : "ghost"}
              >
                <item.icon aria-hidden="true" data-icon="inline-start" />
                {item.label}
              </Button>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2 rounded-md border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Recent repositories</p>
              <Badge variant="secondary">{recentRepositories.length}</Badge>
            </div>
            <div className="flex max-h-48 flex-col gap-1 overflow-auto">
              {recentRepositories.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent repositories yet.</p>
              ) : (
                recentRepositories.map((recentPath) => (
                  <button
                    className="truncate rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    key={recentPath}
                    onClick={() => {
                      setRepositoryPathInput(recentPath);
                      void loadRepositoryStatus(recentPath, null);
                    }}
                    type="button"
                  >
                    {recentPath}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Changes</p>
              <h2 className="truncate text-2xl font-semibold">
                {summary === null ? "Open a repository" : `${summary.changedFileCount} changed files`}
              </h2>
            </div>
            <Button
              disabled={busyAction !== null || (repositoryPath === null && repositoryPathInput.trim().length === 0)}
              onClick={() => {
                void refreshRepository();
              }}
              type="button"
              variant="outline"
            >
              <IconRefresh aria-hidden="true" data-icon="inline-start" />
              Refresh
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-[280px_minmax(0,1fr)] gap-4">
            <div className="min-h-[520px] overflow-hidden rounded-md border">
              {status === null ? (
                <div className="p-4 text-sm text-muted-foreground">Repository status will appear here.</div>
              ) : status.files.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Working tree clean.</div>
              ) : (
                status.files.map((file) => (
                  <button
                    className={cn(
                      "block w-full border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-muted",
                      selectedFilePath === file.path && "bg-muted"
                    )}
                    key={file.path}
                    onClick={() => {
                      void selectFile(file);
                    }}
                    type="button"
                  >
                    <span className="block truncate font-medium">{file.path}</span>
                    <span className="text-muted-foreground">
                      {file.indexStatus} / {file.worktreeStatus}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="min-h-[520px] min-w-0 rounded-md border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedFile?.path ?? "Diff preview"}</p>
                  <p className="text-xs text-muted-foreground">
                    {diff === null ? "Select a changed file to load its diff" : diff.isBinary ? "Binary file" : "Text diff"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {selectedFileHasWorktreeChanges ? (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => {
                        void showDiffMode("worktree");
                      }}
                      size="sm"
                      type="button"
                      variant={diffMode === "worktree" ? "default" : "outline"}
                    >
                      <IconFileDiff aria-hidden="true" data-icon="inline-start" />
                      Worktree
                    </Button>
                  ) : null}
                  {selectedFileHasStagedChanges ? (
                    <Button
                      disabled={busyAction !== null}
                      onClick={() => {
                        void showDiffMode("staged");
                      }}
                      size="sm"
                      type="button"
                      variant={diffMode === "staged" ? "default" : "outline"}
                    >
                      <IconFileDiff aria-hidden="true" data-icon="inline-start" />
                      Staged
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  disabled={busyAction !== null || selectedFile === null || !selectedFileHasWorktreeChanges}
                  onClick={() => {
                    void stageSelectedFile();
                  }}
                  type="button"
                  variant="secondary"
                >
                  <IconPlus aria-hidden="true" data-icon="inline-start" />
                  Stage
                </Button>
                <Button
                  disabled={busyAction !== null || selectedFile === null || !selectedFileHasStagedChanges}
                  onClick={() => {
                    void unstageSelectedFile();
                  }}
                  type="button"
                  variant="secondary"
                >
                  <IconMinus aria-hidden="true" data-icon="inline-start" />
                  Unstage
                </Button>
              </div>

              <pre className="mt-4 max-h-[420px] overflow-auto rounded-md bg-background p-4 text-sm leading-6">
                {renderDiffText(diff, busyAction)}
              </pre>
            </div>
          </div>
        </section>

        <aside className="flex min-w-0 flex-col border-l bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Action panel</h2>
            <Badge variant={repositoryPath === null ? "outline" : "secondary"}>
              {repositoryPath === null ? "No repo" : "Local Git"}
            </Badge>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Summary
              <input
                className="h-8 rounded-md border border-input bg-background px-2 text-sm font-normal outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                onChange={(event) => {
                  setCommitSummary(event.target.value);
                }}
                placeholder="Commit summary"
                value={commitSummary}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="commit-body">
              Body
              <Textarea
                className="min-h-28 font-normal"
                id="commit-body"
                onChange={(event) => {
                  setCommitBody(event.target.value);
                }}
                placeholder="Optional commit body"
                value={commitBody}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                checked={amendCommit}
                className="size-4"
                onChange={(event) => {
                  setAmendCommit(event.target.checked);
                }}
                type="checkbox"
              />
              Amend previous commit
            </label>
            <Button disabled={!canCommit} onClick={() => void commitCurrentChanges()} type="button">
              <IconGitCommit aria-hidden="true" data-icon="inline-start" />
              Commit
            </Button>
          </div>

          <Separator className="my-5" />

          <div className="flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <IconCloudUpload aria-hidden="true" className="size-4 shrink-0" />
              Sync
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runRepositoryOperation("fetch")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconDownload aria-hidden="true" data-icon="inline-start" />
                Fetch
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runRepositoryOperation("pull")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconDownload aria-hidden="true" data-icon="inline-start" />
                Pull
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runRepositoryOperation("push")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconUpload aria-hidden="true" data-icon="inline-start" />
                Push
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium">
                <IconStack2 aria-hidden="true" className="size-4 shrink-0" />
                Stashes
              </div>
              <Badge variant="secondary">{stashes.length}</Badge>
            </div>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createRepositoryStash();
              }}
            >
              <label className="sr-only" htmlFor="stash-message">
                Stash message
              </label>
              <input
                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                id="stash-message"
                onChange={(event) => {
                  setStashMessage(event.target.value);
                }}
                placeholder="Optional message"
                value={stashMessage}
              />
              <Button disabled={!canCreateStash} size="sm" type="submit" variant="secondary">
                <IconPlus aria-hidden="true" data-icon="inline-start" />
                Stash
              </Button>
            </form>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="stash-selector">
              Selected stash
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={busyAction !== null || repositoryPath === null || stashes.length === 0}
                id="stash-selector"
                onChange={(event) => {
                  setSelectedStashRef(event.target.value.length === 0 ? null : event.target.value);
                }}
                value={selectedStashRef ?? ""}
              >
                <option value="">No stash selected</option>
                {stashes.map((stash) => (
                  <option key={stash.selector} value={stash.selector}>
                    {stash.selector} {stash.message}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <Button
                disabled={!canRunSelectedStashOperation}
                onClick={() => void runSelectedStashOperation("apply-stash")}
                size="sm"
                type="button"
                variant="secondary"
              >
                Apply
              </Button>
              <Button
                disabled={!canRunSelectedStashOperation}
                onClick={() => void runSelectedStashOperation("pop-stash")}
                size="sm"
                type="button"
                variant="secondary"
              >
                Pop
              </Button>
              <Button
                disabled={!canRunSelectedStashOperation}
                onClick={() => void runSelectedStashOperation("drop-stash")}
                size="sm"
                type="button"
                variant="secondary"
              >
                Drop
              </Button>
            </div>

            <div className="flex max-h-28 flex-col gap-1 overflow-auto">
              {stashes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stashes found.</p>
              ) : (
                stashes.map((stash) => (
                  <button
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                      selectedStashRef === stash.selector && "bg-muted"
                    )}
                    disabled={busyAction !== null}
                    key={stash.selector}
                    onClick={() => {
                      setSelectedStashRef(stash.selector);
                    }}
                    type="button"
                  >
                    <span className="block font-medium">{stash.selector}</span>
                    <span className="block truncate text-muted-foreground">{stash.message}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-md border bg-background p-3 text-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="font-medium">Latest output</p>
              <Badge variant={feedback?.kind === "error" ? "destructive" : "secondary"}>
                {feedback === null ? "Idle" : feedback.kind === "error" ? "Error" : "OK"}
              </Badge>
            </div>
            <OperationFeedbackView feedback={feedback} />
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-md border bg-background p-3 text-sm">
            <CommandLogView entries={commandLog} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function readRecentRepositories(): string[] {
  return parseRecentRepositories(localStorage.getItem(RECENT_REPOSITORIES_STORAGE_KEY));
}

function readInitialRepositoryPath(): string {
  return readRecentRepositories()[0] ?? "";
}

function readCommandLogEntries(): CommandLogEntry[] {
  return parseCommandLog(localStorage.getItem(COMMAND_LOG_STORAGE_KEY));
}

function getSelectedFile(status: RepositoryStatus | null, selectedFilePath: string | null): StatusFile | null {
  if (status === null || selectedFilePath === null) {
    return null;
  }

  return status.files.find((file) => file.path === selectedFilePath) ?? null;
}

function getSelectedStash(stashes: StashEntry[], selectedStashRef: string | null): StashEntry | null {
  if (selectedStashRef === null) {
    return null;
  }

  return stashes.find((stash) => stash.selector === selectedStashRef) ?? null;
}

function chooseSelectedFile(files: StatusFile[], requestedFilePath: string | null): StatusFile | null {
  if (requestedFilePath !== null) {
    const requestedFile = files.find((file) => file.path === requestedFilePath);
    if (requestedFile !== undefined) {
      return requestedFile;
    }
  }

  return files[0] ?? null;
}

function chooseSelectedStashRef(stashes: StashEntry[], requestedStashRef: string | null): string | null {
  if (requestedStashRef !== null && stashes.some((stash) => stash.selector === requestedStashRef)) {
    return requestedStashRef;
  }

  return stashes[0]?.selector ?? null;
}

async function runSyncCommand(action: "fetch" | "pull" | "push", repositoryPath: string): Promise<GitOperationResult> {
  if (action === "fetch") {
    return fetchRepository({ repositoryPath });
  }

  if (action === "pull") {
    return pullRepository({ repositoryPath });
  }

  return pushRepository({ repositoryPath });
}

async function runStashCommand(
  action: Exclude<StashAction, "create-stash">,
  repositoryPath: string,
  stashRef: string
): Promise<GitOperationResult> {
  if (action === "apply-stash") {
    return applyStash({ repositoryPath, stashRef });
  }

  if (action === "pop-stash") {
    return popStash({ repositoryPath, stashRef });
  }

  return dropStash({ repositoryPath, stashRef });
}

function syncOperationLabel(action: SyncAction): string {
  if (action === "fetch") {
    return "Fetch";
  }

  if (action === "pull") {
    return "Pull";
  }

  return "Push";
}

function stashOperationLabel(action: Exclude<StashAction, "create-stash">): string {
  if (action === "apply-stash") {
    return "Apply stash";
  }

  if (action === "pop-stash") {
    return "Pop stash";
  }

  return "Drop stash";
}

function renderDiffText(diff: FileDiff | null, busyAction: BusyAction): string {
  if (busyAction === "diff") {
    return "Loading diff...";
  }

  if (diff === null) {
    return "No diff loaded.";
  }

  if (diff.isBinary) {
    return `Binary file: ${diff.path}`;
  }

  return diff.text.length === 0 ? "No diff output." : diff.text;
}

function describeOperationError(error: unknown): OperationErrorDetails {
  if (typeof error === "object" && error !== null) {
    const operationError = error as { message?: unknown; command?: unknown; stdout?: unknown; stderr?: unknown };

    return {
      command: typeof operationError.command === "string" ? operationError.command : undefined,
      message: typeof operationError.message === "string" ? operationError.message : JSON.stringify(error),
      stderr: typeof operationError.stderr === "string" ? operationError.stderr : undefined,
      stdout: typeof operationError.stdout === "string" ? operationError.stdout : undefined
    };
  }

  return { message: String(error) };
}

function CommandLogView({ entries }: { entries: CommandLogEntry[] }) {
  const recentEntries = entries.slice(0, 10);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Command log</p>
        <Badge variant="secondary">{entries.length}</Badge>
      </div>

      {recentEntries.length === 0 ? (
        <p className="text-muted-foreground">Successful and failed Git operations will appear here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {recentEntries.map((entry) => (
            <div className="border-b pb-3 last:border-b-0 last:pb-0" key={entry.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{entry.operation}</p>
                <Badge variant={entry.status === "error" ? "destructive" : "secondary"}>
                  {entry.status === "error" ? "Error" : "OK"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatCommandLogTimestamp(entry.timestamp)}</p>
              <p className="mt-2 break-words text-muted-foreground">{entry.message}</p>
              <div className="mt-2">
                <OperationOutput command={entry.command} stderr={entry.stderr} stdout={entry.stdout} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatCommandLogTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function OperationFeedbackView({ feedback }: { feedback: OperationFeedback }) {
  if (feedback === null) {
    return <p className="text-muted-foreground">Latest Git operation output will appear here.</p>;
  }

  if (feedback.kind === "result") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium">Operation result</p>
          <Badge variant="secondary">OK</Badge>
        </div>
        <OperationOutput command={feedback.result.command} stderr={feedback.result.stderr} stdout={feedback.result.stdout} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">Operation error</p>
        <Badge variant="destructive">Error</Badge>
      </div>
      <p className="text-muted-foreground">{feedback.error.message}</p>
      <OperationOutput command={feedback.error.command} stderr={feedback.error.stderr} stdout={feedback.error.stdout} />
    </div>
  );
}

function OperationOutput({
  command,
  stdout,
  stderr
}: {
  command?: string;
  stdout?: string;
  stderr?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {command === undefined ? null : <OutputBlock label="Command" value={command} />}
      {stdout === undefined || stdout.length === 0 ? null : <OutputBlock label="stdout" value={stdout} />}
      {stderr === undefined || stderr.length === 0 ? null : <OutputBlock label="stderr" value={stderr} />}
    </div>
  );
}

function OutputBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre className="overflow-auto rounded-md bg-muted/50 p-2 text-xs leading-5">{value}</pre>
    </div>
  );
}
