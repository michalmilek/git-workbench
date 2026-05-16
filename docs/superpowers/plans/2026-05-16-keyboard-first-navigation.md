# Keyboard-First Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard-first navigation for repeated repository workflows.

**Architecture:** Use a pure shortcut resolver for deterministic keyboard mapping and keep `App.tsx` as the place that executes existing repository actions. Shortcuts are ignored for text-entry targets so typing in forms cannot stage, refresh, or switch views unexpectedly.

**Tech Stack:** React, TypeScript, Vitest, existing Tauri repository client boundary.

---

### Task 1: Shortcut Resolver Helper

**Files:**
- Create: `src/features/repository/keyboard-shortcuts.ts`
- Create: `src/features/repository/keyboard-shortcuts.test.ts`

- [x] Write failing tests for `Ctrl/Cmd+1`, `Ctrl/Cmd+2`, and `Ctrl/Cmd+3` mapping to Changes, History, and Stashes.
- [x] Write failing tests for `j`, `k`, `ArrowDown`, and `ArrowUp` mapping to list selection actions.
- [x] Write failing tests for `/`, `s`, `u`, and `r` mapping to focus filter, stage, unstage, and refresh actions.
- [x] Write failing tests that return `null` when the target is `input`, `textarea`, `select`, contenteditable, or an ARIA text-entry role.
- [x] Implement `resolveKeyboardShortcut(input)` and exported action/input types.
- [x] Run `bun run test:front src/features/repository/keyboard-shortcuts.test.ts`.
- [x] Run `bun run typecheck`.

### Task 2: App Keyboard Integration

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`

- [x] Add failing App test for `Ctrl/Cmd+2` switching from Changes to History.
- [x] Add failing App test for `/` focusing `#history-filter` while History is active.
- [x] Add failing App test for `j` moving changed-file selection and loading the next diff.
- [x] Add failing App test for `s` staging the selected worktree file.
- [x] Add failing App test for `u` unstaging the selected staged file.
- [x] Add failing App test that `r` is ignored while typing in the commit summary.
- [x] Import the shortcut resolver and add a `historyFilterInputRef`.
- [x] Install a window `keydown` listener that resolves shortcuts, prevents default only for handled shortcuts, and dispatches actions.
- [x] Implement active-list movement for changed files, filtered commits, and stashes.
- [x] Route stage, unstage, refresh, and history-filter focus to existing app functions.
- [x] Run `bun run test:front src/features/repository/keyboard-shortcuts.test.ts src/app/App.test.tsx`.
- [x] Run `bun run typecheck`.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/superpowers/specs/2026-05-16-keyboard-first-navigation-design.md`
- Modify: `docs/superpowers/plans/2026-05-16-keyboard-first-navigation.md`

- [x] Mark keyboard-first navigation as done.
- [x] Move the next milestone to full PR/MR review planning.
- [x] Run `bun run check:front`.
- [x] Run `bun run build`.
- [x] Run `cd src-tauri && cargo test`.
- [x] Run `cd src-tauri && cargo fmt -- --check`.
- [x] Run `cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings`.
- [x] Run `git diff --check`.
- [x] Run `rg -n '!\\.' src`.
- [x] Run `rg -n 'println!|dbg!|unwrap\\(|expect\\(' src-tauri/src`.
- [x] Run browser smoke for keyboard view switching, list movement, history filter focus, no console errors, and mobile overflow.
