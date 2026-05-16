import { describe, expect, test } from "vitest";

import { buildCommitGroupSuggestions, isCommitGroupStageableFile } from "./commit-groups";
import type { GitFileStatus, StatusFile } from "./repository-types";

function statusFile(
  path: string,
  input: Partial<Pick<StatusFile, "indexStatus" | "worktreeStatus" | "conflict">> = {}
): StatusFile {
  return {
    conflict: input.conflict ?? false,
    indexStatus: input.indexStatus ?? "unmodified",
    path,
    worktreeStatus: input.worktreeStatus ?? "modified"
  };
}

function stagedFile(path: string, indexStatus: GitFileStatus = "modified"): StatusFile {
  return statusFile(path, { indexStatus, worktreeStatus: "unmodified" });
}

describe("buildCommitGroupSuggestions", () => {
  test("returns no suggestions for an empty file list", () => {
    expect(buildCommitGroupSuggestions([])).toEqual([]);
  });

  test("groups mixed repository files into stable conventional commit suggestions", () => {
    const suggestions = buildCommitGroupSuggestions([
      statusFile("src/app/App.tsx"),
      statusFile("src-tauri/src/lib.rs"),
      statusFile("README.md"),
      statusFile("package.json"),
      statusFile("public/logo.png"),
      statusFile("scripts/release.sh")
    ]);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "backend",
      "frontend",
      "docs",
      "tooling",
      "assets",
      "workspace"
    ]);
    expect(suggestions.map((suggestion) => suggestion.summary)).toEqual([
      "feat: update Tauri backend",
      "feat: update frontend workspace",
      "docs: update project documentation",
      "chore: update project tooling",
      "chore: update assets",
      "chore: update workspace files"
    ]);
    expect(suggestions.map((suggestion) => suggestion.title)).toEqual([
      "Backend",
      "Frontend",
      "Docs",
      "Tooling",
      "Assets",
      "Workspace"
    ]);
    expect(suggestions.map((suggestion) => suggestion.files.map((file) => file.path))).toEqual([
      ["src-tauri/src/lib.rs"],
      ["src/app/App.tsx"],
      ["README.md"],
      ["package.json"],
      ["public/logo.png"],
      ["scripts/release.sh"]
    ]);
    expect(suggestions.every((suggestion) => suggestion.body.length > 0 && suggestion.description.length > 0)).toBe(
      true
    );
  });

  test("puts test files in the test group before frontend or backend areas", () => {
    const suggestions = buildCommitGroupSuggestions([
      statusFile("src/features/repository/commit-groups.test.ts"),
      statusFile("src-tauri/tests/git_status.rs"),
      statusFile("src/components/Button.spec.tsx"),
      statusFile("tests/e2e/repository.test.ts")
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      id: "tests",
      summary: "test: update test coverage",
      title: "Tests"
    });
    expect(suggestions[0].files.map((file) => file.path)).toEqual([
      "src-tauri/tests/git_status.rs",
      "src/components/Button.spec.tsx",
      "src/features/repository/commit-groups.test.ts",
      "tests/e2e/repository.test.ts"
    ]);
  });

  test("groups conflicts before other matching areas", () => {
    const suggestions = buildCommitGroupSuggestions([
      statusFile("src/app/App.tsx", { conflict: true, indexStatus: "unmerged", worktreeStatus: "unmerged" }),
      statusFile("docs/usage.md", { conflict: true, indexStatus: "unmerged", worktreeStatus: "unmerged" }),
      statusFile("src/app/routes.tsx")
    ]);

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual(["conflicts", "frontend"]);
    expect(suggestions[0]).toMatchObject({
      conflictCount: 2,
      summary: "fix: resolve merge conflicts",
      title: "Conflicts"
    });
    expect(suggestions[0].files.map((file) => file.path)).toEqual(["docs/usage.md", "src/app/App.tsx"]);
  });

  test("counts staged, worktree, conflict, and untracked files", () => {
    const suggestions = buildCommitGroupSuggestions([
      stagedFile("src/app/staged.tsx"),
      statusFile("src/app/partially-staged.tsx", { indexStatus: "modified", worktreeStatus: "modified" }),
      statusFile("src/app/new.tsx", { indexStatus: "untracked", worktreeStatus: "untracked" }),
      statusFile("src/app/conflicted.tsx", { conflict: true, indexStatus: "unmerged", worktreeStatus: "unmerged" })
    ]);

    expect(suggestions).toEqual([
      expect.objectContaining({
        conflictCount: 1,
        id: "conflicts",
        stagedCount: 1,
        worktreeCount: 1
      }),
      expect.objectContaining({
        conflictCount: 0,
        id: "frontend",
        stagedCount: 2,
        worktreeCount: 2
      })
    ]);
  });

  test("excludes unresolved conflicts from group stage actions", () => {
    const conflictedFile = statusFile("src/app/conflicted.tsx", {
      conflict: true,
      indexStatus: "unmerged",
      worktreeStatus: "unmerged"
    });
    const worktreeFile = statusFile("src/app/worktree.tsx");
    const stagedFileOnly = stagedFile("src/app/staged.tsx");

    expect(isCommitGroupStageableFile(conflictedFile)).toBe(false);
    expect(isCommitGroupStageableFile(worktreeFile)).toBe(true);
    expect(isCommitGroupStageableFile(stagedFileOnly)).toBe(false);

    expect(buildCommitGroupSuggestions([conflictedFile, worktreeFile, stagedFileOnly])).toEqual([
      expect.objectContaining({
        id: "conflicts",
        stageableCount: 0,
        worktreeCount: 1
      }),
      expect.objectContaining({
        id: "frontend",
        stageableCount: 1,
        worktreeCount: 1
      })
    ]);
  });

  test("classifies markdown outside docs as documentation and sorts paths inside each group", () => {
    const suggestions = buildCommitGroupSuggestions([
      statusFile("notes/release.md"),
      statusFile("docs/zeta.md"),
      statusFile("docs/alpha.md")
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("docs");
    expect(suggestions[0].files.map((file) => file.path)).toEqual(["docs/alpha.md", "docs/zeta.md", "notes/release.md"]);
  });
});
