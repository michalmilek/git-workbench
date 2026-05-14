# Git Workbench Roadmap

Date: 2026-05-14
Status: Draft

## Product Direction

Git Workbench is a cross-platform desktop Git client built with Tauri, React, Bun, and strict quality gates. The product should cover the daily local Git workflow first, then grow into a provider-neutral workbench for GitHub, GitLab.com, and self-hosted GitLab instances.

The app should feel faster and clearer than Fork, with a stronger emphasis on operation previews, transparent command logs, safe branch workflows, and a consistent PR/MR experience across providers.

## Current Foundation

The repository already includes:

- Tauri 2 + React + Bun scaffold.
- shadcn-based UI preset.
- Strict frontend checks through TypeScript, Oxlint, and Vitest.
- Strict Rust checks through rustfmt, Clippy, and crate-level deny rules.
- Conventional commit enforcement through Husky and Commitlint.
- Initial Git status parser for `git status --porcelain=v2 --branch`.
- Initial three-column workbench shell.

## P0: Usable Local Git Core

Goal: turn the current shell into the first useful desktop Git client.

- Open a local repository from the filesystem.
- Store and display recent repositories.
- Replace mocked workbench data with real repository status from Tauri.
- Show changed files grouped by status.
- Display text diffs for selected files.
- Stage and unstage complete files.
- Stage and unstage individual hunks for supported text diffs.
- Fall back to file-level staging for binary files and unsupported diff shapes.
- Add a commit composer with summary, body, amend toggle, and validation.
- Create commits through the system `git`.
- Fetch, pull, and push through the system `git`.
- Show operation progress, final result, and command output for each Git action.

Recommended next milestone: implement repository open, real status, diff viewer, file staging, commit creation, and push.

## P1: Daily Branch Workflows

Goal: support the workflows users perform repeatedly during normal development.

- List local and remote branches.
- Checkout branches.
- Create branches from the current commit.
- Delete branches, with active branch deletion blocked by the UI.
- Show ahead and behind counts for the active branch.
- Create, apply, pop, and drop stashes.
- Display commit history.
- Display a branch graph.
- Show commit details and files changed by the selected commit.
- Add a persistent command log for recent repository operations.

## P2: Remotes And Providers

Goal: make GitHub, GitLab.com, and company GitLab instances first-class without taking over Git transport.

- Detect provider type from remote URLs.
- Support GitHub remotes.
- Support GitLab.com remotes.
- Support custom GitLab base URLs for self-hosted instances.
- Add provider account configuration.
- Store provider tokens in the OS keychain.
- Keep non-secret provider metadata in local app config.
- Test provider API connections.
- Show PR/MR lists for the active repository.
- Show CI/check/pipeline status.
- Open PR/MR and pipeline links externally.
- Keep push and pull using the user's existing system Git, SSH agent, credential helper, and VPN setup.

## P3: Safe Complex Operations

Goal: make risky Git actions understandable before they run and recoverable after failure.

- Add merge preview.
- Add rebase preview.
- Show source branch, target branch, and planned command intent.
- Detect likely conflict files when possible.
- Execute merge only after preview and confirmation.
- Execute rebase only after preview and confirmation.
- Show conflict files and conflict state.
- Add recovery actions for abort merge, abort rebase, and continue rebase.
- Keep long-running operations visible in an operation queue with live logs.

## P4: Differentiators

Goal: build the features that make the app clearly better than a standard Git GUI.

- Add a highly readable branch graph with strong filtering.
- Add "what will happen" previews before pull, push, merge, and rebase.
- Add smart commit grouping for related changes.
- Add a multi-repository workspace.
- Add a repository health panel with dirty state, ahead/behind counts, CI status, open PR/MR state, and last fetch time.
- Add provider-neutral PR/MR views across GitHub and GitLab.
- Add batch operations: fetch all, pull selected, push selected.
- Add profiles for company GitLab, VPN, and SSH setups.
- Add keyboard-first navigation for repeated workflows.

## Later Or Explicitly Out Of Scope For Now

These should not be prioritized until the core Git workflow is solid:

- Full PR/MR review and inline commenting.
- Replacing the user's Git credential manager.
- Running real merge and rebase before conflict display and recovery are designed.
- Long-term local analytics or repository indexing database.
- Custom Git transport implementation.
- Cloud sync for app preferences.

## Quality Gates

Each implementation milestone should keep these gates passing:

- `bun run check:front`
- `bun run build`
- `cargo test` in `src-tauri`
- `cargo fmt -- --check` in `src-tauri`
- `cargo clippy --all-targets --all-features -- -D warnings` in `src-tauri`

Frontend code must continue to reject non-null assertions. Rust code must continue to avoid unsafe code, unwrap/expect, panic-style control flow, debug macros, and stdout/stderr prints in app code.

## Suggested Milestone Order

1. Repository open and recent repositories.
2. Real status and changed file list.
3. Diff viewer.
4. File-level staging and unstaging.
5. Commit composer and commit creation.
6. Fetch, pull, and push.
7. Branch list, checkout, and branch creation.
8. Stash workflow.
9. Commit history and branch graph.
10. Provider detection and account setup.
11. PR/MR list and CI status.
12. Merge and rebase preview.
13. Conflict display and recovery.
