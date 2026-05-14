import type { RepositoryStatus } from "@/features/repository/repository-types";

export const activeRepository = {
  name: "Git Workbench",
  path: "/Users/mmilek/Documents/New project",
  provider: "Self-hosted GitLab ready"
} as const;

export const repositoryStatus: RepositoryStatus = {
  ahead: 0,
  behind: 0,
  branch: "main",
  files: [
    {
      indexStatus: "modified",
      path: "src-tauri/src/git/status.rs",
      worktreeStatus: "modified"
    },
    {
      indexStatus: "added",
      path: "src/app/App.tsx",
      worktreeStatus: "unmodified"
    },
    {
      indexStatus: "added",
      path: "src/features/repository/repository-status.ts",
      worktreeStatus: "unmodified"
    }
  ],
  upstream: "origin/main"
};
