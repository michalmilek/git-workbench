import { describe, expect, test } from "vitest";

import {
  reconcileWorkspaceBatchSelection,
  toggleWorkspaceBatchPath,
  updateWorkspaceRepositorySnapshot,
  workspaceBatchTargets
} from "./workspace-batch";
import type { WorkspaceRepository } from "./repository-workspace";

describe("workspace batch helpers", () => {
  test("toggles selected repository paths", () => {
    expect(toggleWorkspaceBatchPath(["/work/alpha"], " /work/beta ")).toEqual(["/work/alpha", "/work/beta"]);
    expect(toggleWorkspaceBatchPath(["/work/alpha", "/work/beta"], "/work/alpha")).toEqual(["/work/beta"]);
    expect(toggleWorkspaceBatchPath(["/work/alpha", "/work/alpha", " "], " ")).toEqual(["/work/alpha"]);
  });

  test("drops stale selections when workspace repositories change", () => {
    const repositories = [workspaceRepository({ path: "/work/beta" }), workspaceRepository({ path: " /work/gamma " })];

    expect(reconcileWorkspaceBatchSelection(repositories, ["/work/alpha", " /work/beta ", "/work/gamma"])).toEqual([
      "/work/beta",
      "/work/gamma"
    ]);
  });

  test("resolves batch targets by action", () => {
    const repositories = [
      workspaceRepository({ path: "/work/alpha" }),
      workspaceRepository({ path: "/work/beta" }),
      workspaceRepository({ path: "/work/gamma" })
    ];

    expect(workspaceBatchTargets("fetch", repositories, ["/work/beta"])).toEqual(["/work/alpha", "/work/beta", "/work/gamma"]);
    expect(workspaceBatchTargets("pull", repositories, ["/work/beta", "/work/missing"])).toEqual(["/work/beta"]);
    expect(workspaceBatchTargets("push", repositories, ["/work/gamma"])).toEqual(["/work/gamma"]);
  });

  test("updates a workspace snapshot while preserving order and active state", () => {
    const repositories = [
      workspaceRepository({ active: true, path: "/work/alpha" }),
      workspaceRepository({ path: " /work/beta " })
    ];

    expect(
      updateWorkspaceRepositorySnapshot(repositories, " /work/beta ", {
        branchLabel: "feature/batch",
        changedFileCount: 3,
        hasUntrackedFiles: true,
        syncLabel: "2 ahead",
        updatedAt: "2026-05-16T12:00:00.000Z"
      })
    ).toEqual([
      repositories[0],
      {
        active: false,
        branchLabel: "feature/batch",
        changedFileCount: 3,
        hasUntrackedFiles: true,
        path: "/work/beta",
        syncLabel: "2 ahead",
        updatedAt: "2026-05-16T12:00:00.000Z"
      }
    ]);
    expect(updateWorkspaceRepositorySnapshot(repositories, "/work/missing", repositories[0])).toEqual(repositories);
  });
});

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
