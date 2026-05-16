# Workspace Batch Operations Design

Date: 2026-05-16
Status: Implemented

## Goal

Add batch Git operations for the multi-repository workspace: fetch all repositories, pull selected repositories, and push selected repositories.

## Scope

This milestone reuses the existing system Git transport and Tauri commands. It does not add parallel execution, scheduling, or provider API mutations. Each target repository runs as an independent queued Git operation so failures are visible per repository.

## User Experience

The workspace section gets per-repository selection checkboxes and compact batch controls:

- Fetch all: targets every repository in the workspace.
- Pull selected: targets selected repositories only.
- Push selected: targets selected repositories only.

Buttons are disabled while another operation is running or when there are no eligible targets. Repository rows keep their existing switch/remove affordances and summary badges.

## Architecture

Add a pure frontend helper for selection reconciliation, target calculation, and workspace snapshot updates. `App.tsx` owns the selected batch paths and executes batch actions sequentially through the existing `fetchRepository`, `pullRepository`, `pushRepository`, operation queue, and command log paths. After successful operations, workspace snapshots are refreshed from `getRepositoryStatus`.

## Testing

Vitest covers batch target selection, stale selection cleanup, toggling, and workspace snapshot updates. App component tests cover selecting workspace repositories and triggering pull/push batch actions with queued operation output. Browser smoke verifies fetch all and selected operations render in the queue without console errors or mobile overflow.

## Out Of Scope

- Parallel execution.
- Cron/scheduled background fetch.
- Per-repository conflict resolution inside batch flow.
- Provider-side merge or review actions.
