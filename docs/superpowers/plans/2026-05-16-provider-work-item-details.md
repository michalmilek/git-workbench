# Provider Work Item Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral PR/MR details surface for GitHub, GitLab.com, and self-hosted GitLab work items.

**Architecture:** Keep provider-specific API data at the existing `ProviderWorkItem` boundary. Add a pure display helper for selection and label formatting, then render the selected item in `App.tsx` without adding provider mutations or extra API calls.

**Tech Stack:** React, TypeScript, Vitest, existing provider DTOs, existing shadcn UI primitives.

---

### Task 1: Provider Work Item Detail Helper

**Files:**
- Create: `src/features/repository/provider-work-item-details.ts`
- Create: `src/features/repository/provider-work-item-details.test.ts`

- [x] Write failing Vitest coverage for empty item selection returning `null` detail and `null` selected id.
- [x] Write failing Vitest coverage for selecting the requested item id.
- [x] Write failing Vitest coverage for falling back to the first item when selected id is missing or stale.
- [x] Write failing Vitest coverage for GitHub `Pull request` and GitLab/custom GitLab `Merge request` labels.
- [x] Write failing Vitest coverage for author, branch flow, remote, URL, and CI/check label formatting.
- [x] Implement `buildProviderWorkItemDetails(items, selectedId)` with no provider API side effects.
- [x] Run `bun run test:front src/features/repository/provider-work-item-details.test.ts`.
- [x] Run `bun run typecheck`.

### Task 2: App Selection And Details UI

**Files:**
- Modify: `src/app/App.tsx`

- [x] Import the provider work item detail helper.
- [x] Add `selectedProviderWorkItemId` state initialized to `null`.
- [x] Reset selected work item id when switching repository or provider loading fails.
- [x] After provider work items load, keep the current selection if it exists, otherwise select the first item.
- [x] Render work item rows as selectable buttons with a selected visual state.
- [x] Render a provider-neutral details panel showing title, provider kind, review kind, state, author, branch flow, remote, CI/check, and trusted external PR/MR/CI links.
- [x] Keep existing provider remotes and provider account panels unchanged.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-05-16-provider-work-item-details-design.md`
- Modify: `docs/superpowers/plans/2026-05-16-provider-work-item-details.md`

- [x] Mark provider-neutral PR/MR views as done.
- [x] Move the next milestone to batch operations.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for selecting GitHub and GitLab/custom GitLab work items, details panel updates, no console errors, and mobile overflow.
