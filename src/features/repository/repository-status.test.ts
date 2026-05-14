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
        { indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" },
        { indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" },
        { indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" }
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
      files: [{ indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "unmodified" }],
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
    expect(hasStagedChanges({ indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "unmodified" })).toBe(
      true
    );
    expect(hasStagedChanges({ indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" })).toBe(
      false
    );
    expect(hasWorktreeChanges({ indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" })).toBe(
      true
    );
  });

  test("prefers staged diff for staged-only files", () => {
    expect(getPreferredDiffMode({ indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" })).toBe(
      "staged"
    );
    expect(getPreferredDiffMode({ indexStatus: "modified", path: "src/App.tsx", worktreeStatus: "modified" })).toBe(
      "worktree"
    );
    expect(getPreferredDiffMode({ indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" })).toBe(
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
          { indexStatus: "unmodified", path: "src/App.tsx", worktreeStatus: "modified" },
          { indexStatus: "untracked", path: "scratch.txt", worktreeStatus: "untracked" }
        ],
        upstream: null
      })
    ).toBe(false);

    expect(
      hasRepositoryStagedChanges({
        ahead: 0,
        behind: 0,
        branch: "main",
        files: [{ indexStatus: "added", path: "src/new.ts", worktreeStatus: "unmodified" }],
        upstream: null
      })
    ).toBe(true);
  });
});
