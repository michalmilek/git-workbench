# Operation Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible operation queue with live logs for long-running Git commands.

**Architecture:** Rust will add a streaming Git runner that emits Tauri events while a child process runs. Frontend repository commands for fetch, pull, push, merge, rebase, and recovery will carry an `operationId`; React will keep a local operation queue and update log lines from Tauri events, falling back to final-result queue entries in browser mode.

**Tech Stack:** Tauri 2 events, Rust system Git boundary, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Streaming Git Runner

**Files:**
- Create: `src-tauri/src/git/operation_stream.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/git/operations.rs`
- Modify: `src-tauri/src/git/conflict.rs`

- [x] Add event DTOs:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOperationEvent {
    pub operation_id: String,
    pub event: GitOperationEventKind,
    pub command: String,
    pub stream: Option<GitOperationStream>,
    pub line: Option<String>,
    pub status: Option<GitOperationStatus>,
}
```

- [x] Implement `run_git_with_events(app, repository_path, args, operation_id)` using `std::process::Command` with piped stdout/stderr.
- [x] Emit event name `git-operation` for started, each stdout/stderr line, and finished.
- [x] Preserve the returned `GitOperationResult` shape and existing error behavior.
- [x] Add streamed variants for long-running operations:

```rust
pub fn fetch_repository_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn pull_repository_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn push_repository_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn run_merge_with_events(app: tauri::AppHandle, repository_path: &Path, source_branch: &str, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn run_rebase_with_events(app: tauri::AppHandle, repository_path: &Path, target_branch: &str, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn abort_merge_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn abort_rebase_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
pub fn continue_rebase_with_events(app: tauri::AppHandle, repository_path: &Path, operation_id: &str) -> Result<GitOperationResult, OperationError>
```

- [x] Change corresponding Tauri commands in `lib.rs` to accept `app: tauri::AppHandle` and `operation_id: &str`.
- [x] Add Rust tests for event DTO serialization, output line parsing helper, and command wrappers preserving command text.

### Task 2: Frontend Client And Queue Helpers

**Files:**
- Create: `src/features/repository/operation-queue.ts`
- Create: `src/features/repository/operation-queue.test.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Add `operationId` to client arg types for fetch, pull, push, run merge/rebase, and conflict recovery.
- [x] Update invoke payload tests so the relevant commands include `operationId`.
- [x] Add browser fallback mutation results unchanged except accepting `operationId`.
- [x] Add queue/event types:

```ts
export type OperationQueueStatus = "running" | "success" | "error";
export type OperationLogStream = "stdout" | "stderr";
export type GitOperationEventKind = "started" | "output" | "finished";
```

- [x] Implement pure helpers:

```ts
export function createOperationQueueEntry(args: { id: string; operation: string; command: string }): OperationQueueEntry
export function applyOperationEvent(entries: OperationQueueEntry[], event: GitOperationEventPayload): OperationQueueEntry[]
export function finishOperationQueueEntry(entries: OperationQueueEntry[], id: string, status: OperationQueueStatus, result: GitOperationResult): OperationQueueEntry[]
```

- [x] Add Vitest coverage for appending stdout/stderr lines, finishing success/error, trimming queue entries, and ignoring unknown operation ids.

### Task 3: Operation Queue UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import `listen` from `@tauri-apps/api/event` and operation queue helpers.
- [x] Add operation queue state and stable `createOperationQueueId()`.
- [x] Subscribe to `git-operation` events when Tauri runtime is available and apply events to queue entries.
- [x] Add `runQueuedRepositoryOperation`, `runQueuedPreviewedOperation`, and `runQueuedConflictRecovery` wrappers that:

```ts
const operationId = createOperationQueueId();
startOperationQueueEntry(operationId, label, command);
await clientCommand({ ...args, operationId });
finish queue entry on success/error;
refresh repository status after mutating operation;
record existing command log entry;
```

- [x] Keep the existing operation result panel and command log.
- [x] Add `OperationQueuePanel` in the action panel showing running/success/error status, command, last log lines, and stdout/stderr stream labels.
- [x] Browser fallback should still show queue entries using final command output even without Tauri events.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark live operation queue with logs as done.
- [x] Keep hunk-level staging and pull/push previews as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke against the Vite app for queue empty state, queued browser fallback operation, and mobile layout.
