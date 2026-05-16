# History Graph And Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make commit history easier to scan with a lane-based graph and stronger local filters.

**Architecture:** Keep the backend DTO unchanged because `CommitSummary` already includes `oid`, `parents`, and `refs`. Add a pure frontend helper for tokenized filtering and graph row layout, use it from the browser fallback and the history UI, and add `--topo-order` to backend history loading so graph rows arrive in a stable order.

**Tech Stack:** React, TypeScript, Vitest, Tauri command DTOs, system Git, Rust tests.

---

### Task 1: Commit History Helper

**Files:**
- Create: `src/features/repository/commit-history.ts`
- Create: `src/features/repository/commit-history.test.ts`

- [x] Add `filterCommitHistory(commits, filter)` with multi-token AND matching.
- [x] Support quoted plain tokens and scoped tokens: `author:`, `ref:`, `branch:`, `hash:`, `oid:`, `subject:`, and `merge:`.
- [x] Keep empty filters as an identity operation.
- [x] Add `buildCommitGraphRows(commits)` that returns rows containing the original commit, lane count, current lane, active lane descriptors, and merge parent lane indexes.
- [x] Tolerate missing parents outside the loaded history window.
- [x] Add Vitest coverage for empty filters, plain multi-token filters, quoted terms, scoped author/ref/hash/subject filters, merge filters, linear graph rows, side branch rows, merge rows, and truncated parent rows.

### Task 2: Backend History Ordering

**Files:**
- Modify: `src-tauri/src/git/history.rs`

- [x] Add `--topo-order` to `history_args`.
- [x] Add/extend Rust tests proving `history_args(None)` includes `--topo-order`.
- [x] Add/extend a real repository history test proving a merge commit keeps both parent OIDs and is returned before its parents.

### Task 3: UI And Browser Fallback Integration

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Replace local `filterCommitHistory` / `isCommitFilterMatch` in `App.tsx` with the helper from `commit-history.ts`.
- [x] Compute graph rows from `filteredHistory` and render rows from those graph row objects.
- [x] Replace `CommitGraphRail` with a lane-based rail that draws stable colored lanes, the selected commit dot, and merge/fork connectors.
- [x] Add concise filter hint chips near the history filter input for supported prefixes without adding an instructional block.
- [x] Improve ref badges by classifying `HEAD`, tags, local branches, and remote branches.
- [x] Use the shared `filterCommitHistory` helper in the browser fallback `listCommitHistory`.
- [x] Add browser fallback tests for scoped history filtering.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/plans/2026-05-16-history-graph-filters.md`

- [x] Mark branch graph readability and stronger history filtering as done.
- [x] Keep PR/MR review and inline commenting as not done.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run browser smoke for history filters, graph rendering, no console errors, and mobile overflow.
