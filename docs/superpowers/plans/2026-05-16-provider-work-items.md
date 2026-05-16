# Provider Work Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show provider-neutral PR/MR lists and CI/check/pipeline status for configured GitHub, GitLab.com, and self-hosted GitLab accounts.

**Architecture:** Rust exposes a read-only provider work item command that combines configured accounts, detected remotes, keychain tokens, and provider APIs. React renders a compact provider work panel and keeps links external/openable while preserving Git transport through system Git.

**Tech Stack:** Tauri 2, Rust async `reqwest`, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Provider Work Items

**Files:**
- Create: `src-tauri/src/provider_work_items.rs`
- Modify: `src-tauri/src/provider_accounts.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add DTOs for `ProviderWorkItem`, `ProviderCheckStatus`, and `ProviderWorkItemList`.
- [x] Add a token lookup helper in provider accounts that can be used without exposing token values to frontend.
- [x] Build GitHub PR and check-run API URLs from provider remote owner/repository.
- [x] Build GitLab MR and pipeline API URLs from encoded project path.
- [x] Parse minimal GitHub PR/check JSON and GitLab MR/pipeline JSON.
- [x] Return empty lists with a clear message when no matching configured account/token exists.
- [x] Add unit tests for URL building, JSON parsing, missing-account behavior, and token non-exposure.
- [x] Register `list_provider_work_items` as a Tauri command.

### Task 2: Frontend Provider Work Panel

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`
- Modify: `src/app/App.tsx`

- [x] Add frontend DTOs matching backend camelCase payloads.
- [x] Add repository-client method/export and browser fallback work items.
- [x] Extend invoke payload tests.
- [x] Load work items after repository open/refresh and after account changes.
- [x] Render PR/MR list with provider kind, title, author, branch, state, URL, and CI/check status.
- [x] Add buttons to open PR/MR and CI/pipeline links externally when URLs are available.
- [x] Guard async work item loads against stale repository/account responses.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark PR/MR lists, CI/check/pipeline status, and external PR/MR/pipeline links as done.
- [x] Keep full PR/MR review and inline commenting out of scope.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run a browser smoke test against the Vite app.
