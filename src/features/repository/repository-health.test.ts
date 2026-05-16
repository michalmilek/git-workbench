import { describe, expect, test } from "vitest";

import { buildRepositoryHealth } from "./repository-health";
import type { ConflictState, ProviderCheckStatus, ProviderWorkItem, RepositoryStatus, StatusFile } from "./repository-types";

const now = new Date("2026-05-16T10:30:00.000Z");

describe("buildRepositoryHealth", () => {
  test("returns a neutral state when no repository is opened", () => {
    expect(
      buildRepositoryHealth({
        conflictState: conflictState("merge"),
        now,
        providerWorkItems: [providerWorkItem("failed")],
        providerWorkItemsState: "loaded",
        refreshedAt: now,
        status: null
      })
    ).toEqual({
      ciLabel: "No repository",
      ciTone: "outline",
      dirtyLabel: "No repository",
      dirtyTone: "outline",
      lastRefreshLabel: "Never refreshed",
      repositoryOpened: false,
      syncLabel: "No repository",
      workItemLabel: "No repository"
    });
  });

  test("classifies dirty states", () => {
    expect(healthForFiles([])).toMatchObject({ dirtyLabel: "Clean", dirtyTone: "secondary" });
    expect(healthForFiles([statusFile("src/App.tsx", "modified", "unmodified")])).toMatchObject({
      dirtyLabel: "Changed",
      dirtyTone: "outline"
    });
    expect(healthForFiles([statusFile("scratch.txt", "untracked", "untracked")])).toMatchObject({
      dirtyLabel: "Untracked",
      dirtyTone: "outline"
    });
    expect(
      healthForFiles([
        statusFile("src/App.tsx", "modified", "unmodified"),
        statusFile("scratch.txt", "untracked", "untracked")
      ])
    ).toMatchObject({ dirtyLabel: "Changed with untracked", dirtyTone: "outline" });
  });

  test("prioritizes conflicts over other dirty states", () => {
    const health = buildRepositoryHealth({
      conflictState: conflictState("rebase"),
      now,
      providerWorkItems: [],
      providerWorkItemsState: "loaded",
      refreshedAt: now,
      status: repositoryStatus([statusFile("scratch.txt", "untracked", "untracked")])
    });

    expect(health).toMatchObject({ dirtyLabel: "Conflicts", dirtyTone: "destructive" });
  });

  test("reuses repository status sync labels", () => {
    expect(buildRepositoryHealth(baseInput({ status: repositoryStatus([], 2, 1) })).syncLabel).toBe("2 ahead, 1 behind");
  });

  test("rolls up provider work items", () => {
    expect(buildRepositoryHealth(baseInput({ providerWorkItems: [] }))).toMatchObject({
      ciLabel: "No PR/MR",
      ciTone: "outline",
      workItemLabel: "No PR/MR"
    });
    expect(buildRepositoryHealth(baseInput({ providerWorkItems: [providerWorkItem("success")] }))).toMatchObject({
      ciLabel: "Passing",
      ciTone: "secondary",
      workItemLabel: "1 open PR/MR"
    });
    expect(
      buildRepositoryHealth(baseInput({ providerWorkItems: [providerWorkItem("pending"), providerWorkItem("success")] }))
    ).toMatchObject({
      ciLabel: "Running",
      ciTone: "outline",
      workItemLabel: "2 open PRs/MRs"
    });
    expect(
      buildRepositoryHealth(baseInput({ providerWorkItems: [providerWorkItem("failed"), providerWorkItem("running")] }))
    ).toMatchObject({
      ciLabel: "Failed",
      ciTone: "destructive",
      workItemLabel: "2 open PRs/MRs"
    });
    expect(buildRepositoryHealth(baseInput({ providerWorkItems: [providerWorkItem("unknown")] }))).toMatchObject({
      ciLabel: "Unknown",
      ciTone: "outline",
      workItemLabel: "1 open PR/MR"
    });
  });

  test("does not report empty provider work as absent while provider data is loading or unavailable", () => {
    const loadingInput = { ...baseInput(), providerWorkItems: [], providerWorkItemsState: "loading" as const };
    const unavailableInput = { ...baseInput(), providerWorkItems: [], providerWorkItemsState: "unavailable" as const };

    expect(buildRepositoryHealth(loadingInput)).toMatchObject({
      ciLabel: "Loading",
      ciTone: "outline",
      workItemLabel: "Loading"
    });
    expect(buildRepositoryHealth(unavailableInput)).toMatchObject({
      ciLabel: "Unknown",
      ciTone: "outline",
      workItemLabel: "Unknown"
    });
  });

  test("formats refresh ages", () => {
    expect(buildRepositoryHealth(baseInput({ refreshedAt: null })).lastRefreshLabel).toBe("Never refreshed");
    expect(buildRepositoryHealth(baseInput({ refreshedAt: new Date("2026-05-16T10:29:45.000Z") })).lastRefreshLabel).toBe(
      "Just now"
    );
    expect(buildRepositoryHealth(baseInput({ refreshedAt: new Date("2026-05-16T10:25:00.000Z") })).lastRefreshLabel).toBe(
      "5 min ago"
    );
    expect(buildRepositoryHealth(baseInput({ refreshedAt: new Date("2026-05-16T08:00:00.000Z") })).lastRefreshLabel).toBe(
      "2 hr ago"
    );
    expect(buildRepositoryHealth(baseInput({ refreshedAt: new Date("2026-05-15T10:30:00.000Z") })).lastRefreshLabel).toBe(
      "1 day ago"
    );
    expect(buildRepositoryHealth(baseInput({ refreshedAt: new Date("2026-05-13T10:30:00.000Z") })).lastRefreshLabel).toBe(
      "3 days ago"
    );
  });
});

