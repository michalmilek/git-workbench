# Hunk Staging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to stage and unstage individual text hunks from the diff viewer.

**Architecture:** The frontend parses the current unified diff into file headers and hunks, renders each hunk with a focused Stage/Unstage button, and sends a minimal patch containing the selected hunk. The Rust backend applies that patch to the index through system Git: worktree hunks use `git apply --cached`, staged hunks use `git apply --cached --reverse`. Binary diffs and unparsable diffs keep existing file-level staging.

**Tech Stack:** Tauri commands, system Git, Rust `Command` stdin, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Patch Apply Commands

**Files:**
- Modify: `src-tauri/src/git/command.rs`
- Modify: `src-tauri/src/git/operations.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add `run_git_with_stdin(repository_path, args, stdin)` returning `GitOperationResult`.
- [x] Add `stage_hunk(repository_path: &Path, patch: &str)` using `git apply --cached --whitespace=nowarn`.
- [x] Add `unstage_hunk(repository_path: &Path, patch: &str)` using `git apply --cached --reverse --whitespace=nowarn`.
- [x] Add Tauri commands `stage_hunk(repository_path, patch)` and `unstage_hunk(repository_path, patch)`.
- [x] Register both commands in the Tauri invoke handler.
- [x] Add Rust tests:
  - command args for stage/unstage hunk.
  - real repo stages only one worktree hunk while leaving another hunk unstaged.
  - real repo unstages only one staged hunk while leaving another hunk staged.

### Task 2: Frontend Diff Hunk Parser And Client

**Files:**
- Create: `src/features/repository/diff-hunks.ts`
- Create: `src/features/repository/diff-hunks.test.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Add `stageHunk({ repositoryPath, patch })` and `unstageHunk({ repositoryPath, patch })` to the repository client.
- [x] Wire Tauri invoke names `stage_hunk` and `unstage_hunk`.
- [x] Browser fallback returns command `git apply --cached` and `git apply --cached --reverse`.
- [x] Implement `parseDiffHunks(diffText)` returning file header lines and hunk objects.
- [x] Implement `buildHunkPatch(parsedDiff, hunkId)` returning a complete patch with `diff --git`, file metadata, `---`, `+++`, and the selected hunk.
- [x] Parser supports ordinary text diffs, new-file diffs, deleted-file diffs, and multiple hunks.
- [x] Parser returns no hunks for empty, binary, or malformed diff text.
- [x] Add Vitest coverage for parsing and patch construction, including multiple hunks.

### Task 3: Diff Viewer UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import hunk parser/client helpers.
- [x] Add hunk busy action or reuse `stage`/`unstage` while applying hunk patches.
- [x] Replace raw `<pre>` diff display for text diffs with `DiffHunkViewer`.
- [x] `DiffHunkViewer` renders file header and each hunk in stable fixed-width text blocks.
- [x] For worktree mode, each hunk has a `Stage hunk` button.
- [x] For staged mode, each hunk has an `Unstage hunk` button.
- [x] Disable hunk buttons while any busy action is active.
- [x] After hunk apply, refresh repository status and reload selected file diff in the same mode when possible.
- [x] Keep the existing raw text fallback for binary, empty, and unparsable diffs.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark hunk-level staging as done.
- [x] Keep full PR/MR review and inline commenting as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke for hunk controls, fallback raw diff, and mobile overflow.
