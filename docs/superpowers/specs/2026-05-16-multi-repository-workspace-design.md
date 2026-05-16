# Multi-Repository Workspace Design

Date: 2026-05-16
Status: Implemented

## Goal

Let users keep multiple repositories in one workspace, switch the active repository quickly, and see a compact status snapshot for each tracked repository.

## Scope

This milestone adds the first multi-repository workspace layer without changing the existing single-active-repository command model. Git commands, diffs, history, stashes, providers, and commit composition continue to operate on the active repository only. Batch operations are left for the next roadmap item.

## User Experience

The left sidebar gets a "Workspace" section above recent repositories. Opening a repository adds or updates it in the workspace and marks it active. Each workspace item shows path, branch label, sync label, changed file count, and an untracked marker when present. Clicking an inactive item loads it as the active repository. Inactive entries can be removed from the workspace without deleting any local files.

## Data Model

Frontend workspace entries are local UI state persisted in localStorage:

- `path`: absolute repository path and stable identity.
- `branchLabel`: active branch or detached HEAD label.
- `syncLabel`: ahead/behind summary from the existing repository summary helper.
- `changedFileCount`: count from the latest status refresh.
- `hasUntrackedFiles`: derived from current status.
- `updatedAt`: ISO timestamp for the snapshot.

## Architecture

Add `src/features/repository/repository-workspace.ts` as a pure helper for parse/serialize/upsert/remove/select behavior. `App.tsx` owns the workspace state, updates it after every successful repository status load, and renders a compact workspace panel in the sidebar. The existing active repository flow remains the source of truth for the currently selected repo.

## Testing

Vitest covers workspace helper behavior: dedupe, active selection, snapshot updates, inactive removal, localStorage parse/serialize, limit handling, and invalid stored payloads. Browser smoke verifies that opening `/tmp/browser-demo` creates a workspace entry, clicking an entry switches active state, and the mobile layout has no horizontal overflow.

## Out Of Scope

- Batch fetch/pull/push across repositories.
- Background polling.
- A repository health dashboard.
- Provider-neutral full PR/MR review.
