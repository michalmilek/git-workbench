# Git Workbench Design

Date: 2026-05-14
Status: Approved design

## Goal

Build a cross-platform Tauri desktop app with a React frontend and Bun tooling. The product is a Git GUI wrapper intended to feel like a stronger, broader alternative to Fork: fast local Git workflows, clear branch history, safe branch operations, and provider integrations for GitHub, GitLab.com, and self-hosted GitLab instances.

The first product direction is a workbench-centered app. The primary screen supports day-to-day repository work: inspect changes, stage hunks, commit, sync, switch branches, stash, inspect history, and view PR/MR plus CI status from connected providers.

## Scope

The first implementation includes:

- Tauri app scaffold using React frontend and Bun package management.
- Local repository opening and recent repository list.
- Repository status, changed file list, file diff, stage/unstage, and hunk-level staging for text diffs through patch application. Binary files and unsupported diff shapes fall back to file-level staging.
- Commit creation, including commit message validation and optional amend toggle.
- Commit history and branch graph view.
- Branch create, checkout, delete, and stash operations executed through the system `git`.
- Fetch, pull, and push executed through the system `git`.
- Merge and rebase preview, without executing merge/rebase in the first implementation.
- Provider account configuration for GitHub, GitLab.com, and custom GitLab base URLs.
- Provider API connection test, PR/MR list, and CI/pipeline/check status display.

Out of scope for the first implementation:

- Full PR/MR creation and review workflow.
- Real merge/rebase execution.
- Replacing system Git credential handling.
- A local database for long-term analytics or repository indexing.

## Architecture

React owns the app shell, workbench UI, local view state, and user interactions. Tauri/Rust owns the system boundary: running `git`, normalizing command output, managing operation state, and storing provider tokens in the system keychain.

The backend is split into three modules:

- `git`: repository status, diff, staging, commit, history, branch graph, checkout, branch create/delete, stash, fetch, pull, and push.
- `providers`: GitHub, GitLab.com, and custom GitLab URL support for API metadata, PR/MR lists, CI/pipeline status, and connection tests.
- `operations`: a shared model for long-running work, including operation start, progress log, result, and error state.

The app uses the system `git` as the source of truth. SSH agent, credential helper, hooks, VPN-specific behavior, and self-hosted GitLab transport follow the user's existing terminal setup. Provider tokens are used for API requests only, not for Git transport, unless the user has already configured Git that way outside the app.

The frontend does not parse raw Git terminal text. Tauri commands return structured models such as `RepositoryStatus`, `CommitGraph`, `DiffFile`, `OperationPreview`, `ProviderAccount`, and `MergeRequestSummary`.

## UI Model

The primary screen is the Workbench.

Left rail:

- Repository list and active repository.
- Current branch and remotes.
- Provider account indicator.
- Navigation for `Changes`, `History`, `Stashes`, and `PR/MR`.

Center workspace:

- `Changes`: changed file list, diff viewer, hunk controls, and selected file details.
- `History`: branch graph, commit list, commit details, and changed files for the selected commit.
- `Stashes`: stash list and stash details.
- `PR/MR`: provider-backed pull/merge request list, CI/pipeline status, and metadata.

Right action panel:

- Commit box, amend toggle, and push/pull state for changes.
- Checkout, branch creation, stash, and branch operations for branch contexts.
- Merge/rebase preview for branch comparisons.
- Provider connection, API test, and external PR/MR links for provider contexts.

## Core Workflow

The first version supports this happy path:

1. Open a local repository.
2. Inspect status and file diffs.
3. Stage or unstage files and hunks.
4. Create a commit.
5. Inspect history and branch graph.
6. Create or switch branches.
7. Stash changes.
8. Fetch, pull, and push through system Git.
9. Add a GitHub, GitLab.com, or custom GitLab account.
10. View PR/MR entries and CI/pipeline status for the active repository.

Merge and rebase are preview-only in the first version. The preview panel shows source and target branches, expected command intent, likely conflict files when detectable, and the exact command plan intended for a later implementation.

## Data And Storage

Rust command responses are serialized as typed DTOs. TypeScript mirrors those shapes for frontend use.

Local app config stores:

- Recent repositories.
- UI preferences.
- Non-secret provider account metadata.

Provider secrets are stored in the OS keychain through Tauri/Rust integration. Secrets are not written to plaintext config files.

The first version does not use a local database. Repository state is read on demand from system Git and provider APIs.

## Error Handling

Errors are shown with concrete context:

- Operation type.
- Repository path.
- Branch or remote where relevant.
- Git command summary.
- Exit status and stderr when available.
- Suggested next action when the failure has a clear user-facing path.

Long-running operations expose a live log and final result. The app does not take over system Git credentials; credential failures should direct users back to their existing Git/SSH/credential-helper setup.

## Testing

Rust tests cover:

- `git status --porcelain=v2` parsing.
- Diff summary parsing.
- Branch list parsing.
- Remote URL detection.
- Provider matching for GitHub, GitLab.com, and custom GitLab URLs.

Frontend tests cover:

- Workbench view state.
- Mapping Tauri responses into UI models.
- Commit form validation.
- Provider account form validation.

Smoke and manual verification cover:

- App shell boot through Vite/Tauri.
- Opening a local test repository.
- Status, stage, commit, branch create/checkout, stash, fetch, and push using system Git.
- Provider connection test and PR/MR list display using API tokens.

## Design Decisions

- Use system Git instead of libgit2 for the first implementation.
- Use a Workbench-first layout instead of making graph or mode navigation the whole app center.
- Execute checkout, branch operations, stash, fetch, pull, and push in the first version.
- Keep merge and rebase preview-only until the operation model, conflict display, and recovery flow are proven.
- Support provider APIs early, but limit the first provider feature set to account setup, connection tests, PR/MR lists, and CI/pipeline status.
- Keep implementation direct and avoid speculative defensive abstractions.
