# Provider Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add provider account configuration with non-secret metadata in app config, tokens in the OS keychain, and provider API connection testing.

**Architecture:** Rust owns persistence, keychain access, and provider API checks. React provides a compact account panel and never persists or echoes tokens. Browser fallback simulates account flows without storing secrets.

**Tech Stack:** Tauri 2, Rust, OS keychain via `keyring`, HTTP connection checks via `reqwest` blocking client, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Provider Accounts

**Files:**
- Create: `src-tauri/src/provider_accounts.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/Cargo.lock`

- [x] Add dependencies for `keyring`, `reqwest` blocking/rustls, and a lightweight time or id strategy only if needed.
- [x] Add DTOs: `ProviderAccount`, `ProviderAccountInput`, `ProviderConnectionResult`, and account provider kind aligned with existing provider kinds.
- [x] Store metadata in app config as JSON without token values.
- [x] Store tokens in OS keychain under a deterministic service/account id.
- [x] Add commands: `list_provider_accounts`, `save_provider_account`, `delete_provider_account`, `test_provider_connection`.
- [x] Implement provider API URL construction for GitHub and GitLab-style providers.
- [x] Add pure unit tests for config JSON roundtrips, account id derivation, keychain service naming, and API URL construction.
- [x] Keep keychain and HTTP logic behind small functions so tests do not need real secrets or network.

### Task 2: Frontend Provider Account UI

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`
- Modify: `src/app/App.tsx`

- [x] Add frontend DTOs for provider account input, account summaries, and connection test results.
- [x] Add repository-client methods and browser fallback for listing, saving, deleting, and testing provider accounts.
- [x] Extend invoke payload tests.
- [x] Add a compact provider account panel: provider type, base URL, label, token input, save, test, delete.
- [x] Never display stored token values after save.
- [x] Show tokenConfigured and last connection result state.
- [x] Keep account state independent from repository loading state.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark provider account configuration, keychain token storage, non-secret metadata config, and connection testing as done.
- [x] Keep PR/MR lists and CI status as remaining provider work.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run a browser smoke test against the Vite app.
