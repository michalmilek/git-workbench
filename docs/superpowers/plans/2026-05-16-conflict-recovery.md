# Conflict Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute merge/rebase only after preview, surface Git conflict state, and provide merge/rebase recovery actions.

**Architecture:** Rust will expose real Git operation commands plus a read-only conflict state command. Conflict detection is based on `git status --porcelain=v2 -z --branch` unmerged records and Git control files in `git rev-parse --git-dir`. React will keep preview execution explicit, refresh state after success or failure, and show recovery controls when Git is in merge or rebase conflict state.

**Tech Stack:** Tauri 2, Rust system Git boundary, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Conflict And Execution Commands

**Files:**
- Create: `src-tauri/src/git/conflict.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add backend DTOs:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictOperation {
    None,
    Merge,
    Rebase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub index_status: GitFileStatus,
    pub worktree_status: GitFileStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictState {
    pub operation: ConflictOperation,
    pub files: Vec<ConflictFile>,
    pub can_abort_merge: bool,
    pub can_abort_rebase: bool,
    pub can_continue_rebase: bool,
    pub message: String,
}
```

- [x] Implement `read_conflict_state(repository_path)`:

```rust
pub fn read_conflict_state(repository_path: &Path) -> Result<ConflictState, OperationError> {
    let operation = detect_conflict_operation(repository_path)?;
    let status = read_repository_status(repository_path)?;
    let files = status
        .files
        .into_iter()
        .filter(|file| {
            file.index_status == GitFileStatus::Unmerged
                || file.worktree_status == GitFileStatus::Unmerged
        })
        .map(|file| ConflictFile {
            path: file.path,
            index_status: file.index_status,
            worktree_status: file.worktree_status,
        })
        .collect::<Vec<_>>();

    Ok(conflict_state(operation, files))
}
```

- [x] Detect operation using Git metadata paths:

```rust
fn detect_conflict_operation(repository_path: &Path) -> Result<ConflictOperation, OperationError> {
    let git_dir = git_dir(repository_path)?;
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        return Ok(ConflictOperation::Rebase);
    }
    if git_dir.join("MERGE_HEAD").exists() {
        return Ok(ConflictOperation::Merge);
    }
    Ok(ConflictOperation::None)
}
```

- [x] Add real operation commands:

```rust
pub fn run_merge(repository_path: &Path, source_branch: &str) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &merge_args(source_branch))
}

pub fn run_rebase(repository_path: &Path, target_branch: &str) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &rebase_args(target_branch))
}

pub fn abort_merge(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &[String::from("merge"), String::from("--abort")])
}

pub fn abort_rebase(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &[String::from("rebase"), String::from("--abort")])
}

pub fn continue_rebase(repository_path: &Path) -> Result<GitOperationResult, OperationError> {
    run_git(repository_path, &[
        String::from("-c"),
        String::from("core.editor=true"),
        String::from("rebase"),
        String::from("--continue"),
    ])
}
```

- [x] Add tests for command args, DTO serialization, merge conflict detection/abort, and rebase conflict detection/abort.
- [x] Register Tauri commands: `get_conflict_state`, `run_merge`, `run_rebase`, `abort_merge`, `abort_rebase`, `continue_rebase`.

### Task 2: Frontend Client Contract

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Add frontend DTOs:

```ts
export type ConflictOperation = "none" | "merge" | "rebase";

export type ConflictFile = {
  path: string;
  indexStatus: GitFileStatus;
  worktreeStatus: GitFileStatus;
};

export type ConflictState = {
  operation: ConflictOperation;
  files: ConflictFile[];
  canAbortMerge: boolean;
  canAbortRebase: boolean;
  canContinueRebase: boolean;
  message: string;
};
```

- [x] Extend `RepositoryClient` with:

```ts
getConflictState(repositoryPath: string): Promise<ConflictState>;
runMerge(args: PreviewMergeArgs): Promise<GitOperationResult>;
runRebase(args: PreviewRebaseArgs): Promise<GitOperationResult>;
abortMerge(args: RepositoryPathArgs): Promise<GitOperationResult>;
abortRebase(args: RepositoryPathArgs): Promise<GitOperationResult>;
continueRebase(args: RepositoryPathArgs): Promise<GitOperationResult>;
```

- [x] Wire Tauri invokes:

```ts
getConflictState(repositoryPath) {
  return invokeCommand<ConflictState>("get_conflict_state", { repositoryPath });
},
runMerge(args) {
  return invokeCommand<GitOperationResult>("run_merge", args);
},
runRebase(args) {
  return invokeCommand<GitOperationResult>("run_rebase", args);
}
```

- [x] Add browser fallback payloads with `operation: "none"` and mutation-style results for merge/rebase/recovery actions.
- [x] Extend invoke payload tests for every new command and browser fallback tests for the conflict state payload.

### Task 3: Conflict And Execution UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Add `conflictState` React state initialized to `null`.
- [x] Load conflict state during `loadRepositoryStatus(path, requestedFilePath)` and clear it when repository load fails.
- [x] Add busy actions:

```ts
type OperationExecutionAction = "run-merge" | "run-rebase" | "abort-merge" | "abort-rebase" | "continue-rebase";
```

- [x] Add `runPreviewedOperation(preview)` that confirms with `window.confirm`, runs `runMerge` or `runRebase`, records success/error, and refreshes repository status in both success and error paths.
- [x] Add `runConflictRecovery(action)` that calls `abortMerge`, `abortRebase`, or `continueRebase`, records success/error, and refreshes repository status.
- [x] Extend `OperationPreviewPanel` with one execution button for the current preview kind.
- [x] Add `ConflictStatePanel` in the action panel showing operation type, conflict file count, conflict files, and enabled recovery buttons.
- [x] Keep previews read-only until the explicit execution button is clicked.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark merge/rebase execution after preview as done.
- [x] Mark conflict state display and recovery actions as done.
- [x] Leave live operation queue with streaming logs as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke against the Vite app for preview panel, conflict panel empty state, and mobile layout.