function baseInput(
  overrides: Partial<Parameters<typeof buildRepositoryHealth>[0]> = {}
): Parameters<typeof buildRepositoryHealth>[0] {
  return {
    conflictState: noConflictState(),
    now,
    providerWorkItems: [],
    providerWorkItemsState: "loaded",
    refreshedAt: now,
    status: repositoryStatus([]),
    ...overrides
  };
}

function healthForFiles(files: StatusFile[]) {
  return buildRepositoryHealth(baseInput({ status: repositoryStatus(files) }));
}

function repositoryStatus(files: StatusFile[], ahead = 0, behind = 0): RepositoryStatus {
  return {
    ahead,
    behind,
    branch: "main",
    files,
    upstream: "origin/main"
  };
}

function statusFile(path: string, indexStatus: StatusFile["indexStatus"], worktreeStatus: StatusFile["worktreeStatus"]): StatusFile {
  return {
    conflict: false,
    indexStatus,
    path,
    worktreeStatus
  };
}

function noConflictState(): ConflictState {
  return {
    canAbortMerge: false,
    canAbortRebase: false,
    canContinueRebase: false,
    files: [],
    message: "No merge or rebase in progress.",
    operation: "none"
  };
}

function conflictState(operation: Exclude<ConflictState["operation"], "none">): ConflictState {
  return {
    canAbortMerge: operation === "merge",
    canAbortRebase: operation === "rebase",
    canContinueRebase: operation === "rebase",
    files: [{ indexStatus: "unmerged", path: "src/App.tsx", worktreeStatus: "unmerged" }],
    message: "Resolve conflicts before continuing.",
    operation
  };
}

function providerWorkItem(checkStatus: ProviderCheckStatus): ProviderWorkItem {
  return {
    accountId: "account-1",
    author: "alex",
    checkStatus,
    ciUrl: "https://github.test/actions/1",
    id: `item-${checkStatus}`,
    providerBaseUrl: "https://github.test",
    providerKind: "github",
    remoteName: "origin",
    sourceBranch: "feature",
    state: "open",
    targetBranch: "main",
    title: "Feature",
    webUrl: "https://github.test/repo/pull/1"
  };
}
