# Provider Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect GitHub, GitLab.com, and self-hosted GitLab remotes for the active repository and show provider readiness in the workbench.

**Architecture:** Rust reads `git remote -v` and parses transport URLs into provider-neutral DTOs. React loads provider remotes alongside repository status and renders a provider panel without making API calls or storing credentials yet.

**Tech Stack:** Tauri 2, Rust system `git`, React, TypeScript, Vitest, Oxlint.

---

### Task 1: Backend Provider Detection

**Files:**
- Create: `src-tauri/src/git/provider.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Add DTOs for `ProviderKind`, `ProviderRemote`, and `ProviderRemoteList`.
- [x] Parse HTTPS, SSH scp-style, and `ssh://` remote URLs.
- [x] Detect `github.com` as GitHub, `gitlab.com` as GitLab.com, and other GitLab-looking hosts as custom GitLab.
- [x] Return unknown provider entries for remotes that cannot be classified.
- [x] Add parser tests for GitHub, GitLab.com, self-hosted GitLab, and unknown remotes.
- [x] Add a real temp repository test with multiple remotes.
- [x] Register `list_provider_remotes` as a Tauri command.

### Task 2: Frontend Provider Panel

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`
- Modify: `src/app/App.tsx`

- [x] Add frontend provider DTOs matching backend camelCase payloads.
- [x] Add repository-client method and exported function for `list_provider_remotes`.
- [x] Add browser fallback provider remotes.
- [x] Extend invoke payload tests.
- [x] Load provider remotes after opening or refreshing a repository.
- [x] Add a provider panel showing kind, host, owner, repository, remote name, and fetch/push URL availability.
- [x] Guard provider async loads against stale repository responses.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Mark provider remote detection as done.
- [x] Keep provider account configuration, token storage, PR/MR lists, and CI status as remaining.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run a browser smoke test against the Vite app.
