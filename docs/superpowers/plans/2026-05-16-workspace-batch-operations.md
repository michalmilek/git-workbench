# Workspace Batch Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fetch-all, pull-selected, and push-selected actions for repositories in the workspace.

**Architecture:** Keep batch orchestration in the frontend and reuse existing Git commands and operation queue entries. Use a pure helper for target resolution and workspace snapshot updates so UI state remains easy to test.

**Tech Stack:** React, TypeScript, Vitest, existing Tauri Git command wrappers, existing operation queue.

---

### Task 1: Workspace Batch Helper

**Files:**
- Create: `src/features/repository/workspace-batch.ts`
- Create: `src/features/repository/workspace-batch.test.ts`

- [x] Write failing tests for toggling selected repository paths.
- [x] Write failing tests for dropping stale selected paths when workspace repositories change.
- [x] Write failing tests for batch targets: fetch all uses all workspace repositories, pull/push use selected repositories only.
- [x] Write failing tests for updating a workspace repository snapshot while preserving order and active state.
- [x] Implement helper functions with no Git command side effects.
- [x] Run `bun run test:front src/features/repository/workspace-batch.test.ts`.
- [x] Run `bun run typecheck`.

### Task 2: App Batch Orchestration And UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Add failing App test coverage for selecting workspace repositories and running a selected pull batch.
- [x] Import workspace batch helper functions.
- [x] Add `workspaceBatchSelectedPaths` state initialized to an empty array.
- [x] Reconcile selected paths when workspace repositories change.
- [x] Add workspace batch busy actions for fetch, pull, and push.
- [x] Add `runWorkspaceBatchOperation(action)` that queues one operation per target repository.
- [x] Refresh workspace repository snapshots after successful operations.
- [x] Add checkboxes and batch buttons to `WorkspaceRepositorySection`.
- [x] Keep repository switching and inactive repository removal behavior unchanged.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-05-16-workspace-batch-operations-design.md`
- Modify: `docs/superpowers/plans/2026-05-16-workspace-batch-operations.md`

- [x] Mark batch operations as done.
- [x] Move the next milestone to company GitLab/VPN/SSH profiles.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for fetch all, pull selected, push selected, operation queue entries, no console errors, and mobile overflow.
