import type { WorkspaceRepository } from "./repository-workspace";

export type WorkspaceBatchAction = "fetch" | "pull" | "push";

export type WorkspaceRepositorySnapshot = Pick<
  WorkspaceRepository,
  "branchLabel" | "syncLabel" | "changedFileCount" | "hasUntrackedFiles" | "updatedAt"
>;

export function toggleWorkspaceBatchPath(selectedPaths: string[], path: string): string[] {
  const normalizedSelection = normalizePaths(selectedPaths);
  const normalizedPath = path.trim();

  if (normalizedPath.length === 0) {
    return normalizedSelection;
  }

  if (normalizedSelection.includes(normalizedPath)) {
    return normalizedSelection.filter((selectedPath) => selectedPath !== normalizedPath);
  }

  return [...normalizedSelection, normalizedPath];
}

export function reconcileWorkspaceBatchSelection(
  repositories: WorkspaceRepository[],
  selectedPaths: string[]
): string[] {
  const repositoryPaths = new Set(normalizeRepositoryPaths(repositories));

  return normalizePaths(selectedPaths).filter((selectedPath) => repositoryPaths.has(selectedPath));
}

export function workspaceBatchTargets(
  action: WorkspaceBatchAction,
  repositories: WorkspaceRepository[],
  selectedPaths: string[]
): string[] {
  if (action === "fetch") {
    return normalizeRepositoryPaths(repositories);
  }

  return reconcileWorkspaceBatchSelection(repositories, selectedPaths);
}

export function updateWorkspaceRepositorySnapshot(
  repositories: WorkspaceRepository[],
  path: string,
  snapshot: WorkspaceRepositorySnapshot
): WorkspaceRepository[] {
  const normalizedPath = path.trim();

  if (normalizedPath.length === 0 || !repositories.some((repository) => repository.path.trim() === normalizedPath)) {
    return repositories;
  }

  return repositories.map((repository) =>
    repository.path.trim() === normalizedPath
      ? {
          ...repository,
          ...snapshot,
          path: normalizedPath
        }
      : repository
  );
}

function normalizeRepositoryPaths(repositories: WorkspaceRepository[]): string[] {
  return normalizePaths(repositories.map((repository) => repository.path));
}

function normalizePaths(paths: string[]): string[] {
  const normalizedPaths: string[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    const normalizedPath = path.trim();

    if (normalizedPath.length === 0 || seen.has(normalizedPath)) {
      continue;
    }

    seen.add(normalizedPath);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}
