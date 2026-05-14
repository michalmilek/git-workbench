import type { RepositoryStatus } from "./repository-types";

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
