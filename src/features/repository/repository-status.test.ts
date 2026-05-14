import { describe, expect, test } from "vitest";

import { summarizeRepositoryStatus } from "./repository-status";
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
});
