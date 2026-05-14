export const RECENT_REPOSITORY_LIMIT = 6;
export const RECENT_REPOSITORIES_STORAGE_KEY = "git-workbench:recent-repositories";

export function updateRecentRepositories(repositories: string[], repositoryPath: string): string[] {
  return normalizeRecentRepositories([repositoryPath, ...repositories]);
}

export function parseRecentRepositories(value: string | null): string[] {
  if (value === null) {
    return [];
  }

  return normalizeRecentRepositories(JSON.parse(value) as string[]);
}

export function serializeRecentRepositories(repositories: string[]): string {
  return JSON.stringify(normalizeRecentRepositories(repositories));
}

function normalizeRecentRepositories(repositories: string[]): string[] {
  const seen = new Set<string>();
  const recents: string[] = [];

  for (const repository of repositories) {
    const path = repository.trim();
    if (path.length === 0 || seen.has(path)) {
      continue;
    }

    seen.add(path);
    recents.push(path);

    if (recents.length === RECENT_REPOSITORY_LIMIT) {
      return recents;
    }
  }

  return recents;
}
