import type { DiffMode, GitFileStatus, RepositoryStatus, StatusFile } from "./repository-types";

export type RepositoryStatusSummary = {
  branchLabel: string;
  syncLabel: string;
  changedFileCount: number;
  hasUntrackedFiles: boolean;
};

export function summarizeRepositoryStatus(status: RepositoryStatus): RepositoryStatusSummary {
  return {
    branchLabel: status.branch ?? "Detached HEAD",
    changedFileCount: status.files.length,
    hasUntrackedFiles: status.files.some(
      (file) => file.indexStatus === "untracked" || file.worktreeStatus === "untracked"
    ),
    syncLabel: formatSyncLabel(status.ahead, status.behind)
  };
}

export function hasStagedChanges(file: StatusFile): boolean {
  return isChangedIndexStatus(file.indexStatus);
}

export function hasWorktreeChanges(file: StatusFile): boolean {
  return isChangedWorktreeStatus(file.worktreeStatus);
}

export function getPreferredDiffMode(file: StatusFile): DiffMode {
  if (hasStagedChanges(file) && !hasWorktreeChanges(file)) {
    return "staged";
  }

  return "worktree";
}

export function hasRepositoryStagedChanges(status: RepositoryStatus): boolean {
  return status.files.some(hasStagedChanges);
}

function isChangedIndexStatus(status: GitFileStatus): boolean {
  return status !== "unmodified" && status !== "untracked" && status !== "ignored" && status !== "unknown";
}

function isChangedWorktreeStatus(status: GitFileStatus): boolean {
  return status !== "unmodified" && status !== "ignored" && status !== "unknown";
}

function formatSyncLabel(ahead: number, behind: number): string {
  if (ahead > 0 && behind > 0) {
    return `${ahead} ahead, ${behind} behind`;
  }

  if (ahead > 0) {
    return `${ahead} ahead`;
  }

  if (behind > 0) {
    return `${behind} behind`;
  }

  return "Up to date";
}
