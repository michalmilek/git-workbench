# PR/MR Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build provider-neutral PR/MR review details and safe comment submission.

**Architecture:** Implement review details as a provider-neutral Tauri boundary backed by provider-specific Rust URL builders and parsers. Keep write actions behind explicit frontend preview state and Tauri commands that read provider tokens only inside Rust.

**Tech Stack:** Rust, Tauri commands, reqwest, serde, React, TypeScript, Vitest, existing provider account keychain storage.

---

### Task 1: Backend Review Read Model

**Files:**
- Create: `src-tauri/src/provider_reviews.rs`
- Modify: `src-tauri/src/lib.rs`

- [x] Write failing Rust tests for GitHub pull request files URL construction.
- [x] Write failing Rust tests for GitHub review comment JSON parsing.
- [x] Write failing Rust tests for GitLab merge request diffs URL construction using URL-encoded project paths.
- [x] Write failing Rust tests for GitLab discussions JSON parsing.
- [x] Write failing Rust serialization tests for `ProviderReviewDetails` camelCase output with no token fields.
- [x] Implement provider-neutral review DTOs and parsers.
- [x] Register a read-only `get_provider_review_details` Tauri command.
- [x] Run `cd src-tauri && cargo test provider_reviews`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.

### Task 2: Frontend Client And Review Helpers

**Files:**
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`
- Create: `src/features/repository/provider-review-details.ts`
- Create: `src/features/repository/provider-review-details.test.ts`

- [x] Write failing client tests for `getProviderReviewDetails(repositoryPath, itemId)` invoking `get_provider_review_details`.
- [x] Write failing helper tests for grouping top-level and inline provider threads.
- [x] Write failing helper tests for file summary counts and too-large/collapsed flags.
- [x] Add provider review DTOs to `repository-types.ts`.
- [x] Add client method and browser fallback review details.
- [x] Implement review details helper functions.
- [x] Run `bun run test:front src/features/repository/repository-client.test.ts src/features/repository/provider-review-details.test.ts`.
- [x] Run `bun run typecheck`.

### Task 3: Read-Only Review Workspace UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Add failing App test that selecting a provider work item loads review details.
- [x] Add failing App test that review files and inline threads render in the Provider review panel.
- [x] Add failing App test that failed review loading shows an error without clearing the selected work item details.
- [x] Add review details state, request id, loading state, and error state.
- [x] Load review details when selected provider work item changes.
- [x] Render files, threads, top-level comments, loading, and unavailable states.
- [x] Keep existing external PR/MR and CI links working.
- [x] Run `bun run test:front src/app/App.test.tsx src/features/repository/provider-review-details.test.ts`.
- [x] Run `bun run typecheck`.

### Task 4: Local Drafts And Submit Preview

**Files:**
- Create: `src/features/repository/provider-review-drafts.ts`
- Create: `src/features/repository/provider-review-drafts.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Write failing helper tests for top-level draft validation.
- [x] Write failing helper tests for inline draft validation using provider position metadata.
- [x] Write failing helper tests for preview summary text.
- [x] Add failing App test that empty drafts cannot open a submit preview.
- [x] Add failing App test that a valid top-level draft opens a provider payload preview.
- [x] Implement draft helper functions.
- [x] Add local draft state and preview UI.
- [x] Do not persist draft bodies unless explicitly requested in a later milestone.
- [x] Run `bun run test:front src/features/repository/provider-review-drafts.test.ts src/app/App.test.tsx`.
- [x] Run `bun run typecheck`.

### Task 5: Provider Comment Submission

**Files:**
- Modify: `src-tauri/src/provider_reviews.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/features/repository/repository-types.ts`
- Modify: `src/features/repository/repository-client.ts`
- Modify: `src/features/repository/repository-client.test.ts`

- [x] Write failing Rust tests for GitHub top-level issue comment URL and payload.
- [x] Write failing Rust tests for GitHub inline review comment payload using provider position metadata.
- [x] Write failing Rust tests for GitLab top-level MR note URL and payload.
- [x] Write failing Rust tests for GitLab diff discussion payload using provider position metadata.
- [x] Write failing Rust tests proving submit result serialization does not include token values.
- [x] Implement `submit_provider_review_comment`.
- [x] Add frontend DTOs and client method.
- [x] Run `cd src-tauri && cargo test provider_reviews`.
- [x] Run `bun run test:front src/features/repository/repository-client.test.ts`.
- [x] Run `bun run typecheck`.

### Task 6: Submit UI Integration

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [x] Add failing App test that submit requires preview confirmation.
- [x] Add failing App test that top-level submit calls the client and records result output.
- [x] Add failing App test that submit errors keep the draft text in place.
- [x] Add submit handler, busy state, result recording, and review refresh after successful submit.
- [x] Add docs showing review/commenting support as implemented.
- [x] Move the roadmap next milestone to review approvals and thread resolution.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for review detail loading, draft preview, submit success, no console errors, and mobile overflow; App tests cover submit error display.
