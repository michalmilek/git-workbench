# Pull And Push Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe previews before pull and push so users can inspect incoming and outgoing commits before running the operation.

**Architecture:** Extend the existing operation preview model with `pull` and `push` kinds. Rust computes previews from local refs only: pull previews use the current branch, its upstream, merge-base, incoming commits, incoming changed files, and likely conflicts with local divergent changes; push previews show outgoing commits and changed files from the current branch to its upstream. The frontend reuses the existing preview panel and operation queue execution path.

**Tech Stack:** Tauri 2 commands, system Git, Rust tests with temporary repositories, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Pull/Push Preview Commands

**Files:**
- Modify: `src-tauri/src/git/operation_preview.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add `Pull` and `Push` variants to `OperationPreviewKind`.
- [x] Add `preview_pull(repository_path: &Path) -> Result<OperationPreview, OperationError>`.
- [x] Add `preview_push(repository_path: &Path) -> Result<OperationPreview, OperationError>`.
- [x] Add helper `upstream_branch(repository_path: &Path) -> Result<String, OperationError>` using `git rev-parse --abbrev-ref --symbolic-full-name @{upstream}`.
- [x] For pull preview:
  - source branch is upstream.
  - target branch is current branch.
  - command is `git pull`.
  - commits are `merge-base(current, upstream)..upstream`.
  - changed files are `merge-base(current, upstream)..upstream`.
  - likely conflict files are intersection of upstream changed files and current changed files since the same merge-base.
- [x] For push preview:
  - source branch is current branch.
  - target branch is upstream.
  - command is `git push`.
  - commits are `merge-base(current, upstream)..current`.
  - changed files are `merge-base(current, upstream)..current`.
  - likely conflict files is empty.
- [x] Add Tauri commands `preview_pull(repository_path)` and `preview_push(repository_path)` in `src-tauri/src/lib.rs`.
- [x] Register both commands in the Tauri invoke handler.
- [x] Add Rust tests:
  - serialization includes `"pull"` and `"push"` enum values.
  - `preview_pull` reads incoming commits/files from a configured upstream and does not checkout or mutate the branch.
  - `preview_push` reads outgoing commits/files for a configured upstream and does not checkout or mutate the branch.

### Task 2: Frontend Client And Types

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Extend `OperationPreviewKind` to `"merge" | "rebase" | "pull" | "push"`.
- [x] Add `previewPull(repositoryPath: string): Promise<OperationPreview>` to the repository client.
- [x] Add `previewPush(repositoryPath: string): Promise<OperationPreview>` to the repository client.
- [x] Wire Tauri invoke names `preview_pull` and `preview_push`.
- [x] Add browser fallback previews:
  - pull: command `git pull`, source `origin/browser-preview`, target `browser-preview`.
  - push: command `git push`, source `browser-preview`, target `origin/browser-preview`.
- [x] Update Vitest client coverage for invoke payloads and browser fallback preview output.

### Task 3: UI Integration

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import `previewPull` and `previewPush`.
- [x] Add busy actions `preview-pull` and `preview-push`.
- [x] Add `previewSyncOperation(action: "pull" | "push")`.
- [x] Add pull and push preview buttons in the Sync controls beside the existing Pull and Push execution buttons.
- [x] Reuse `OperationPreviewPanel` for pull/push preview details.
- [x] Update `runPreviewedCommand` so pull previews execute `pullRepository({ repositoryPath, operationId })` and push previews execute `pushRepository({ repositoryPath, operationId })`.
- [x] Update `operationPreviewResult` and panel button labels/icons so pull/push previews display sensible labels.
- [x] Keep merge/rebase preview behavior unchanged.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark pull and push previews as done.
- [x] Keep hunk-level staging and full PR/MR review as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke for pull preview, push preview, queued run from preview, and mobile overflow.
