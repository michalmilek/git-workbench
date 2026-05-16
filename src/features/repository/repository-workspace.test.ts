import { describe, expect, test } from "vitest";

import {
  WORKSPACE_REPOSITORIES_STORAGE_KEY,
  WORKSPACE_REPOSITORY_LIMIT,
  parseWorkspaceRepositories,
  resetWorkspaceRepositorySelection,
  removeWorkspaceRepository,
  selectWorkspaceRepository,
  serializeWorkspaceRepositories,
  upsertWorkspaceRepository,
  type WorkspaceRepository
} from "./repository-workspace";

function workspaceRepository(input: Partial<WorkspaceRepository> & Pick<WorkspaceRepository, "path">): WorkspaceRepository {
  return {
    active: false,
    branchLabel: "main",
    changedFileCount: 0,
    hasUntrackedFiles: false,
    syncLabel: "Up to date",
    updatedAt: "2026-05-16T08:00:00.000Z",
    ...input
  };
}

describe("workspace repository helpers", () => {
  test("exports stable localStorage settings", () => {
    expect(WORKSPACE_REPOSITORIES_STORAGE_KEY).toBe("git-workbench:workspace-repositories");
    expect(WORKSPACE_REPOSITORY_LIMIT).toBe(6);
  });

  test("returns an empty list for empty stored values", () => {
    expect(parseWorkspaceRepositories(null)).toEqual([]);
    expect(parseWorkspaceRepositories("")).toEqual([]);
  });

  test("upserts a repository at the top, deduplicates by trimmed path, and marks it active", () => {
    const updated = workspaceRepository({
      active: false,
      branchLabel: "feature",
      changedFileCount: 3,
      hasUntrackedFiles: true,
      path: " /work/beta ",
      syncLabel: "2 ahead",
      updatedAt: "2026-05-16T09:00:00.000Z"
    });
    const repositories = [
      workspaceRepository({ active: true, path: "/work/alpha" }),
      workspaceRepository({ path: "/work/beta" })
    ];

    expect(upsertWorkspaceRepository(repositories, updated)).toEqual([
      {
        ...updated,
        active: true,
        path: "/work/beta"
      },
      {
        ...repositories[0],
        active: false
      }
    ]);
  });

  test("selects an existing repository without reordering", () => {
    const alpha = workspaceRepository({ active: true, path: "/work/alpha" });
    const beta = workspaceRepository({ path: " /work/beta " });

    expect(selectWorkspaceRepository([alpha, beta], " /work/beta ")).toEqual([
      {
        ...alpha,
        active: false
      },
      {
        ...beta,
        active: true
      }
    ]);
  });

  test("resets persisted active state for startup", () => {
    const alpha = workspaceRepository({ active: true, path: "/work/alpha" });
    const beta = workspaceRepository({ path: "/work/beta" });

    expect(resetWorkspaceRepositorySelection([alpha, beta])).toEqual([
      {
        ...alpha,
        active: false
      },
      beta
    ]);
  });

  test("does not change the workspace when selecting a missing or empty path", () => {
    const repositories = [workspaceRepository({ active: true, path: "/work/alpha" })];

    expect(selectWorkspaceRepository(repositories, "/work/beta")).toEqual(repositories);
    expect(selectWorkspaceRepository(repositories, " ")).toEqual(repositories);
  });

  test("removes a repository by trimmed path", () => {
    const alpha = workspaceRepository({ path: "/work/alpha" });
    const beta = workspaceRepository({ path: "/work/beta" });

    expect(removeWorkspaceRepository([alpha, beta], " /work/alpha ")).toEqual([beta]);
  });

  test("enforces the workspace repository limit", () => {
    const existing = Array.from({ length: WORKSPACE_REPOSITORY_LIMIT }, (_, index) =>
      workspaceRepository({ path: `/work/repo-${index}` })
    );
    const next = workspaceRepository({ path: "/work/new" });

    const result = upsertWorkspaceRepository(existing, next);

    expect(result).toHaveLength(WORKSPACE_REPOSITORY_LIMIT);
    expect(result[0]).toEqual({
      ...next,
      active: true
    });
    expect(result).not.toContainEqual(existing[existing.length - 1]);
  });

  test("drops invalid stored repository entries", () => {
    const valid = workspaceRepository({ active: true, path: " /work/valid " });
    const stored = JSON.stringify([
      valid,
      { ...valid, path: "" },
      { ...valid, changedFileCount: -1 },
      { ...valid, hasUntrackedFiles: "no" },
      { ...valid, active: "yes" },
      { ...valid, updatedAt: 123 },
      "not a repository"
    ]);

    expect(parseWorkspaceRepositories("not json")).toEqual([]);
    expect(parseWorkspaceRepositories(JSON.stringify({ path: "/work/valid" }))).toEqual([]);
    expect(parseWorkspaceRepositories(stored)).toEqual([
      {
        ...valid,
        path: "/work/valid"
      }
    ]);
  });

  test("keeps only the first active stored repository", () => {
    const alpha = workspaceRepository({ active: true, path: "/work/alpha" });
    const beta = workspaceRepository({ active: true, path: "/work/beta" });
    const gamma = workspaceRepository({ path: "/work/gamma" });

    expect(parseWorkspaceRepositories(JSON.stringify([alpha, beta, gamma]))).toEqual([
      alpha,
      {
        ...beta,
        active: false
      },
      gamma
    ]);
  });

  test("serializes normalized valid repositories", () => {
    const valid = workspaceRepository({ path: " /work/valid " });
    const serialized = serializeWorkspaceRepositories([
      valid,
      { ...valid, path: "" }
    ] as WorkspaceRepository[]);

    expect(JSON.parse(serialized)).toEqual([
      {
        ...valid,
        path: "/work/valid"
      }
    ]);
  });
});
