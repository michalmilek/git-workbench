import { describe, expect, test } from "vitest";

import { buildPartialStageGroupError, buildStageGroupResult } from "./commit-group-stage";
import type { CommitGroupSuggestion } from "./commit-groups";
import type { GitOperationResult, StatusFile } from "./repository-types";

function file(path: string): StatusFile {
  return {
    conflict: false,
    indexStatus: "unmodified",
    path,
    worktreeStatus: "modified"
  };
}

function suggestion(files: StatusFile[]): CommitGroupSuggestion {
  return {
    body: "React app changes.\n\nFiles:\n- src/app/App.tsx",
    conflictCount: 0,
    description: "React app changes.",
    files,
    id: "frontend",
    stageableCount: files.length,
    stagedCount: 0,
    summary: "feat: update frontend workspace",
    title: "Frontend",
    worktreeCount: files.length
  };
}

function result(command: string, stdout: string, stderr = ""): GitOperationResult {
  return { command, stderr, stdout };
}

describe("commit group stage results", () => {
  test("builds one aggregate result for successful group staging", () => {
    const stagedFiles = [file("src/app/App.tsx"), file("src/features/repository/status.ts")];

    expect(
      buildStageGroupResult(suggestion(stagedFiles), stagedFiles, [
        result("git add -- src/app/App.tsx", "staged app"),
        result("git add -- src/features/repository/status.ts", "staged status")
      ])
    ).toEqual({
      command: "git add -- src/app/App.tsx\ngit add -- src/features/repository/status.ts",
      stderr: "",
      stdout: "Staged 2 files for Frontend.\nstaged app\nstaged status"
    });
  });

  test("keeps successful commands visible when later group staging fails", () => {
    const stagedFiles = [file("src/app/App.tsx")];

    expect(
      buildPartialStageGroupError({
        error: {
          command: "git add -- src/features/repository/status.ts",
          message: "pathspec did not match",
          stderr: "fatal: pathspec did not match"
        },
        stagedFiles,
        stagedResults: [result("git add -- src/app/App.tsx", "staged app")],
        suggestion: suggestion(stagedFiles)
      })
    ).toEqual({
      command: "git add -- src/app/App.tsx\ngit add -- src/features/repository/status.ts",
      message: "Stage group partially completed for Frontend: pathspec did not match",
      stderr: "fatal: pathspec did not match",
      stdout: "Staged 1 files for Frontend.\nstaged app"
    });
  });
});
