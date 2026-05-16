# Operation Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only merge and rebase previews so risky branch operations can be inspected before execution.

**Architecture:** Rust will expose pure preview commands backed by system Git; they calculate command intent, commits, changed files, and likely conflict files without modifying the worktree. React will add a compact branch operation preview panel that can preview merging a selected branch into the current branch or rebasing the current branch onto a selected branch.

**Tech Stack:** Tauri 2, Rust system Git boundary, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Operation Preview Model

**Files:**
- Create: `src-tauri/src/git/operation_preview.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add `OperationPreview`, `OperationPreviewCommit`, and `OperationPreviewKind` DTOs serialized as camelCase.
- [x] Implement `preview_merge(repository_path, source_branch)` using `git merge-base`, `git rev-parse --abbrev-ref HEAD`, `git log`, and `git diff --name-only`.
- [x] Implement `preview_rebase(repository_path, target_branch)` using the current branch as source and the selected branch as target.
- [x] Compute likely conflict files as the intersection of files changed on each side since merge base.
- [x] Include planned command strings: `git merge <source>` and `git rebase <target>`.
- [x] Add unit tests for parser helpers and real temporary Git repository merge/rebase previews.
- [x] Register `preview_merge` and `preview_rebase` Tauri commands.

### Task 2: Frontend Operation Preview Client

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Add frontend DTOs matching backend camelCase payloads.
- [x] Add repository client methods and exported helpers for `previewMerge` and `previewRebase`.
- [x] Add browser fallback preview payloads.
- [x] Extend invoke payload tests for both preview commands.

### Task 3: Operation Preview UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Add selected operation branch state that resets when repositories change.
- [x] Add branch operation controls in the sidebar with a branch select and preview merge/rebase buttons.
- [x] Render the latest operation preview in the action panel with source branch, target branch, planned command, commits, changed files, and likely conflicts.
- [x] Guard preview requests against stale repository responses.
- [x] Record preview success/error in the command log without executing merge or rebase.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark merge/rebase preview and planned command intent as done.
- [x] Keep actual merge/rebase execution and conflict recovery out of this PR unless the preview foundation is stable.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run a browser smoke test against the Vite app.
