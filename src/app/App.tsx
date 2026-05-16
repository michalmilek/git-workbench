import {
  IconCloudUpload,
  IconDownload,
  IconExternalLink,
  IconFileDiff,
  IconFolderOpen,
  IconGitBranch,
  IconGitCompare,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconHistory,
  IconInbox,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconServer,
  IconStack2,
  IconTrash,
  IconUpload
} from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";

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
  buildCommitGraphRows,
  classifyCommitRef,
  filterCommitHistory,
  type CommitGraphLane,
  type CommitGraphRow
} from "@/features/repository/commit-history";
import { buildHunkPatch, parseDiffHunks, type ParsedDiff } from "@/features/repository/diff-hunks";
import {
  applyOperationEvent,
  createOperationQueueEntry,
  finishOperationQueueEntry,
  type GitOperationEventPayload,
  type OperationLogStream,
  type OperationQueueEntry,
  type OperationQueueStatus
} from "@/features/repository/operation-queue";
import { trustedProviderUrl } from "@/features/repository/provider-links";
import {
  abortMerge,
  abortRebase,
  applyStash,
  checkoutBranch,
  commitChanges,
  continueRebase,
  createBranch,
  createStash,
  deleteBranch,
  deleteProviderAccount,
  dropStash,
  fetchRepository,
  getCommitDetails,
  getConflictState,
  getFileDiff,
  getRepositoryStatus,
  listProviderAccounts,
  listBranches,
  listCommitHistory,
  listProviderRemotes,
  listProviderWorkItems,
  listStashes,
  popStash,
  previewPull,
  previewMerge,
  previewRebase,
  previewPush,
  pullRepository,
  pushRepository,
  runMerge,
  runRebase,
  saveProviderAccount,
  stageHunk,
  stageFile,
  testProviderConnection,
  unstageHunk,
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
  CommitChangedFile,
  CommitDetails,
  CommitSummary,
  ConflictState,
  DiffMode,
  FileDiff,
  GitOperationResult,
  OperationPreview,
  ProviderAccount,
  ProviderAccountKind,
  ProviderCheckStatus,
  ProviderConnectionResult,
  ProviderKind,
  ProviderRemote,
  ProviderWorkItem,
  RepositoryStatus,
  StashEntry,
  StatusFile
} from "@/features/repository/repository-types";
import { cn } from "@/lib/utils";

type ViewMode = "changes" | "history" | "stashes";

const navigationItems = [
  { icon: IconInbox, label: "Changes", view: "changes" },
  { icon: IconHistory, label: "History", view: "history" },
  { icon: IconStack2, label: "Stashes", view: "stashes" }
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
type SyncPreviewAction = "preview-pull" | "preview-push";
type BranchAction = "checkout-branch" | "create-branch" | "delete-branch" | "preview-merge" | "preview-rebase";
type StashAction = "create-stash" | "apply-stash" | "pop-stash" | "drop-stash";
type OperationExecutionAction = "run-merge" | "run-rebase" | "abort-merge" | "abort-rebase" | "continue-rebase";
type ConflictRecoveryAction = Exclude<OperationExecutionAction, "run-merge" | "run-rebase">;
type ProviderAccountAction = "save-account" | "delete-account" | "test-account" | null;
type CommitRefKind = ReturnType<typeof classifyCommitRef>;
type BusyAction =
  | "status"
  | "diff"
  | "stage"
  | "unstage"
  | "commit"
  | SyncAction
  | SyncPreviewAction
  | BranchAction
  | StashAction
  | OperationExecutionAction
  | null;

const providerKindLabels: Record<ProviderKind, string> = {
  customGitlab: "Custom GitLab",
  github: "GitHub",
  gitlab: "GitLab",
  unknown: "Unknown"
};

const providerAccountKinds: ProviderAccountKind[] = ["github", "gitlab", "customGitlab"];

const defaultProviderBaseUrls: Record<ProviderAccountKind, string> = {
  customGitlab: "",
  github: "https://github.com",
  gitlab: "https://gitlab.com"
};

const historyFilterHints = ["author:", "ref:", "hash:", "merge:"] as const;
const commitGraphLaneWidth = 14;
const commitGraphLaneClasses = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500"
] as const;

