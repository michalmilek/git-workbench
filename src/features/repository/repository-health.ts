import { summarizeRepositoryStatus } from "./repository-status";
import type { ConflictState, ProviderCheckStatus, ProviderWorkItem, RepositoryStatus, StatusFile } from "./repository-types";

export type RepositoryHealthTone = "secondary" | "destructive" | "outline";
export type ProviderWorkItemsState = "idle" | "loading" | "loaded" | "unavailable";

export type RepositoryHealth = {
  repositoryOpened: boolean;
  dirtyLabel: string;
  dirtyTone: RepositoryHealthTone;
  syncLabel: string;
  workItemLabel: string;
  ciLabel: string;
  ciTone: RepositoryHealthTone;
  lastRefreshLabel: string;
};

export type BuildRepositoryHealthInput = {
  status: RepositoryStatus | null;
  conflictState: ConflictState | null;
  providerWorkItems: ProviderWorkItem[];
  providerWorkItemsState: ProviderWorkItemsState;
  refreshedAt: Date | null;
  now: Date;
};

export function buildRepositoryHealth(input: BuildRepositoryHealthInput): RepositoryHealth {
  if (input.status === null) {
    return {
      ciLabel: "No repository",
      ciTone: "outline",
      dirtyLabel: "No repository",
      dirtyTone: "outline",
      lastRefreshLabel: "Never refreshed",
      repositoryOpened: false,
      syncLabel: "No repository",
      workItemLabel: "No repository"
    };
  }

  const summary = summarizeRepositoryStatus(input.status);
  const dirtyHealth = buildDirtyHealth(input.status, input.conflictState);
  const providerHealth = buildProviderHealth(input.providerWorkItems, input.providerWorkItemsState);

  return {
    ...dirtyHealth,
    ...providerHealth,
    lastRefreshLabel: formatRefreshAge(input.refreshedAt, input.now),
    repositoryOpened: true,
    syncLabel: summary.syncLabel
  };
}

function buildDirtyHealth(
  status: RepositoryStatus,
  conflictState: ConflictState | null
): Pick<RepositoryHealth, "dirtyLabel" | "dirtyTone"> {
  if (hasConflicts(status, conflictState)) {
    return { dirtyLabel: "Conflicts", dirtyTone: "destructive" };
  }

  if (status.files.length === 0) {
    return { dirtyLabel: "Clean", dirtyTone: "secondary" };
  }

  const hasUntracked = status.files.some(isUntrackedFile);
  const hasChanged = status.files.some((file) => !isUntrackedFile(file));

  if (hasChanged && hasUntracked) {
    return { dirtyLabel: "Changed with untracked", dirtyTone: "outline" };
  }

  if (hasUntracked) {
    return { dirtyLabel: "Untracked", dirtyTone: "outline" };
  }

  return { dirtyLabel: "Changed", dirtyTone: "outline" };
}

function hasConflicts(status: RepositoryStatus, conflictState: ConflictState | null): boolean {
  return (
    status.files.some((file) => file.conflict) ||
    (conflictState !== null && (conflictState.operation !== "none" || conflictState.files.length > 0))
  );
}

function isUntrackedFile(file: StatusFile): boolean {
  return file.indexStatus === "untracked" || file.worktreeStatus === "untracked";
}

function buildProviderHealth(
  providerWorkItems: ProviderWorkItem[],
  providerWorkItemsState: ProviderWorkItemsState
): Pick<RepositoryHealth, "workItemLabel" | "ciLabel" | "ciTone"> {
  if (providerWorkItemsState === "loading") {
    return {
      ciLabel: "Loading",
      ciTone: "outline",
      workItemLabel: "Loading"
    };
  }

  if (providerWorkItemsState === "idle" || providerWorkItemsState === "unavailable") {
    return {
      ciLabel: "Unknown",
      ciTone: "outline",
      workItemLabel: "Unknown"
    };
  }

  if (providerWorkItems.length === 0) {
    return {
      ciLabel: "No PR/MR",
      ciTone: "outline",
      workItemLabel: "No PR/MR"
    };
  }

  const checkStatus = aggregateCheckStatus(providerWorkItems);
  const workItemLabel = providerWorkItems.length === 1 ? "1 open PR/MR" : `${providerWorkItems.length} open PRs/MRs`;

  if (checkStatus === "failed" || checkStatus === "canceled") {
    return { ciLabel: "Failed", ciTone: "destructive", workItemLabel };
  }

  if (checkStatus === "running" || checkStatus === "pending") {
    return { ciLabel: "Running", ciTone: "outline", workItemLabel };
  }

  if (checkStatus === "success") {
    return { ciLabel: "Passing", ciTone: "secondary", workItemLabel };
  }

  return { ciLabel: "Unknown", ciTone: "outline", workItemLabel };
}

function aggregateCheckStatus(providerWorkItems: ProviderWorkItem[]): ProviderCheckStatus {
  return providerWorkItems.reduce<ProviderCheckStatus>((current, item) => {
    if (checkStatusPriority(item.checkStatus) > checkStatusPriority(current)) {
      return item.checkStatus;
    }

    return current;
  }, "unknown");
}

function checkStatusPriority(status: ProviderCheckStatus): number {
  switch (status) {
    case "failed":
    case "canceled":
      return 4;
    case "running":
    case "pending":
      return 3;
    case "success":
      return 2;
    case "unknown":
      return 1;
  }
}

function formatRefreshAge(refreshedAt: Date | null, now: Date): string {
  if (refreshedAt === null) {
    return "Never refreshed";
  }

  const elapsedMinutes = Math.floor((now.getTime() - refreshedAt.getTime()) / 60_000);

  if (elapsedMinutes < 1) {
    return "Just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours} hr ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);

  return `${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} ago`;
}
