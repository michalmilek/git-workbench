# Repository Health Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only health panel that summarizes the active repository's dirty state, sync state, PR/MR state, CI state, and last refresh time.

**Architecture:** Add a pure frontend helper that converts existing repository status, conflict state, provider work items, and refresh timestamps into display-ready health rows. Render those rows near the top of the action panel without changing Git command behavior.

**Tech Stack:** React, TypeScript, Vitest, existing repository status and provider DTOs.

---

### Task 1: Repository Health Helper

**Files:**
- Create: `src/features/repository/repository-health.ts`
- Create: `src/features/repository/repository-health.test.ts`

- [x] Export `RepositoryHealth` with `repositoryOpened`, `dirtyLabel`, `dirtyTone`, `syncLabel`, `workItemLabel`, `ciLabel`, `ciTone`, and `lastRefreshLabel`.
- [x] Add `buildRepositoryHealth(input)` accepting `status`, `conflictState`, `providerWorkItems`, `refreshedAt`, and `now`.
- [x] Return a neutral no-repository state when `status` is `null`.
- [x] Prioritize conflicts over other dirty states.
- [x] Classify dirty state as clean, changed, untracked, changed with untracked, or conflicts.
- [x] Reuse `summarizeRepositoryStatus(status).syncLabel` for ahead/behind display.
- [x] Roll up provider work items into open PR/MR count and CI label/tone.
- [x] Format refresh age as `Never refreshed`, `Just now`, `<n> min ago`, `<n> hr ago`, or `<n> day ago/days ago`.
- [x] Cover all classifications with Vitest.

### Task 2: App Integration And Health UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import `buildRepositoryHealth` and `RepositoryHealth`.
- [x] Add `repositoryRefreshedAt` state initialized to `null`.
- [x] Set `repositoryRefreshedAt` after every successful current repository status load.
- [x] Clear `repositoryRefreshedAt` when switching repository before new data loads or when load fails for the current repository.
- [x] Derive health with `useMemo`.
- [x] Render `RepositoryHealthPanel` above suggested commit groups in the action panel.
- [x] Show dirty, sync, PR/MR, CI, and last refresh rows with badge tones from the helper.
- [x] Keep existing provider work item and conflict panels unchanged.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-16-repository-health-panel.md`

- [x] Mark repository health panel as done.
- [x] Keep provider-neutral PR/MR review and batch operations as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for no-repo health, opened repo health, CI/PR labels, no console errors, and mobile overflow.