export function App() {
  const [recentRepositories, setRecentRepositories] = useState(readRecentRepositories);
  const [repositoryPathInput, setRepositoryPathInput] = useState(readInitialRepositoryPath);
  const [repositoryPath, setRepositoryPath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>("changes");
  const [status, setStatus] = useState<RepositoryStatus | null>(null);
  const [providerRemotes, setProviderRemotes] = useState<ProviderRemote[]>([]);
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerWorkItems, setProviderWorkItems] = useState<ProviderWorkItem[]>([]);
  const [providerWorkMessage, setProviderWorkMessage] = useState("");
  const [providerWorkItemsLoading, setProviderWorkItemsLoading] = useState(false);
  const [providerAccounts, setProviderAccounts] = useState<ProviderAccount[]>([]);
  const [providerAccountsLoading, setProviderAccountsLoading] = useState(false);
  const [providerAccountKind, setProviderAccountKind] = useState<ProviderAccountKind>("github");
  const [providerAccountBaseUrl, setProviderAccountBaseUrl] = useState(defaultProviderBaseUrls.github);
  const [providerAccountLabel, setProviderAccountLabel] = useState("");
  const [providerAccountToken, setProviderAccountToken] = useState("");
  const [providerAccountAction, setProviderAccountAction] = useState<ProviderAccountAction>(null);
  const [activeProviderAccountId, setActiveProviderAccountId] = useState<string | null>(null);
  const [providerConnectionResults, setProviderConnectionResults] = useState<Record<string, ProviderConnectionResult>>({});
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<DiffMode>("worktree");
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [history, setHistory] = useState<CommitSummary[]>([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [selectedCommitOid, setSelectedCommitOid] = useState<string | null>(null);
  const [commitDetails, setCommitDetails] = useState<CommitDetails | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [commitDetailsLoading, setCommitDetailsLoading] = useState(false);
  const [commitSummary, setCommitSummary] = useState("");
  const [commitBody, setCommitBody] = useState("");
  const [amendCommit, setAmendCommit] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [branchNameInput, setBranchNameInput] = useState("");
  const [operationBranch, setOperationBranch] = useState("");
  const [operationPreview, setOperationPreview] = useState<OperationPreview | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [stashes, setStashes] = useState<StashEntry[]>([]);
  const [stashMessage, setStashMessage] = useState("");
  const [selectedStashRef, setSelectedStashRef] = useState<string | null>(null);
  const [commandLog, setCommandLog] = useState(readCommandLogEntries);
  const [operationQueue, setOperationQueue] = useState<OperationQueueEntry[]>([]);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [feedback, setFeedback] = useState<OperationFeedback>(null);
  const repositoryLoadRequestId = useRef(0);
  const diffRequestId = useRef(0);
  const referenceRequestId = useRef(0);
  const providerRequestId = useRef(0);
  const providerWorkItemsRequestId = useRef(0);
  const providerAccountsRequestId = useRef(0);
  const providerAccountActionRequestId = useRef(0);
  const historyRequestId = useRef(0);
  const commitDetailsRequestId = useRef(0);
  const operationPreviewRequestId = useRef(0);
  const commandLogId = useRef(0);
  const operationQueueId = useRef(0);

  const summary = useMemo(() => (status === null ? null : summarizeRepositoryStatus(status)), [status]);
  const filteredHistory = useMemo(() => filterCommitHistory(history, historyFilter), [history, historyFilter]);
  const commitGraphRows = useMemo(() => buildCommitGraphRows(filteredHistory), [filteredHistory]);
  const selectedFile = getSelectedFile(status, selectedFilePath);
  const selectedStash = getSelectedStash(stashes, selectedStashRef);
  const selectedCommit = getSelectedCommit(history, selectedCommitOid);
  const operationBranchOptions = branches.filter((branch) => !branch.current);
  const selectedOperationBranch = resolveSelectedOperationBranch(operationBranchOptions, operationBranch);
  const selectedFileHasStagedChanges = selectedFile === null ? false : hasStagedChanges(selectedFile);
  const selectedFileHasWorktreeChanges = selectedFile === null ? false : hasWorktreeChanges(selectedFile);
  const canCommit =
    repositoryPath !== null &&
    status !== null &&
    hasRepositoryStagedChanges(status) &&
    isCommitSummaryValid(commitSummary) &&
    busyAction === null;
  const canCreateBranch = repositoryPath !== null && branchNameInput.trim().length > 0 && busyAction === null;
  const canPreviewBranchOperation = repositoryPath !== null && selectedOperationBranch.length > 0 && busyAction === null;
  const canCreateStash = repositoryPath !== null && busyAction === null;
  const canRunSelectedStashOperation = repositoryPath !== null && selectedStash !== null && busyAction === null;
  const canSaveProviderAccount =
    providerAccountAction === null &&
    providerAccountBaseUrl.trim().length > 0 &&
    providerAccountLabel.trim().length > 0 &&
    providerAccountToken.trim().length > 0;

  useEffect(() => {
    const requestId = providerAccountsRequestId.current + 1;
    providerAccountsRequestId.current = requestId;
    setProviderAccountsLoading(true);

    void listProviderAccounts()
      .then((accounts) => {
        if (providerAccountsRequestId.current === requestId) {
          setProviderAccounts(accounts);
        }
      })
      .catch((error: unknown) => {
        if (providerAccountsRequestId.current === requestId) {
          setFeedback({ kind: "error", error: describeOperationError(error) });
          setProviderAccounts([]);
        }
      })
      .finally(() => {
        if (providerAccountsRequestId.current === requestId) {
          setProviderAccountsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) {
      return;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    void listen<GitOperationEventPayload>("git-operation", (event) => {
      setOperationQueue((entries) => applyOperationEvent(entries, event.payload));
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten;
        return;
      }

      nextUnlisten();
    });

    return () => {
      active = false;
      if (unlisten !== null) {
        unlisten();
      }
    };
  }, []);

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
    const repositoryLoadRequest = createRepositoryLoadRequest();
    invalidateDiffRequests();
    invalidateHistoryRequests();
    invalidateOperationPreviewRequests();
    setOperationPreview(null);
    const providerRequest = createProviderRequest();
    const providerWorkItemsRequest = createProviderWorkItemsRequest();
    const requestedCommitOid = path === repositoryPath ? selectedCommitOid : null;
    const switchingRepository = path !== repositoryPath;
    const referenceRequest = createReferenceRequest();
    if (switchingRepository) {
      setConflictState(null);
    }
    setBusyAction("status");

    try {
      const [nextStatus, nextConflictState] = await Promise.all([getRepositoryStatus(path), getConflictState(path)]);
      if (!isCurrentRepositoryLoadRequest(repositoryLoadRequest)) {
        return;
      }

      const nextFile = chooseSelectedFile(nextStatus.files, requestedFilePath);
      const nextDiffMode = nextFile === null ? "worktree" : getPreferredDiffMode(nextFile);

      if (switchingRepository) {
        clearHistoryState();
        clearOperationPreviewState();
        setProviderRemotes([]);
        setProviderWorkItems([]);
        setProviderWorkMessage("");
      }
      setRepositoryPath(path);
      setStatus(nextStatus);
      setConflictState(nextConflictState);
      setSelectedFilePath(nextFile?.path ?? null);
      setDiffMode(nextDiffMode);
      setDiff(null);
      rememberRepository(path);

      if (nextFile !== null) {
        await loadFileDiff(path, nextFile.path, nextDiffMode);
        if (!isCurrentRepositoryLoadRequest(repositoryLoadRequest)) {
          return;
        }
      }

      await Promise.all([
        loadRepositoryReferences(path, referenceRequest),
        loadRepositoryHistory(path, requestedCommitOid),
        loadProviderRemotes(path, providerRequest),
        loadProviderWorkItems(path, providerWorkItemsRequest)
      ]);
    } catch (error) {
      if (!isCurrentRepositoryLoadRequest(repositoryLoadRequest)) {
        return;
      }

      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Refresh repository", operationError);
      setConflictState(null);
      if (!switchingRepository) {
        setDiff(null);
        setBranches([]);
        clearOperationPreviewState();
        setStashes([]);
        setProviderRemotes([]);
        setProviderLoading(false);
        setProviderWorkItems([]);
        setProviderWorkMessage("");
        setProviderWorkItemsLoading(false);
        setSelectedStashRef(null);
        clearHistoryState();
      }
    } finally {
      if (isCurrentRepositoryLoadRequest(repositoryLoadRequest)) {
        setBusyAction(null);
      }
    }
  }

  async function loadRepositoryReferences(path: string, requestId: number) {
    await Promise.all([loadRepositoryBranches(path, requestId), loadRepositoryStashes(path, requestId)]);
  }

  async function loadProviderRemotes(path: string, requestId: number) {
    setProviderLoading(true);

    try {
      const nextProviderRemotes = await listProviderRemotes(path);
      if (isCurrentProviderRequest(requestId)) {
        setProviderRemotes(nextProviderRemotes.remotes);
      }
    } catch (error) {
      if (isCurrentProviderRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("List provider remotes", operationError);
        setProviderRemotes([]);
      }
    } finally {
      if (isCurrentProviderRequest(requestId)) {
        setProviderLoading(false);
      }
    }
  }

  async function loadProviderWorkItems(path: string, requestId: number) {
    setProviderWorkItemsLoading(true);

    try {
      const nextProviderWorkItems = await listProviderWorkItems(path);
      if (isCurrentProviderWorkItemsRequest(requestId)) {
        setProviderWorkItems(nextProviderWorkItems.items);
        setProviderWorkMessage(nextProviderWorkItems.message);
      }
    } catch (error) {
      if (isCurrentProviderWorkItemsRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("List provider work items", operationError);
        setProviderWorkItems([]);
        setProviderWorkMessage("");
      }
    } finally {
      if (isCurrentProviderWorkItemsRequest(requestId)) {
        setProviderWorkItemsLoading(false);
      }
    }
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

  async function loadRepositoryHistory(path: string, requestedCommitOid: string | null) {
    const requestId = createHistoryRequest();
    setHistoryLoading(true);
    setCommitDetailsLoading(false);
    setCommitDetails(null);

    try {
      const nextHistory = await listCommitHistory({ query: "", repositoryPath: path });
      if (isCurrentHistoryRequest(requestId)) {
        const nextCommitOid = chooseSelectedCommitOid(nextHistory, requestedCommitOid);
        setHistory(nextHistory);
        setSelectedCommitOid(nextCommitOid);

        if (nextCommitOid !== null) {
          void loadCommitDetails(path, nextCommitOid);
        }
      }
    } catch (error) {
      if (isCurrentHistoryRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("List history", operationError);
        setHistory([]);
        setSelectedCommitOid(null);
        setCommitDetails(null);
      }
    } finally {
      if (isCurrentHistoryRequest(requestId)) {
        setHistoryLoading(false);
      }
    }
  }

  async function loadCommitDetails(repository: string, commitOid: string) {
    const requestId = createCommitDetailsRequest();
    setCommitDetailsLoading(true);

    try {
      const nextDetails = await getCommitDetails({ commitOid, repositoryPath: repository });
      if (isCurrentCommitDetailsRequest(requestId)) {
        setCommitDetails(nextDetails);
      }
    } catch (error) {
      if (isCurrentCommitDetailsRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("Load commit details", operationError);
        setCommitDetails(null);
      }
    } finally {
      if (isCurrentCommitDetailsRequest(requestId)) {
        setCommitDetailsLoading(false);
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

  async function selectCommit(commit: CommitSummary) {
    if (repositoryPath === null) {
      return;
    }

    setSelectedCommitOid(commit.oid);
    setCommitDetails(null);
    await loadCommitDetails(repositoryPath, commit.oid);
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

  async function applySelectedHunk(hunkId: string) {
    if (repositoryPath === null || selectedFile === null || diff === null || diff.isBinary) {
      return;
    }

    const currentRepositoryPath = repositoryPath;
    const currentFilePath = selectedFile.path;
    const parsedDiff = parseDiffHunks(diff.text);
    const operation = diffMode === "staged" ? "Unstage hunk" : "Stage hunk";
    const patch = buildHunkPatch(parsedDiff, hunkId);

    invalidateDiffRequests();
    setBusyAction(diffMode === "staged" ? "unstage" : "stage");

    try {
      const result =
        diffMode === "staged"
          ? await unstageHunk({ patch, repositoryPath: currentRepositoryPath })
          : await stageHunk({ patch, repositoryPath: currentRepositoryPath });
      setFeedback({ kind: "result", result });
      recordOperationResult(operation, result);
      await reloadSelectedDiffAfterHunkApply(currentRepositoryPath, currentFilePath, diffMode);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError(operation, operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function reloadSelectedDiffAfterHunkApply(repository: string, filePath: string, requestedMode: DiffMode) {
    const requestId = diffRequestId.current + 1;
    diffRequestId.current = requestId;

    const nextStatus = await getRepositoryStatus(repository);
    if (diffRequestId.current !== requestId) {
      return;
    }

    const nextFile = getSelectedFile(nextStatus, filePath);
    const nextMode = chooseDiffModeAfterHunkApply(nextFile, requestedMode);
    setStatus(nextStatus);
    setSelectedFilePath(nextFile?.path ?? null);
    setDiffMode(nextMode);
    setDiff(null);

    if (nextFile === null) {
      return;
    }

    const nextDiff = await getFileDiff({ filePath: nextFile.path, repositoryPath: repository, staged: nextMode === "staged" });
    if (diffRequestId.current === requestId) {
      setDiff(nextDiff);
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

  async function runQueuedRepositoryOperation(action: SyncAction) {
    if (repositoryPath === null) {
      return;
    }

    await runQueuedGitOperation({
      action,
      command: syncOperationCommand(action),
      execute: (operationId) => runSyncCommand(action, repositoryPath, operationId),
      operation: syncOperationLabel(action),
      repository: repositoryPath
    });
  }

  async function previewSyncOperation(action: "pull" | "push") {
    if (repositoryPath === null) {
      return;
    }

    const requestId = createOperationPreviewRequest();
    const busyPreviewAction = action === "pull" ? "preview-pull" : "preview-push";
    const operation = action === "pull" ? "Preview pull" : "Preview push";
    setOperationPreview(null);
    setBusyAction(busyPreviewAction);

    try {
      const preview = action === "pull" ? await previewPull(repositoryPath) : await previewPush(repositoryPath);
      if (isCurrentOperationPreviewRequest(requestId)) {
        setOperationPreview(preview);
        const result = operationPreviewResult(preview);
        setFeedback({ kind: "result", result });
        recordOperationResult(operation, result);
      }
    } catch (error) {
      if (isCurrentOperationPreviewRequest(requestId)) {
        const operationError = describeOperationError(error);
        setOperationPreview(null);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError(operation, operationError);
      }
    } finally {
      if (isCurrentOperationPreviewRequest(requestId)) {
        setBusyAction(null);
      }
    }
  }

  async function checkoutRepositoryBranch(branchName: string) {
    if (repositoryPath === null) {
      return;
    }

    invalidateDiffRequests();
    invalidateOperationPreviewRequests();
    setOperationPreview(null);
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
      clearOperationPreviewState();
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
      clearOperationPreviewState();
      await loadRepositoryStatus(repositoryPath, selectedFilePath);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      recordOperationError("Delete branch", operationError);
    } finally {
      setBusyAction(null);
    }
  }

  async function previewBranchOperation(action: "merge" | "rebase") {
    if (repositoryPath === null || selectedOperationBranch.length === 0) {
      return;
    }

    const branchName = selectedOperationBranch;
    const requestId = createOperationPreviewRequest();
    const busyPreviewAction = action === "merge" ? "preview-merge" : "preview-rebase";
    setOperationPreview(null);
    setBusyAction(busyPreviewAction);

    try {
      const preview =
        action === "merge"
          ? await previewMerge({ repositoryPath, sourceBranch: branchName })
          : await previewRebase({ repositoryPath, targetBranch: branchName });
      if (isCurrentOperationPreviewRequest(requestId)) {
        setOperationPreview(preview);
        const result = operationPreviewResult(preview);
        setFeedback({ kind: "result", result });
        recordOperationResult(action === "merge" ? "Preview merge" : "Preview rebase", result);
      }
    } catch (error) {
      if (isCurrentOperationPreviewRequest(requestId)) {
        const operationError = describeOperationError(error);
        setOperationPreview(null);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError(action === "merge" ? "Preview merge" : "Preview rebase", operationError);
      }
    } finally {
      if (isCurrentOperationPreviewRequest(requestId)) {
        setBusyAction(null);
      }
    }
  }

  async function runQueuedPreviewedOperation(preview: OperationPreview) {
    if (repositoryPath === null) {
      return;
    }

    const confirmed = window.confirm(`Run ${preview.command}?`);
    if (!confirmed) {
      return;
    }

    const action = previewRunBusyAction(preview);
    const operation = previewRunOperationLabel(preview);
    await runQueuedGitOperation({
      action,
      command: preview.command,
      execute: (operationId) => runPreviewedCommand(preview, repositoryPath, operationId),
      operation,
      repository: repositoryPath
    });
  }

  async function runQueuedConflictRecovery(action: ConflictRecoveryAction) {
    if (repositoryPath === null) {
      return;
    }

    await runQueuedGitOperation({
      action,
      command: conflictRecoveryCommand(action),
      execute: (operationId) => runConflictRecoveryCommand(action, repositoryPath, operationId),
      operation: conflictRecoveryLabel(action),
      repository: repositoryPath
    });
  }

  async function runQueuedGitOperation({
    action,
    command,
    execute,
    operation,
    repository
  }: {
    action: Exclude<BusyAction, null>;
    command: string;
    execute(operationId: string): Promise<GitOperationResult>;
    operation: string;
    repository: string;
  }) {
    const operationId = createOperationQueueId();
    startOperationQueueEntry(operationId, operation, command);
    invalidateDiffRequests();
    setBusyAction(action);

    try {
      const result = await execute(operationId);
      setFeedback({ kind: "result", result });
      finishQueuedOperation(operationId, "success", result);
      recordOperationResult(operation, result);
    } catch (error) {
      const operationError = describeOperationError(error);
      setFeedback({ kind: "error", error: operationError });
      finishQueuedOperation(operationId, "error", operationErrorResult(operationError, command));
      recordOperationError(operation, operationError);
    } finally {
      await loadRepositoryStatus(repository, selectedFilePath);
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

  function selectProviderAccountKind(providerKind: ProviderAccountKind) {
    setProviderAccountKind(providerKind);
    setProviderAccountBaseUrl(defaultProviderBaseUrls[providerKind]);
  }

  async function saveCurrentProviderAccount() {
    const input = {
      baseUrl: providerAccountBaseUrl.trim(),
      label: providerAccountLabel.trim(),
      providerKind: providerAccountKind,
      token: providerAccountToken
    };

    if (input.baseUrl.length === 0 || input.label.length === 0 || input.token.trim().length === 0) {
      return;
    }

    const requestId = createProviderAccountActionRequest();
    const workItemRepositoryPath = repositoryPath;
    const repositoryRequest = repositoryLoadRequestId.current;
    setProviderAccountAction("save-account");
    setActiveProviderAccountId(null);

    try {
      const account = await saveProviderAccount(input);
      if (!isCurrentProviderAccountActionRequest(requestId)) {
        return;
      }

      setProviderAccounts((accounts) => upsertProviderAccount(accounts, account));
      setProviderConnectionResults((results) => removeProviderConnectionResult(results, account.id));
      setProviderAccountToken("");
      recordProviderAccountSaveResult(account);
      await refreshProviderWorkItemsAfterProviderAccountChange(workItemRepositoryPath, repositoryRequest, requestId);
    } catch (error) {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("Save provider account", operationError);
      }
    } finally {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        setProviderAccountAction(null);
      }
    }
  }

  async function deleteSavedProviderAccount(account: ProviderAccount) {
    const requestId = createProviderAccountActionRequest();
    const workItemRepositoryPath = repositoryPath;
    const repositoryRequest = repositoryLoadRequestId.current;
    setProviderAccountAction("delete-account");
    setActiveProviderAccountId(account.id);

    try {
      const result = await deleteProviderAccount(account.id);
      if (!isCurrentProviderAccountActionRequest(requestId)) {
        return;
      }

      setProviderAccounts((accounts) => accounts.filter((providerAccount) => providerAccount.id !== account.id));
      setProviderConnectionResults((results) => removeProviderConnectionResult(results, account.id));
      setFeedback({ kind: "result", result });
      recordOperationResult("Delete provider account", result);
      await refreshProviderWorkItemsAfterProviderAccountChange(workItemRepositoryPath, repositoryRequest, requestId);
    } catch (error) {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("Delete provider account", operationError);
      }
    } finally {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        setProviderAccountAction(null);
        setActiveProviderAccountId(null);
      }
    }
  }

  async function testSavedProviderAccount(account: ProviderAccount) {
    const requestId = createProviderAccountActionRequest();
    const workItemRepositoryPath = repositoryPath;
    const repositoryRequest = repositoryLoadRequestId.current;
    setProviderAccountAction("test-account");
    setActiveProviderAccountId(account.id);

    try {
      const result = await testProviderConnection(account.id);
      if (!isCurrentProviderAccountActionRequest(requestId)) {
        return;
      }

      setProviderConnectionResults((results) => ({ ...results, [result.accountId]: result }));
      recordProviderConnectionResult(result);
      await refreshProviderWorkItemsAfterProviderAccountChange(workItemRepositoryPath, repositoryRequest, requestId);
    } catch (error) {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        const operationError = describeOperationError(error);
        setFeedback({ kind: "error", error: operationError });
        recordOperationError("Test provider connection", operationError);
      }
    } finally {
      if (isCurrentProviderAccountActionRequest(requestId)) {
        setProviderAccountAction(null);
        setActiveProviderAccountId(null);
      }
    }
  }

  async function refreshProviderWorkItemsAfterProviderAccountChange(
    path: string | null,
    repositoryRequest: number,
    accountRequest: number
  ) {
    if (
      path === null ||
      !isCurrentProviderAccountActionRequest(accountRequest) ||
      !isCurrentRepositoryLoadRequest(repositoryRequest)
    ) {
      return;
    }

    await loadProviderWorkItems(path, createProviderWorkItemsRequest());
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

  function recordProviderAccountSaveResult(account: ProviderAccount) {
    saveCommandLogEntry({
      command: `save_provider_account ${account.id}`,
      id: createCommandLogId(),
      message: `Saved ${account.label}.`,
      operation: "Save provider account",
      status: "success",
      stdout: `${providerKindLabels[account.providerKind]} ${account.baseUrl}\nToken configured: ${formatBoolean(account.tokenConfigured)}`,
      timestamp: new Date().toISOString()
    });
  }

  function recordProviderConnectionResult(result: ProviderConnectionResult) {
    saveCommandLogEntry({
      command: `test_provider_connection ${result.accountId}`,
      id: createCommandLogId(),
      message: result.message,
      operation: "Test provider connection",
      status: result.ok ? "success" : "error",
      stdout: `HTTP status: ${formatProviderStatusCode(result.statusCode)}\n${result.message}`,
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

  function createOperationQueueId(): string {
    operationQueueId.current += 1;
    return `${Date.now()}-${operationQueueId.current}`;
  }

  function startOperationQueueEntry(id: string, operation: string, command: string) {
    setOperationQueue((entries) => [createOperationQueueEntry({ command, id, operation }), ...entries]);
  }

  function finishQueuedOperation(id: string, status: OperationQueueStatus, result: GitOperationResult) {
    setOperationQueue((entries) => finishOperationQueueEntry(entries, id, status, result));
  }

  function invalidateDiffRequests() {
    diffRequestId.current += 1;
  }

  function createRepositoryLoadRequest(): number {
    repositoryLoadRequestId.current += 1;
    return repositoryLoadRequestId.current;
  }

  function isCurrentRepositoryLoadRequest(requestId: number): boolean {
    return repositoryLoadRequestId.current === requestId;
  }

  function invalidateHistoryRequests() {
    historyRequestId.current += 1;
    commitDetailsRequestId.current += 1;
  }

  function clearHistoryState() {
    setHistory([]);
    setSelectedCommitOid(null);
    setCommitDetails(null);
    setHistoryLoading(false);
    setCommitDetailsLoading(false);
  }

  function clearOperationPreviewState() {
    invalidateOperationPreviewRequests();
    setOperationBranch("");
    setOperationPreview(null);
  }

  function selectOperationBranch(branchName: string) {
    invalidateOperationPreviewRequests();
    setOperationBranch(branchName);
    setOperationPreview(null);
  }

  function createReferenceRequest(): number {
    referenceRequestId.current += 1;
    return referenceRequestId.current;
  }

  function isCurrentReferenceRequest(requestId: number): boolean {
    return referenceRequestId.current === requestId;
  }

  function createProviderRequest(): number {
    providerRequestId.current += 1;
    return providerRequestId.current;
  }

  function isCurrentProviderRequest(requestId: number): boolean {
    return providerRequestId.current === requestId;
  }

  function createProviderWorkItemsRequest(): number {
    providerWorkItemsRequestId.current += 1;
    return providerWorkItemsRequestId.current;
  }

  function isCurrentProviderWorkItemsRequest(requestId: number): boolean {
    return providerWorkItemsRequestId.current === requestId;
  }

  function createProviderAccountActionRequest(): number {
    providerAccountActionRequestId.current += 1;
    return providerAccountActionRequestId.current;
  }

  function isCurrentProviderAccountActionRequest(requestId: number): boolean {
    return providerAccountActionRequestId.current === requestId;
  }

  function createOperationPreviewRequest(): number {
    operationPreviewRequestId.current += 1;
    return operationPreviewRequestId.current;
  }

  function isCurrentOperationPreviewRequest(requestId: number): boolean {
    return operationPreviewRequestId.current === requestId;
  }

  function invalidateOperationPreviewRequests() {
    operationPreviewRequestId.current += 1;
  }

  function createHistoryRequest(): number {
    historyRequestId.current += 1;
    return historyRequestId.current;
  }

  function isCurrentHistoryRequest(requestId: number): boolean {
    return historyRequestId.current === requestId;
  }

  function createCommitDetailsRequest(): number {
    commitDetailsRequestId.current += 1;
    return commitDetailsRequestId.current;
  }

  function isCurrentCommitDetailsRequest(requestId: number): boolean {
    return commitDetailsRequestId.current === requestId;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="flex min-w-0 flex-col border-b bg-muted/30 p-4 xl:border-b-0 xl:border-r">
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

            <Separator className="my-3" />

            <BranchOperationControls
              branchOptions={operationBranchOptions}
              busyAction={busyAction}
              canPreview={canPreviewBranchOperation}
              onBranchChange={selectOperationBranch}
              onPreviewMerge={() => void previewBranchOperation("merge")}
              onPreviewRebase={() => void previewBranchOperation("rebase")}
              repositoryOpened={repositoryPath !== null}
              selectedBranch={selectedOperationBranch}
            />
          </div>

          <nav className="mt-5 flex flex-col gap-1">
            {navigationItems.map((item) => (
              <Button
                className={cn("justify-start", activeView === item.view && "bg-primary text-primary-foreground hover:bg-primary/80")}
                key={item.label}
                onClick={() => {
                  setActiveView(item.view);
                }}
                type="button"
                variant={activeView === item.view ? "default" : "ghost"}
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
                    className="truncate rounded-sm px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busyAction !== null}
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

        <section className="min-w-0 p-4 sm:p-6">
          {activeView === "changes" ? (
            <>
          <div className="flex flex-wrap items-center justify-between gap-4">
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

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
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

              <DiffDisplay
                busyAction={busyAction}
                diff={diff}
                diffMode={diffMode}
                onApplyHunk={(hunkId) => {
                  void applySelectedHunk(hunkId);
                }}
              />
            </div>
          </div>
            </>
          ) : activeView === "history" ? (
            <>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">History</p>
                  <h2 className="truncate text-2xl font-semibold">
                    {repositoryPath === null ? "Open a repository" : `${history.length} commits`}
                  </h2>
                </div>
                <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:min-w-[420px]">
                  <div className="flex min-w-0 items-center gap-2">
                    <label className="sr-only" htmlFor="history-filter">
                      Filter history
                    </label>
                    <input
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      id="history-filter"
                      onChange={(event) => {
                        setHistoryFilter(event.target.value);
                      }}
                      placeholder="Filter subject, author, hash, refs"
                      value={historyFilter}
                    />
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
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {historyFilterHints.map((hint) => (
                      <button
                        className="rounded-full border bg-muted/30 px-2 py-0.5 font-mono text-[0.6875rem] text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
                        key={hint}
                        onClick={() => {
                          setHistoryFilter((currentFilter) => addHistoryFilterHint(currentFilter, hint));
                        }}
                        type="button"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(340px,42%)_minmax(0,1fr)]">
                <div className="min-h-[620px] overflow-hidden rounded-md border">
                  {repositoryPath === null ? (
                    <div className="p-4 text-sm text-muted-foreground">Repository history will appear here.</div>
                  ) : historyLoading ? (
                    <div className="p-4 text-sm text-muted-foreground">Loading history...</div>
                  ) : filteredHistory.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      {historyFilter.trim().length === 0 ? "No commits found." : "No commits match the current filter."}
                    </div>
                  ) : (
                    commitGraphRows.map((row) => {
                      const commit = row.commit;

                      return (
                        <button
                          aria-pressed={selectedCommitOid === commit.oid}
                          className={cn(
                            "flex w-full min-w-0 gap-2 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-muted",
                            selectedCommitOid === commit.oid && "bg-muted"
                          )}
                          key={commit.oid}
                          onClick={() => {
                            void selectCommit(commit);
                          }}
                          type="button"
                        >
                          <CommitGraphRail row={row} selected={selectedCommitOid === commit.oid} />
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium">{commit.subject}</span>
                              <CommitRefBadges refs={commit.refs} />
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {commit.authorName} | {formatCommitDate(commit.authoredAt)} | {commit.shortOid}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                <CommitDetailsView commit={selectedCommit} details={commitDetails} loading={commitDetailsLoading} />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">Stashes</p>
                  <h2 className="truncate text-2xl font-semibold">
                    {repositoryPath === null ? "Open a repository" : `${stashes.length} stash entries`}
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

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,40%)_minmax(0,1fr)]">
                <div className="min-h-[520px] overflow-hidden rounded-md border">
                  {repositoryPath === null ? (
                    <div className="p-4 text-sm text-muted-foreground">Repository stashes will appear here.</div>
                  ) : stashes.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No stashes found.</div>
                  ) : (
                    stashes.map((stash) => (
                      <button
                        className={cn(
                          "block w-full border-b px-3 py-3 text-left text-sm last:border-b-0 hover:bg-muted",
                          selectedStashRef === stash.selector && "bg-muted"
                        )}
                        disabled={busyAction !== null}
                        key={stash.selector}
                        onClick={() => {
                          setSelectedStashRef(stash.selector);
                        }}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-medium">{stash.selector}</span>
                          <Badge variant="secondary">#{stash.index}</Badge>
                        </span>
                        <span className="mt-1 block truncate text-muted-foreground">{stash.message}</span>
                      </button>
                    ))
                  )}
                </div>

                <div className="min-h-[520px] min-w-0 rounded-md border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selectedStash?.selector ?? "Stash operations"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedStash === null ? "Select a stash to apply, pop, or drop it" : selectedStash.message}
                      </p>
                    </div>
                    <Badge variant={selectedStash === null ? "outline" : "secondary"}>
                      {selectedStash === null ? "None" : `#${selectedStash.index}`}
                    </Badge>
                  </div>

                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createRepositoryStash();
                    }}
                  >
                    <label className="sr-only" htmlFor="stash-message-main">
                      Stash message
                    </label>
                    <input
                      className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      id="stash-message-main"
                      onChange={(event) => {
                        setStashMessage(event.target.value);
                      }}
                      placeholder="Optional stash message"
                      value={stashMessage}
                    />
                    <Button disabled={!canCreateStash} type="submit" variant="secondary">
                      <IconPlus aria-hidden="true" data-icon="inline-start" />
                      Stash
                    </Button>
                  </form>

                  <div className="mt-4 flex gap-2">
                    <Button
                      disabled={!canRunSelectedStashOperation}
                      onClick={() => void runSelectedStashOperation("apply-stash")}
                      type="button"
                      variant="secondary"
                    >
                      Apply
                    </Button>
                    <Button
                      disabled={!canRunSelectedStashOperation}
                      onClick={() => void runSelectedStashOperation("pop-stash")}
                      type="button"
                      variant="secondary"
                    >
                      Pop
                    </Button>
                    <Button
                      disabled={!canRunSelectedStashOperation}
                      onClick={() => void runSelectedStashOperation("drop-stash")}
                      type="button"
                      variant="secondary"
                    >
                      Drop
                    </Button>
                  </div>

                  <Separator className="my-4" />

                  {selectedStash === null ? (
                    <p className="text-sm text-muted-foreground">No stash selected.</p>
                  ) : (
                    <div className="text-sm">
                      <p className="font-medium">{selectedStash.selector}</p>
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{selectedStash.message}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col border-t bg-muted/20 p-4 xl:border-l xl:border-t-0">
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
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="col-span-2"
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runQueuedRepositoryOperation("fetch")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconDownload aria-hidden="true" data-icon="inline-start" />
                Fetch
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runQueuedRepositoryOperation("pull")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconDownload aria-hidden="true" data-icon="inline-start" />
                Pull
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void previewSyncOperation("pull")}
                size="sm"
                type="button"
                variant="outline"
              >
                <IconFileDiff aria-hidden="true" data-icon="inline-start" />
                Pull preview
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void runQueuedRepositoryOperation("push")}
                size="sm"
                type="button"
                variant="secondary"
              >
                <IconUpload aria-hidden="true" data-icon="inline-start" />
                Push
              </Button>
              <Button
                disabled={busyAction !== null || repositoryPath === null}
                onClick={() => void previewSyncOperation("push")}
                size="sm"
                type="button"
                variant="outline"
              >
                <IconFileDiff aria-hidden="true" data-icon="inline-start" />
                Push preview
              </Button>
            </div>
          </div>

          <OperationQueuePanel entries={operationQueue} />

          <OperationPreviewPanel
            busyAction={busyAction}
            onRunPreviewedOperation={(preview) => void runQueuedPreviewedOperation(preview)}
            preview={operationPreview}
            repositoryOpened={repositoryPath !== null}
          />

          <ConflictStatePanel
            busyAction={busyAction}
            conflictState={conflictState}
            onRecovery={(action) => void runQueuedConflictRecovery(action)}
            repositoryOpened={repositoryPath !== null}
          />

          <ProviderRemotesPanel loading={providerLoading} remotes={providerRemotes} repositoryOpened={repositoryPath !== null} />

          <ProviderWorkItemsPanel
            items={providerWorkItems}
            loading={providerWorkItemsLoading}
            message={providerWorkMessage}
            repositoryOpened={repositoryPath !== null}
          />

          <ProviderAccountsPanel
            accounts={providerAccounts}
            action={providerAccountAction}
            activeAccountId={activeProviderAccountId}
            baseUrl={providerAccountBaseUrl}
            canSave={canSaveProviderAccount}
            connectionResults={providerConnectionResults}
            label={providerAccountLabel}
            loading={providerAccountsLoading}
            onBaseUrlChange={setProviderAccountBaseUrl}
            onDelete={(account) => void deleteSavedProviderAccount(account)}
            onLabelChange={setProviderAccountLabel}
            onProviderKindChange={selectProviderAccountKind}
            onSave={() => void saveCurrentProviderAccount()}
            onTest={(account) => void testSavedProviderAccount(account)}
            onTokenChange={setProviderAccountToken}
            providerKind={providerAccountKind}
            token={providerAccountToken}
          />

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

function resolveSelectedOperationBranch(branches: BranchInfo[], requestedBranch: string): string {
  if (requestedBranch.length > 0 && branches.some((branch) => branch.name === requestedBranch)) {
    return requestedBranch;
  }

  return branches[0]?.name ?? "";
}

function getSelectedCommit(commits: CommitSummary[], selectedCommitOid: string | null): CommitSummary | null {
  if (selectedCommitOid === null) {
    return null;
  }

  return commits.find((commit) => commit.oid === selectedCommitOid) ?? null;
}

function chooseSelectedCommitOid(commits: CommitSummary[], requestedCommitOid: string | null): string | null {
  if (requestedCommitOid !== null && commits.some((commit) => commit.oid === requestedCommitOid)) {
    return requestedCommitOid;
  }

  return commits[0]?.oid ?? null;
}

function addHistoryFilterHint(filter: string, hint: (typeof historyFilterHints)[number]): string {
  const trimmedFilter = filter.trim();
  return trimmedFilter.length === 0 ? hint : `${trimmedFilter} ${hint}`;
}

async function runSyncCommand(action: "fetch" | "pull" | "push", repositoryPath: string, operationId: string): Promise<GitOperationResult> {
  const args = { operationId, repositoryPath };

  if (action === "fetch") {
    return fetchRepository(args);
  }

  if (action === "pull") {
    return pullRepository(args);
  }

  return pushRepository(args);
}

function runPreviewedCommand(preview: OperationPreview, repositoryPath: string, operationId: string): Promise<GitOperationResult> {
  if (preview.kind === "merge") {
    const args = { operationId, repositoryPath, sourceBranch: preview.sourceBranch };
    return runMerge(args);
  }

  if (preview.kind === "pull") {
    return pullRepository({ operationId, repositoryPath });
  }

  if (preview.kind === "push") {
    return pushRepository({ operationId, repositoryPath });
  }

  const args = { operationId, repositoryPath, targetBranch: preview.targetBranch };
  return runRebase(args);
}

function previewRunBusyAction(preview: OperationPreview): Exclude<BusyAction, null> {
  if (preview.kind === "merge") {
    return "run-merge";
  }

  if (preview.kind === "rebase") {
    return "run-rebase";
  }

  return preview.kind;
}

function previewRunOperationLabel(preview: OperationPreview): string {
  if (preview.kind === "merge") {
    return "Run merge";
  }

  if (preview.kind === "rebase") {
    return "Run rebase";
  }

  if (preview.kind === "pull") {
    return "Pull";
  }

  return "Push";
}

function operationPreviewResult(preview: OperationPreview): GitOperationResult {
  return {
    command: preview.command,
    stderr: "",
    stdout: [
      preview.message,
      `Source: ${preview.sourceBranch}`,
      `Target: ${preview.targetBranch}`,
      `Commits: ${preview.commits.length}`,
      `Changed files: ${preview.changedFiles.length}`,
      `Likely conflicts: ${preview.likelyConflictFiles.length}`
    ].join("\n")
  };
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

async function runConflictRecoveryCommand(
  action: ConflictRecoveryAction,
  repositoryPath: string,
  operationId: string
): Promise<GitOperationResult> {
  const args = { operationId, repositoryPath };

  if (action === "abort-merge") {
    return abortMerge(args);
  }

  if (action === "abort-rebase") {
    return abortRebase(args);
  }

  return continueRebase(args);
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

function syncOperationCommand(action: SyncAction): string {
  if (action === "fetch") {
    return "git fetch";
  }

  if (action === "pull") {
    return "git pull";
  }

  return "git push";
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

function conflictRecoveryLabel(action: ConflictRecoveryAction): string {
  if (action === "abort-merge") {
    return "Abort merge";
  }

  if (action === "abort-rebase") {
    return "Abort rebase";
  }

  return "Continue rebase";
}

function conflictRecoveryCommand(action: ConflictRecoveryAction): string {
  if (action === "abort-merge") {
    return "git merge --abort";
  }

  if (action === "abort-rebase") {
    return "git rebase --abort";
  }

  return "git rebase --continue";
}

function operationErrorResult(error: OperationErrorDetails, fallbackCommand: string): GitOperationResult {
  return {
    command: error.command ?? fallbackCommand,
    stderr: error.stderr ?? error.message,
    stdout: error.stdout ?? ""
  };
}

function conflictOperationLabel(operation: ConflictState["operation"]): string {
  if (operation === "merge") {
    return "merge";
  }

  if (operation === "rebase") {
    return "rebase";
  }

  return "none";
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

function chooseDiffModeAfterHunkApply(file: StatusFile | null, requestedMode: DiffMode): DiffMode {
  if (file === null) {
    return "worktree";
  }

  if (requestedMode === "staged" && hasStagedChanges(file)) {
    return "staged";
  }

  if (requestedMode === "worktree" && hasWorktreeChanges(file)) {
    return "worktree";
  }

  return getPreferredDiffMode(file);
}

function DiffDisplay({
  busyAction,
  diff,
  diffMode,
  onApplyHunk
}: {
  busyAction: BusyAction;
  diff: FileDiff | null;
  diffMode: DiffMode;
  onApplyHunk(hunkId: string): void;
}) {
  if (diff === null || diff.isBinary || diff.text.length === 0 || busyAction === "diff") {
    return (
      <pre className="mt-4 max-h-[420px] overflow-auto rounded-md bg-background p-4 text-sm leading-6">
        {renderDiffText(diff, busyAction)}
      </pre>
    );
  }

  const parsedDiff = parseDiffHunks(diff.text);
  const hunkCount = parsedDiff.files.reduce((count, file) => count + file.hunks.length, 0);

  if (hunkCount === 0) {
    return (
      <pre className="mt-4 max-h-[420px] overflow-auto rounded-md bg-background p-4 text-sm leading-6">
        {renderDiffText(diff, busyAction)}
      </pre>
    );
  }

  return (
    <DiffHunkViewer
      busyAction={busyAction}
      diffMode={diffMode}
      parsedDiff={parsedDiff}
      onApplyHunk={onApplyHunk}
    />
  );
}

function DiffHunkViewer({
  busyAction,
  diffMode,
  onApplyHunk,
  parsedDiff
}: {
  busyAction: BusyAction;
  diffMode: DiffMode;
  onApplyHunk(hunkId: string): void;
  parsedDiff: ParsedDiff;
}) {
  return (
    <div className="mt-4 flex max-h-[420px] min-w-0 flex-col overflow-auto rounded-md bg-background text-sm leading-6">
      {parsedDiff.files.map((file) => (
        <div className="min-w-max border-b last:border-b-0" key={file.headerLines.join("\n")}>
          {file.headerLines.length === 0 ? null : (
            <pre className="border-b p-4 font-mono text-xs leading-5 text-muted-foreground">{file.headerLines.join("\n")}</pre>
          )}

          {file.hunks.map((hunk) => (
            <section className="border-b last:border-b-0" key={hunk.id}>
              <div className="sticky left-0 flex min-w-0 flex-wrap items-center justify-between gap-2 bg-muted/50 px-4 py-2">
                <code className="min-w-0 break-all text-xs text-muted-foreground">{hunk.header}</code>
                <Button
                  disabled={busyAction !== null}
                  onClick={() => {
                    onApplyHunk(hunk.id);
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  {diffMode === "staged" ? (
                    <IconMinus aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <IconPlus aria-hidden="true" data-icon="inline-start" />
                  )}
                  {diffMode === "staged" ? "Unstage hunk" : "Stage hunk"}
                </Button>
              </div>
              <pre className="p-4 font-mono text-xs leading-5">{hunk.lines.join("\n")}</pre>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

function BranchOperationControls({
  branchOptions,
  busyAction,
  canPreview,
  onBranchChange,
  onPreviewMerge,
  onPreviewRebase,
  repositoryOpened,
  selectedBranch
}: {
  branchOptions: BranchInfo[];
  busyAction: BusyAction;
  canPreview: boolean;
  onBranchChange(branchName: string): void;
  onPreviewMerge(): void;
  onPreviewRebase(): void;
  repositoryOpened: boolean;
  selectedBranch: string;
}) {
  const previewingMerge = busyAction === "preview-merge";
  const previewingRebase = busyAction === "preview-rebase";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <IconGitCompare aria-hidden="true" className="size-4 shrink-0" />
        Operation preview
      </div>
      {!repositoryOpened ? (
        <p className="text-sm text-muted-foreground">No repository</p>
      ) : branchOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other branches to preview.</p>
      ) : (
        <>
          <label className="sr-only" htmlFor="operation-branch">
            Preview branch
          </label>
          <select
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={busyAction !== null}
            id="operation-branch"
            onChange={(event) => {
              onBranchChange(event.target.value);
            }}
            value={selectedBranch}
          >
            {branchOptions.map((branch) => (
              <option key={`${branch.branchType}:${branch.name}`} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={!canPreview} onClick={onPreviewMerge} size="sm" type="button" variant="secondary">
              <IconGitMerge aria-hidden="true" data-icon="inline-start" />
              {previewingMerge ? "Previewing" : "Merge"}
            </Button>
            <Button disabled={!canPreview} onClick={onPreviewRebase} size="sm" type="button" variant="secondary">
              <IconGitCompare aria-hidden="true" data-icon="inline-start" />
              {previewingRebase ? "Previewing" : "Rebase"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function OperationQueuePanel({ entries }: { entries: OperationQueueEntry[] }) {
  const visibleEntries = entries.slice(0, 8);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm" data-testid="operation-queue-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconHistory aria-hidden="true" className="size-4 shrink-0" />
          Operation queue
        </div>
        <Badge variant={entries.some((entry) => entry.status === "running") ? "outline" : "secondary"}>{entries.length}</Badge>
      </div>

      {visibleEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Long-running Git operations will appear here.</p>
      ) : (
        <div className="flex max-h-80 flex-col gap-3 overflow-auto">
          {visibleEntries.map((entry) => (
            <div className="border-b pb-3 last:border-b-0 last:pb-0" key={entry.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{entry.operation}</p>
                <Badge className="shrink-0" variant={operationQueueStatusBadgeVariant(entry.status)}>
                  {operationQueueStatusLabel(entry.status)}
                </Badge>
              </div>
              <code className="mt-2 block truncate rounded bg-muted px-2 py-1 text-xs">{entry.command}</code>
              <OperationQueueLogLines lines={entry.logs.slice(-5)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OperationQueueLogLines({ lines }: { lines: OperationQueueEntry["logs"] }) {
  if (lines.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">Waiting for output.</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      {lines.map((line, index) => (
        <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-xs" key={`${line.stream}:${index}:${line.line}`}>
          <Badge className="h-5 justify-center px-1" variant={line.stream === "stderr" ? "destructive" : "outline"}>
            {operationLogStreamLabel(line.stream)}
          </Badge>
          <pre className="min-w-0 overflow-hidden text-ellipsis whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 leading-5">
            {line.line}
          </pre>
        </div>
      ))}
    </div>
  );
}

function operationQueueStatusBadgeVariant(status: OperationQueueStatus): "secondary" | "destructive" | "outline" {
  if (status === "success") {
    return "secondary";
  }

  if (status === "error") {
    return "destructive";
  }

  return "outline";
}

function operationQueueStatusLabel(status: OperationQueueStatus): string {
  if (status === "success") {
    return "OK";
  }

  if (status === "error") {
    return "Error";
  }

  return "Running";
}

function operationLogStreamLabel(stream: OperationLogStream): string {
  return stream;
}

function OperationPreviewPanel({
  busyAction,
  onRunPreviewedOperation,
  preview,
  repositoryOpened
}: {
  busyAction: BusyAction;
  onRunPreviewedOperation(preview: OperationPreview): void;
  preview: OperationPreview | null;
  repositoryOpened: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm" data-testid="operation-preview-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconGitCompare aria-hidden="true" className="size-4 shrink-0" />
          Preview
        </div>
        <Badge variant={preview === null ? "outline" : "secondary"}>{preview === null ? "None" : preview.kind}</Badge>
      </div>

      {!repositoryOpened ? (
        <p className="text-sm text-muted-foreground">No repository</p>
      ) : preview === null ? (
        <p className="text-sm text-muted-foreground">Select a branch and preview merge or rebase.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">Source</span>
            <span className="truncate">{preview.sourceBranch}</span>
            <span className="text-muted-foreground">Target</span>
            <span className="truncate">{preview.targetBranch}</span>
            <span className="text-muted-foreground">Command</span>
            <code className="truncate rounded bg-muted px-1 py-0.5">{preview.command}</code>
          </div>

          <p className="text-xs text-muted-foreground">{preview.message}</p>

          <Button
            disabled={busyAction !== null}
            onClick={() => {
              onRunPreviewedOperation(preview);
            }}
            size="sm"
            type="button"
            variant="default"
          >
            <OperationPreviewRunIcon kind={preview.kind} />
            {isRunningOperationPreview(preview, busyAction) ? `Running ${preview.kind}` : operationPreviewRunButtonLabel(preview)}
          </Button>

          <PreviewList label="Commits" values={preview.commits.map((commit) => `${commit.shortOid} ${commit.subject}`)} />
          <PreviewList label="Changed files" values={preview.changedFiles} />
          <PreviewList label="Likely conflicts" values={preview.likelyConflictFiles} />
        </div>
      )}
    </div>
  );
}

function ConflictStatePanel({
  busyAction,
  conflictState,
  onRecovery,
  repositoryOpened
}: {
  busyAction: BusyAction;
  conflictState: ConflictState | null;
  onRecovery(action: ConflictRecoveryAction): void;
  repositoryOpened: boolean;
}) {
  const operation = conflictState === null ? "unknown" : conflictOperationLabel(conflictState.operation);
  const conflictFileCount = conflictState?.files.length ?? 0;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm" data-testid="conflict-state-panel">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconGitMerge aria-hidden="true" className="size-4 shrink-0" />
          Conflicts
        </div>
        <Badge variant={conflictState === null || conflictState.operation === "none" ? "outline" : "destructive"}>{operation}</Badge>
      </div>

      {!repositoryOpened ? (
        <p className="text-sm text-muted-foreground">No repository</p>
      ) : conflictState === null ? (
        <p className="text-sm text-muted-foreground">Conflict state not loaded.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
            <span className="text-muted-foreground">Operation</span>
            <span className="truncate">{conflictOperationLabel(conflictState.operation)}</span>
            <span className="text-muted-foreground">Files</span>
            <span>{conflictFileCount}</span>
          </div>

          <p className="text-xs text-muted-foreground">{conflictState.message}</p>

          {conflictState.files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No conflict files.</p>
          ) : (
            <div className="max-h-36 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
              {conflictState.files.map((file) => (
                <div className="border-b py-1.5 last:border-b-0" key={file.path}>
                  <p className="truncate font-medium">{file.path}</p>
                  <p className="text-muted-foreground">
                    {file.indexStatus} / {file.worktreeStatus}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Button
              disabled={busyAction !== null || !conflictState.canAbortMerge}
              onClick={() => {
                onRecovery("abort-merge");
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Abort merge
            </Button>
            <Button
              disabled={busyAction !== null || !conflictState.canAbortRebase}
              onClick={() => {
                onRecovery("abort-rebase");
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Abort rebase
            </Button>
            <Button
              disabled={busyAction !== null || !conflictState.canContinueRebase}
              onClick={() => {
                onRecovery("continue-rebase");
              }}
              size="sm"
              type="button"
              variant="secondary"
            >
              Continue rebase
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function OperationPreviewRunIcon({ kind }: { kind: OperationPreview["kind"] }) {
  if (kind === "merge") {
    return <IconGitMerge aria-hidden="true" data-icon="inline-start" />;
  }

  if (kind === "pull") {
    return <IconDownload aria-hidden="true" data-icon="inline-start" />;
  }

  if (kind === "push") {
    return <IconUpload aria-hidden="true" data-icon="inline-start" />;
  }

  return <IconGitCompare aria-hidden="true" data-icon="inline-start" />;
}

function isRunningOperationPreview(preview: OperationPreview, busyAction: BusyAction): boolean {
  return busyAction === previewRunBusyAction(preview);
}

function operationPreviewRunButtonLabel(preview: OperationPreview): string {
  if (preview.kind === "pull") {
    return "Run pull";
  }

  if (preview.kind === "push") {
    return "Run push";
  }

  return `Run ${preview.kind}`;
}

function PreviewList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <Badge variant="outline">{values.length}</Badge>
      </div>
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="max-h-24 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
          {values.slice(0, 12).map((value) => (
            <p className="truncate" key={value}>
              {value}
            </p>
          ))}
          {values.length > 12 ? <p className="text-muted-foreground">+{values.length - 12} more</p> : null}
        </div>
      )}
    </div>
  );
}

function ProviderRemotesPanel({
  loading,
  remotes,
  repositoryOpened
}: {
  loading: boolean;
  remotes: ProviderRemote[];
  repositoryOpened: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconServer aria-hidden="true" className="size-4 shrink-0" />
          Providers
        </div>
        <Badge variant={loading ? "outline" : "secondary"}>{loading ? "Loading" : remotes.length}</Badge>
      </div>

      <div className="flex max-h-56 flex-col gap-2 overflow-auto">
        {!repositoryOpened ? (
          <p className="text-sm text-muted-foreground">No repository</p>
        ) : remotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? "Loading" : "No remotes"}</p>
        ) : (
          remotes.map((remote) => <ProviderRemoteCard key={`${remote.remoteName}:${remote.fetchUrl ?? remote.pushUrl ?? ""}`} remote={remote} />)
        )}
      </div>
    </div>
  );
}

function ProviderWorkItemsPanel({
  items,
  loading,
  message,
  repositoryOpened
}: {
  items: ProviderWorkItem[];
  loading: boolean;
  message: string;
  repositoryOpened: boolean;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconGitPullRequest aria-hidden="true" className="size-4 shrink-0" />
          Work items
        </div>
        <Badge variant={loading ? "outline" : "secondary"}>{loading ? "Loading" : items.length}</Badge>
      </div>

      <div className="flex max-h-72 flex-col gap-2 overflow-auto">
        {!repositoryOpened ? (
          <p className="text-sm text-muted-foreground">No repository</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? "Loading" : formatProviderWorkMessage(message)}</p>
        ) : (
          items.map((item) => <ProviderWorkItemCard item={item} key={item.id} />)
        )}
      </div>

      {repositoryOpened && items.length > 0 && message.length > 0 ? (
        <p className="text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}

function ProviderAccountsPanel({
  accounts,
  action,
  activeAccountId,
  baseUrl,
  canSave,
  connectionResults,
  label,
  loading,
  onBaseUrlChange,
  onDelete,
  onLabelChange,
  onProviderKindChange,
  onSave,
  onTest,
  onTokenChange,
  providerKind,
  token
}: {
  accounts: ProviderAccount[];
  action: ProviderAccountAction;
  activeAccountId: string | null;
  baseUrl: string;
  canSave: boolean;
  connectionResults: Record<string, ProviderConnectionResult>;
  label: string;
  loading: boolean;
  onBaseUrlChange(value: string): void;
  onDelete(account: ProviderAccount): void;
  onLabelChange(value: string): void;
  onProviderKindChange(providerKind: ProviderAccountKind): void;
  onSave(): void;
  onTest(account: ProviderAccount): void;
  onTokenChange(value: string): void;
  providerKind: ProviderAccountKind;
  token: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border bg-background p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <IconServer aria-hidden="true" className="size-4 shrink-0" />
          Accounts
        </div>
        <Badge variant={loading ? "outline" : "secondary"}>{loading ? "Loading" : accounts.length}</Badge>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="provider-account-kind">
          Provider
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={action !== null}
            id="provider-account-kind"
            onChange={(event) => {
              onProviderKindChange(event.target.value as ProviderAccountKind);
            }}
            value={providerKind}
          >
            {providerAccountKinds.map((kind) => (
              <option key={kind} value={kind}>
                {providerKindLabels[kind]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="provider-account-base-url">
          Base URL
          <input
            className="h-8 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            disabled={action !== null}
            id="provider-account-base-url"
            onChange={(event) => {
              onBaseUrlChange(event.target.value);
            }}
            placeholder="https://gitlab.company.test"
            value={baseUrl}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="provider-account-label">
            Label
            <input
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={action !== null}
              id="provider-account-label"
              onChange={(event) => {
                onLabelChange(event.target.value);
              }}
              placeholder="Work"
              value={label}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground" htmlFor="provider-account-token">
            Token
            <input
              autoComplete="off"
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              disabled={action !== null}
              id="provider-account-token"
              onChange={(event) => {
                onTokenChange(event.target.value);
              }}
              placeholder="Access token"
              type="password"
              value={token}
            />
          </label>
        </div>

        <Button disabled={!canSave} size="sm" type="submit" variant="secondary">
          <IconPlus aria-hidden="true" data-icon="inline-start" />
          {action === "save-account" ? "Saving" : "Save"}
        </Button>
      </form>

      <div className="flex max-h-64 flex-col gap-2 overflow-auto">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading accounts</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts configured.</p>
        ) : (
          accounts.map((account) => (
            <ProviderAccountCard
              account={account}
              action={action}
              activeAccountId={activeAccountId}
              connectionResult={connectionResults[account.id]}
              key={account.id}
              onDelete={onDelete}
              onTest={onTest}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProviderWorkItemCard({ item }: { item: ProviderWorkItem }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {formatWorkItemAuthor(item.author)} | {formatWorkItemBranchFlow(item.sourceBranch, item.targetBranch)}
          </p>
        </div>
        <Badge className="shrink-0" variant="secondary">
          {providerKindLabels[item.providerKind]}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge variant="outline">{item.remoteName}</Badge>
        <Badge variant="outline">{item.state}</Badge>
        <Badge variant={providerCheckStatusBadgeVariant(item.checkStatus)}>CI: {item.checkStatus}</Badge>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <ProviderExternalLink label="PR/MR" providerBaseUrl={item.providerBaseUrl} url={item.webUrl} />
        <ProviderExternalLink label="CI" providerBaseUrl={item.providerBaseUrl} url={item.ciUrl} />
      </div>
    </div>
  );
}

function ProviderAccountCard({
  account,
  action,
  activeAccountId,
  connectionResult,
  onDelete,
  onTest
}: {
  account: ProviderAccount;
  action: ProviderAccountAction;
  activeAccountId: string | null;
  connectionResult: ProviderConnectionResult | undefined;
  onDelete(account: ProviderAccount): void;
  onTest(account: ProviderAccount): void;
}) {
  const accountActionIsActive = activeAccountId === account.id;

  return (
    <div className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{account.label}</p>
          <p className="truncate text-xs text-muted-foreground">{account.baseUrl}</p>
        </div>
        <Badge className="shrink-0" variant="secondary">
          {providerKindLabels[account.providerKind]}
        </Badge>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge variant={account.tokenConfigured ? "secondary" : "outline"}>
          Token: {formatBoolean(account.tokenConfigured)}
        </Badge>
        <ProviderConnectionBadge result={connectionResult} />
      </div>

      <ProviderConnectionSummary result={connectionResult} />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          disabled={action !== null}
          onClick={() => {
            onTest(account);
          }}
          size="sm"
          type="button"
          variant="secondary"
        >
          {action === "test-account" && accountActionIsActive ? "Testing" : "Test"}
        </Button>
        <Button
          disabled={action !== null}
          onClick={() => {
            onDelete(account);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconTrash aria-hidden="true" data-icon="inline-start" />
          {action === "delete-account" && accountActionIsActive ? "Deleting" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function ProviderExternalLink({
  label,
  providerBaseUrl,
  url
}: {
  label: string;
  providerBaseUrl: string;
  url: string | null;
}) {
  const trustedUrl = trustedProviderUrl(url, providerBaseUrl);

  if (trustedUrl === null) {
    return (
      <Button disabled size="sm" type="button" variant="outline">
        {label}
      </Button>
    );
  }

  return (
    <Button
      onClick={() => {
        openProviderUrl(trustedUrl);
      }}
      size="sm"
      type="button"
      variant="secondary"
    >
      <IconExternalLink aria-hidden="true" data-icon="inline-start" />
      {label}
    </Button>
  );
}

function ProviderConnectionBadge({ result }: { result: ProviderConnectionResult | undefined }) {
  if (result === undefined) {
    return <Badge variant="outline">Not tested</Badge>;
  }

  return <Badge variant={result.ok ? "secondary" : "destructive"}>{result.ok ? "OK" : "Failed"}</Badge>;
}

function ProviderConnectionSummary({ result }: { result: ProviderConnectionResult | undefined }) {
  if (result === undefined) {
    return <p className="mt-2 text-xs text-muted-foreground">Last test: not run.</p>;
  }

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {formatProviderStatusCode(result.statusCode)} - {result.message}
    </p>
  );
}

function ProviderRemoteCard({ remote }: { remote: ProviderRemote }) {
  return (
    <div className="rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">{remote.remoteName}</p>
        <Badge className="shrink-0" variant="secondary">
          {providerKindLabels[remote.providerKind]}
        </Badge>
      </div>

      <div className="mt-2 grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Host</span>
        <span className="truncate">{formatProviderValue(remote.host)}</span>
        <span className="text-muted-foreground">Owner/repo</span>
        <span className="truncate">{formatProviderOwnerRepository(remote)}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <ProviderUrlAvailability label="Fetch" url={remote.fetchUrl} />
        <ProviderUrlAvailability label="Push" url={remote.pushUrl} />
      </div>
    </div>
  );
}

function ProviderUrlAvailability({ label, url }: { label: string; url: string | null }) {
  const available = url !== null;

  return (
    <Badge className="justify-center" variant={available ? "secondary" : "outline"}>
      {label}: {available ? "yes" : "no"}
    </Badge>
  );
}

function formatProviderWorkMessage(message: string): string {
  return message.length === 0 ? "No PRs or MRs found." : message;
}

function formatWorkItemAuthor(author: string | null): string {
  return author ?? "unknown author";
}

function formatWorkItemBranchFlow(sourceBranch: string | null, targetBranch: string | null): string {
  return `${sourceBranch ?? "unknown"} -> ${targetBranch ?? "unknown"}`;
}

function providerCheckStatusBadgeVariant(status: ProviderCheckStatus): "secondary" | "destructive" | "outline" {
  if (status === "success") {
    return "secondary";
  }

  if (status === "failed" || status === "canceled") {
    return "destructive";
  }

  return "outline";
}

function openProviderUrl(url: string) {
  if (hasTauriRuntime()) {
    void openUrl(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function hasTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

function formatProviderValue(value: string | null): string {
  return value ?? "unknown";
}

function formatProviderOwnerRepository(remote: ProviderRemote): string {
  if (remote.owner === null && remote.repository === null) {
    return "unknown";
  }

  return `${formatProviderValue(remote.owner)}/${formatProviderValue(remote.repository)}`;
}

function upsertProviderAccount(accounts: ProviderAccount[], account: ProviderAccount): ProviderAccount[] {
  if (accounts.some((providerAccount) => providerAccount.id === account.id)) {
    return accounts.map((providerAccount) => (providerAccount.id === account.id ? account : providerAccount));
  }

  return [account, ...accounts];
}

function removeProviderConnectionResult(
  results: Record<string, ProviderConnectionResult>,
  accountId: string
): Record<string, ProviderConnectionResult> {
  const nextResults = { ...results };
  delete nextResults[accountId];
  return nextResults;
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function formatProviderStatusCode(statusCode: number | null): string {
  return statusCode === null ? "No HTTP status" : `HTTP ${statusCode}`;
}

function CommitGraphRail({ row, selected }: { row: CommitGraphRow; selected: boolean }) {
  const railWidth = row.laneCount * commitGraphLaneWidth;
  const connectorStartLane = Math.min(...row.connectorLanes);
  const connectorEndLane = Math.max(...row.connectorLanes);
  const hasConnector = connectorStartLane !== connectorEndLane;

  return (
    <span className="relative shrink-0 self-stretch" style={{ width: `${railWidth}px` }} aria-hidden="true">
      {row.lanes.map((lane) => (
        <CommitGraphLaneSegments lane={lane} key={lane.lane} />
      ))}
      {hasConnector ? (
        <span
          className={cn(
            "absolute top-1/2 h-px -translate-y-1/2 rounded-full",
            commitGraphLaneColorClass(row.currentLane)
          )}
          style={{
            left: commitGraphLaneOffset(connectorStartLane),
            width: `${(connectorEndLane - connectorStartLane) * commitGraphLaneWidth}px`
          }}
        />
      ) : null}
      <span
        className={cn(
          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background",
          selected ? "border-primary ring-2 ring-primary/30" : "border-background",
          commitGraphLaneColorClass(row.currentLane)
        )}
        style={{ left: commitGraphLaneOffset(row.currentLane) }}
      />
    </span>
  );
}

function CommitGraphLaneSegments({ lane }: { lane: CommitGraphLane }) {
  return (
    <>
      {lane.continuesAbove ? (
        <span
          className={cn("absolute top-0 h-1/2 w-px -translate-x-1/2 rounded-full", commitGraphLaneColorClass(lane.colorIndex))}
          style={{ left: commitGraphLaneOffset(lane.lane) }}
        />
      ) : null}
      {lane.continuesBelow ? (
        <span
          className={cn(
            "absolute bottom-0 h-1/2 w-px -translate-x-1/2 rounded-full",
            commitGraphLaneColorClass(lane.colorIndex)
          )}
          style={{ left: commitGraphLaneOffset(lane.lane) }}
        />
      ) : null}
    </>
  );
}

function commitGraphLaneOffset(laneIndex: number): string {
  return `${laneIndex * commitGraphLaneWidth + commitGraphLaneWidth / 2}px`;
}

function commitGraphLaneColorClass(laneIndex: number): string {
  return commitGraphLaneClasses[laneIndex % commitGraphLaneClasses.length];
}

function CommitRefBadges({ refs }: { refs: string[] }) {
  const visibleRefs = refs.slice(0, 3);
  const hiddenRefCount = refs.length - visibleRefs.length;

  if (refs.length === 0) {
    return null;
  }

  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1">
      {visibleRefs.map((commitRef) => {
        const commitRefKind = classifyCommitRef(commitRef);

        return (
          <Badge
            className={cn("max-w-28 truncate", commitRefBadgeClassName(commitRefKind))}
            key={commitRef}
            variant={commitRefBadgeVariant(commitRefKind)}
          >
            {commitRef}
          </Badge>
        );
      })}
      {hiddenRefCount > 0 ? <Badge variant="outline">+{hiddenRefCount}</Badge> : null}
    </span>
  );
}

function commitRefBadgeVariant(kind: CommitRefKind): "default" | "secondary" | "outline" {
  if (kind === "head") {
    return "default";
  }

  if (kind === "tag" || kind === "local") {
    return "secondary";
  }

  return "outline";
}

function commitRefBadgeClassName(kind: CommitRefKind): string {
  if (kind === "head") {
    return "border-primary/30 bg-primary text-primary-foreground";
  }

  if (kind === "tag") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  if (kind === "local") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
}

function CommitDetailsView({
  commit,
  details,
  loading
}: {
  commit: CommitSummary | null;
  details: CommitDetails | null;
  loading: boolean;
}) {
  if (commit === null) {
    return (
      <div className="min-h-[620px] min-w-0 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
        Select a commit to inspect its details.
      </div>
    );
  }

  return (
    <div className="min-h-[620px] min-w-0 rounded-md border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{commit.subject}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {commit.authorName} &lt;{commit.authorEmail}&gt; | {formatCommitDate(commit.authoredAt)} | {commit.shortOid}
          </p>
        </div>
        <CommitRefBadges refs={commit.refs} />
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading commit details...</p>
      ) : details === null ? (
        <p className="mt-4 text-sm text-muted-foreground">No commit details loaded.</p>
      ) : (
        <div className="mt-4 min-w-0">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Body</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {details.body.length === 0 ? "No commit body." : details.body}
            </p>
          </div>

          <Separator className="my-4" />

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase text-muted-foreground">Changed files</p>
              <Badge variant="secondary">{details.files.length}</Badge>
            </div>
            <div className="mt-2 max-h-44 overflow-auto border-y">
              {details.files.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No changed files reported.</p>
              ) : (
                details.files.map((file) => <CommitChangedFileRow file={file} key={`${file.changeType}:${file.path}`} />)
              )}
            </div>
          </div>

          <Separator className="my-4" />

          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">Patch</p>
            <pre className="mt-2 max-h-[280px] overflow-auto rounded-md bg-background p-3 text-xs leading-5">
              {details.diffText.length === 0 ? "No patch text." : details.diffText}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function CommitChangedFileRow({ file }: { file: CommitChangedFile }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)_96px] items-center gap-3 border-b py-2 text-sm last:border-b-0">
      <Badge variant="outline">{file.changeType}</Badge>
      <div className="min-w-0">
        <p className="truncate font-medium">{file.path}</p>
        {file.previousPath === null ? null : <p className="truncate text-xs text-muted-foreground">from {file.previousPath}</p>}
      </div>
      <p className="text-right text-xs text-muted-foreground">{formatChangedFileStats(file)}</p>
    </div>
  );
}

function formatChangedFileStats(file: CommitChangedFile): string {
  if (file.additions === null || file.deletions === null) {
    return "binary";
  }

  return `+${file.additions} -${file.deletions}`;
}

function formatCommitDate(authoredAt: string): string {
  return new Date(authoredAt).toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric"
  });
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
