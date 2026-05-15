# History Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository history support with commit list, branch graph, commit details, changed files, and history filtering.

**Architecture:** Rust owns Git command execution and parsing for history data. React consumes typed DTOs through the repository client and renders a history-focused workbench view without adding a local database or replacing the user's Git setup.

**Tech Stack:** Tauri 2, Rust system `git`, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend History API

**Files:**
- Create: `src-tauri/src/git/history.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add serializable DTOs for commit summaries, changed files, and commit details.
- [x] Add `list_commit_history(repository_path, query)` using `git log --all --date=iso-strict --pretty=format:...`.
- [x] Add `get_commit_details(repository_path, commit_oid)` using `git show -s`, `git show --numstat`, and `git show --patch`.
- [x] Add parser tests for NUL/record-separated log output and numstat output.
- [x] Add real temporary repository tests covering multiple commits, branch decorations, and selected commit details.
- [x] Register `list_commit_history` and `get_commit_details` as Tauri commands.

### Task 2: Frontend History Client

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Add frontend DTO types matching the Rust camelCase payloads.
- [x] Add repository-client methods and exported functions for `list_commit_history` and `get_commit_details`.
- [x] Add browser fallback history data that makes the Vite smoke flow non-mutating.
- [x] Extend invoke payload tests to cover the new command names and arguments.

### Task 3: History UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Add a real view mode for Changes, History, and Stashes navigation.
- [x] Load history after opening or refreshing a repository.
- [x] Render commit history with a compact branch graph rail, refs badges, subject, author, date, and short oid.
- [x] Add history text filtering across subject, author, oid, and refs.
- [x] Load selected commit details and show body, changed files, and patch text.
- [x] Keep async history requests guarded against stale repository responses.

### Task 4: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark commit history, branch graph, commit details, and selected commit files as done.
- [x] Keep remaining roadmap items explicit.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run a browser smoke test against the Vite app.
