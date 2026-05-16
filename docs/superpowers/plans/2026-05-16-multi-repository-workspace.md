# Multi-Repository Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persisted workspace list so users can keep multiple repositories visible and switch the active repository quickly.

**Architecture:** Add a pure frontend workspace helper that stores repository snapshots in localStorage. Wire the helper into `App.tsx` after successful status loads and render a compact workspace section in the sidebar. Keep all Git operations scoped to the active repository.

**Tech Stack:** React, TypeScript, Vitest, existing repository status summary helpers.

---

### Task 1: Workspace Helper

**Files:**
- Create: `src/features/repository/repository-workspace.ts`
- Create: `src/features/repository/repository-workspace.test.ts`

- [x] Add `WORKSPACE_REPOSITORIES_STORAGE_KEY` and `WORKSPACE_REPOSITORY_LIMIT`.
- [x] Export `WorkspaceRepository` with `path`, `branchLabel`, `syncLabel`, `changedFileCount`, `hasUntrackedFiles`, `active`, and `updatedAt`.
- [x] Add `upsertWorkspaceRepository(repositories, repository)` that trims paths, deduplicates by path, moves updated entries to the top, marks only the updated entry active, and enforces the limit.
- [x] Add `selectWorkspaceRepository(repositories, path)` that marks one existing entry active without reordering.
- [x] Add `removeWorkspaceRepository(repositories, path)` that removes a trimmed path.
- [x] Add `parseWorkspaceRepositories(value)` and `serializeWorkspaceRepositories(repositories)` with validation that drops invalid entries.
- [x] Cover empty input, dedupe/update, active selection, removal, limit handling, and invalid localStorage payloads with Vitest.

### Task 2: App Integration And Sidebar UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import workspace helpers and `WorkspaceRepository`.
- [x] Add `workspaceRepositories` state initialized from localStorage.
- [x] After every successful `loadRepositoryStatus`, upsert the repository snapshot using `summarizeRepositoryStatus(nextStatus)`.
- [x] Add `switchWorkspaceRepository(path)` that loads the clicked path with no preselected file.
- [x] Add `removeInactiveWorkspaceRepository(path)` that removes only inactive entries and persists the result.
- [x] Render a "Workspace" section above "Recent repositories" with count, active marker, branch/sync/changed summaries, and remove buttons for inactive entries.
- [x] Keep the current recent repository list unchanged.
- [x] Disable workspace actions while `busyAction !== null`.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-16-multi-repository-workspace.md`

- [x] Mark multi-repository workspace as done.
- [x] Keep batch operations and PR/MR inline review as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for workspace creation, active switching, inactive removal, no console errors, and mobile overflow.
