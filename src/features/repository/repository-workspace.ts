export const WORKSPACE_REPOSITORIES_STORAGE_KEY = "git-workbench:workspace-repositories";
export const WORKSPACE_REPOSITORY_LIMIT = 6;

export type WorkspaceRepository = {
  path: string;
  branchLabel: string;
  syncLabel: string;
  changedFileCount: number;
  hasUntrackedFiles: boolean;
  active: boolean;
  updatedAt: string;
};

export function upsertWorkspaceRepository(
  repositories: WorkspaceRepository[],
  repository: WorkspaceRepository
): WorkspaceRepository[] {
  const path = repository.path.trim();
  if (path.length === 0) {
    return normalizeWorkspaceRepositories(repositories);
  }

  const updatedRepository: WorkspaceRepository = {
    ...repository,
    active: true,
    path
  };
  const existingRepositories = normalizeWorkspaceRepositories(repositories)
    .filter((existingRepository) => existingRepository.path !== path)
    .map((existingRepository) => ({
      ...existingRepository,
      active: false
    }));

  return [updatedRepository, ...existingRepositories].slice(0, WORKSPACE_REPOSITORY_LIMIT);
}

export function selectWorkspaceRepository(repositories: WorkspaceRepository[], path: string): WorkspaceRepository[] {
  const selectedPath = path.trim();
  if (selectedPath.length === 0) {
    return repositories;
  }

  if (!repositories.some((repository) => repository.path.trim() === selectedPath)) {
    return repositories;
  }

  return repositories.map((repository) => ({
    ...repository,
    active: repository.path.trim() === selectedPath
  }));
}

export function resetWorkspaceRepositorySelection(repositories: WorkspaceRepository[]): WorkspaceRepository[] {
  return repositories.map((repository) => ({
    ...repository,
    active: false
  }));
}

export function removeWorkspaceRepository(repositories: WorkspaceRepository[], path: string): WorkspaceRepository[] {
  const removedPath = path.trim();
  if (removedPath.length === 0) {
    return repositories;
  }

  return repositories.filter((repository) => repository.path.trim() !== removedPath);
}

export function parseWorkspaceRepositories(value: string | null): WorkspaceRepository[] {
  if (value === null || value.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeWorkspaceRepositories(parsed);
  } catch {
    return [];
  }
}

export function serializeWorkspaceRepositories(repositories: WorkspaceRepository[]): string {
  return JSON.stringify(normalizeWorkspaceRepositories(repositories));
}

function normalizeWorkspaceRepositories(repositories: unknown[]): WorkspaceRepository[] {
  const seen = new Set<string>();
  const workspaceRepositories: WorkspaceRepository[] = [];
  let activeRepositorySeen = false;

  for (const repository of repositories) {
    if (!isWorkspaceRepository(repository)) {
      continue;
    }

    const normalizedRepository = {
      ...repository,
      active: repository.active && !activeRepositorySeen,
      path: repository.path.trim()
    };
    if (seen.has(normalizedRepository.path)) {
      continue;
    }

    seen.add(normalizedRepository.path);
    if (normalizedRepository.active) {
      activeRepositorySeen = true;
    }
    workspaceRepositories.push(normalizedRepository);

    if (workspaceRepositories.length === WORKSPACE_REPOSITORY_LIMIT) {
      return workspaceRepositories;
    }
  }

  return workspaceRepositories;
}

function isWorkspaceRepository(value: unknown): value is WorkspaceRepository {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const repository = value as Partial<WorkspaceRepository>;
  const changedFileCount = repository.changedFileCount;

  return (
    typeof repository.path === "string" &&
    repository.path.trim().length > 0 &&
    typeof repository.branchLabel === "string" &&
    typeof repository.syncLabel === "string" &&
    Number.isInteger(changedFileCount) &&
    typeof changedFileCount === "number" &&
    changedFileCount >= 0 &&
    typeof repository.hasUntrackedFiles === "boolean" &&
    typeof repository.active === "boolean" &&
    typeof repository.updatedAt === "string"
  );
}
