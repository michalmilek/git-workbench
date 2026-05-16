# Smart Commit Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest coherent commit groups from the current changed files and let users quickly stage a group or use its commit summary.

**Architecture:** Add a pure frontend helper that groups `StatusFile` entries by repository area and produces conventional-commit summaries. The app renders those suggestions in the action panel and reuses existing file-level `stageFile` commands to stage every stageable worktree file in a selected group.

**Tech Stack:** React, TypeScript, Vitest, existing Tauri Git file staging command.

---

### Task 1: Commit Group Helper

**Files:**
- Create: `src/features/repository/commit-groups.ts`
- Create: `src/features/repository/commit-groups.test.ts`

- [x] Add `buildCommitGroupSuggestions(files: StatusFile[]): CommitGroupSuggestion[]`.
- [x] Group files into stable areas: conflicts, backend, frontend, tests, docs, tooling, assets, and workspace.
- [x] Export `CommitGroupSuggestion` with `id`, `title`, `summary`, `body`, `description`, `files`, `stageableCount`, `stagedCount`, `worktreeCount`, and `conflictCount`.
- [x] Count staged/worktree files with existing status semantics: index changes count as staged, worktree/untracked changes count as worktree.
- [x] Sort suggestions by area priority and file paths.
- [x] Add Vitest coverage for mixed frontend/backend/docs/test/tooling files, conflict grouping, staged/worktree counts, untracked files, unresolved conflict stageability, and empty input.

### Task 2: Action Panel Integration

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import `buildCommitGroupSuggestions` and its type.
- [x] Derive suggestions from `status?.files`.
- [x] Render a compact "Suggested commits" section above the commit summary input.
- [x] Each suggestion shows title, description, staged/worktree/conflict counts, and up to three paths.
- [x] Add `Use summary` button that fills commit summary and body from the suggestion.
- [x] Add `Stage group` button that sequentially calls existing `stageFile` for group files with stageable worktree changes.
- [x] Disable group actions while another action is busy or no repository is open.
- [x] After staging a group, refresh repository status and record one aggregate command-log result.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-16-smart-commit-groups.md`

- [x] Mark smart commit grouping as done.
- [x] Keep multi-repository workspace and PR/MR inline review as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke for suggested commit groups, Use summary, Stage group fallback output, no console errors, and mobile overflow.
