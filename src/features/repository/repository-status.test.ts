import { describe, expect, test } from "vitest";

import {
  getPreferredDiffMode,
  hasRepositoryStagedChanges,
  hasStagedChanges,
  hasWorktreeChanges,
  summarizeRepositoryStatus
} from "./repository-status";
import type { RepositoryStatus } from "./repository-types";

describe("summarizeRepositoryStatus", () => {
  test("summarizes branch divergence and changed files", () => {
    const status: RepositoryStatus = {
      ahead: 2,
      behind: 1,
      branch: "feature/workbench",
      files: [
        { conflict: false, indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" },
        { conflict: false, indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" },
        { conflict: false, indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" }
      ],
      upstream: "origin/feature/workbench"
    };

    expect(summarizeRepositoryStatus(status)).toEqual({
      branchLabel: "feature/workbench",
      changedFileCount: 3,
      hasUntrackedFiles: true,
      syncLabel: "2 ahead, 1 behind"
    });
  });

  test("summarizes a detached repository with no divergence", () => {
    const status: RepositoryStatus = {
      ahead: 0,
      behind: 0,
      branch: null,
      files: [{ conflict: false, indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "unmodified" }],
      upstream: null
    };

    expect(summarizeRepositoryStatus(status)).toEqual({
      branchLabel: "Detached HEAD",
      changedFileCount: 1,
      hasUntrackedFiles: false,
      syncLabel: "Up to date"
    });
  });
});

describe("file status helpers", () => {
  test("detects staged and worktree changes", () => {
    expect(hasStagedChanges({ conflict: false, indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "unmodified" })).toBe(
      true
    );
    expect(hasStagedChanges({ conflict: false, indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" })).toBe(
      false
    );
    expect(hasWorktreeChanges({ conflict: false, indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" })).toBe(
      true
    );
  });

  test("prefers staged diff for staged-only files", () => {
    expect(getPreferredDiffMode({ conflict: false, indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" })).toBe(
      "staged"
    );
    expect(getPreferredDiffMode({ conflict: false, indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "modified" })).toBe(
      "worktree"
    );
    expect(getPreferredDiffMode({ conflict: false, indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" })).toBe(
      "worktree"
    );
  });

  test("detects repository-level staged changes", () => {
    expect(
      hasRepositoryStagedChanges({
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [
          { conflict: false, indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" },
          { conflict: false, indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" }
        ],
        upstream: null
      })
    ).toBe(false);

    expect(
      hasRepositoryStagedChanges({
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [{ conflict: false, indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" }],
        upstream: null
      })
    ).toBe(true);
  });
});
