# Repository Health Panel Design

Date: 2026-05-16
Status: Implemented

## Goal

Show a compact active-repository health snapshot with dirty state, sync state, CI/PR-MR state, and last refresh time.

## Scope

This milestone adds a read-only health panel for the active repository. It does not add background polling, batch operations, or long-term repository indexing. The panel uses data the app already loads: repository status, conflict state, provider work items, and the timestamp of the last successful status refresh.

## User Experience

The action panel gets a "Repository health" section near the top. When no repository is open, it shows a neutral empty state. When a repository is open, it shows:

- Working tree: clean, changed, untracked, or conflicts.
- Sync: existing ahead/behind label.
- PR/MR: open work item count.
- CI: failed, running, passing, unknown, or no PR/MR.
- Last refresh: relative age of the last successful status load.

## Architecture

Add `src/features/repository/repository-health.ts` as a pure helper. It accepts `RepositoryStatus | null`, `ConflictState | null`, provider work items, and timestamps, then returns display-ready fields and severity tones. `App.tsx` stores `repositoryRefreshedAt` after successful status loads and renders a dedicated `RepositoryHealthPanel` component.

## Testing

Vitest covers no-repository state, clean state, changed/untracked state, conflict priority, sync labels, PR/MR counts, CI rollups, and relative refresh labels.

## Out Of Scope

- Background status polling.
- Batch operations.
- Persisted health history.
- Full provider-neutral review UI.
