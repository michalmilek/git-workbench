# Company Setup Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local company setup profiles for GitLab, VPN, and SSH metadata.

**Architecture:** Store only non-secret profile metadata in localStorage through a pure helper. Render profile management in `App.tsx` and match profiles to existing provider remote URLs.

**Tech Stack:** React, TypeScript, Vitest, localStorage, existing provider remote DTOs.

---

### Task 1: Company Profile Helper

**Files:**
- Create: `src/features/repository/company-profiles.ts`
- Create: `src/features/repository/company-profiles.test.ts`

- [x] Write failing tests for profile input normalization and id generation.
- [x] Write failing tests for rejecting empty profiles.
- [x] Write failing tests for upsert dedupe, latest-first ordering, and limit enforcement.
- [x] Write failing tests for removal, parsing invalid stored values, and serialization.
- [x] Write failing tests for matching profiles to GitLab base URLs and SSH hosts.
- [x] Implement the helper with no secret fields.
- [x] Run `bun run test:front src/features/repository/company-profiles.test.ts`.
- [x] Run `bun run typecheck`.

### Task 2: App Profile UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Add failing App test coverage for saving a profile and displaying a match for a custom GitLab remote.
- [x] Import company profile helpers.
- [x] Add company profile list and form state.
- [x] Persist profiles in localStorage on save/delete.
- [x] Derive the active matching profile from provider remotes.
- [x] Render a Company profiles panel with save/delete controls and active match display.
- [x] Keep provider account token behavior unchanged.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-05-16-company-setup-profiles-design.md`
- Modify: `docs/superpowers/plans/2026-05-16-company-setup-profiles.md`

- [x] Mark company GitLab/VPN/SSH profiles as done.
- [x] Move the next milestone to keyboard-first navigation.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for create profile, matching custom GitLab remote, delete profile, no console errors, and mobile overflow.
