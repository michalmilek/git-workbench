# Git Workbench Roadmap

Date: 2026-05-14
Status: Active
Last updated: 2026-05-14

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
- GitHub repository with `main` protected by a ruleset requiring pull requests.
- Real Git status parsing through `git status --porcelain=v2 -z --branch`.
- Initial three-column workbench shell wired to local Git operations.
- Daily branch workflow support for branch list, checkout, creation, and non-current local branch deletion.
- Stash basics: list, create, apply, pop, and drop.
- Persistent command log stored in localStorage.
- Browser fallback client for Vite smoke testing outside the Tauri runtime.

## Completed So Far

These items are already implemented on `main`:

- Project scaffold: Tauri 2, React, Bun, Vite, TypeScript, and shadcn preset.
- Quality gates: strict frontend checks, strict Rust checks, conventional commits, and Husky hooks.
- Repository opening through a path input.
- Recent repositories stored through localStorage helpers.
- Real repository status loading through Tauri commands.
- Changed file list for tracked, untracked, renamed, copied, unmerged, and ignored files.
- Status parser support for porcelain v2 `-z` records, including paths with spaces.
- File diff loading for staged and worktree changes.
- Untracked text file preview rendered as a synthetic diff.
- Binary diff marker detection.
- File-level stage and unstage operations.
- Commit composer with summary, optional body, amend toggle, and staged-change validation.
- Commit creation through the system `git`.
- Fetch, pull, and push commands through the system `git`.
- Local and remote branch list.
- Local branch checkout, remote branch checkout as a local tracking branch, branch creation, and non-current local branch deletion.
- Stash list, create, apply, pop, and drop.
- Latest operation result/error display with command, stdout, and stderr.
- Persistent command log stored in localStorage.
- Frontend tests for repository summaries, recents, commit validation, and Tauri invoke payloads.
- Rust tests for status parsing, command argument construction, untracked diff rendering, branch workflows, stash workflows, and real temporary Git repository flows.

## P0: Usable Local Git Core

Goal: turn the current shell into the first useful desktop Git client.

- Done: open a local repository by path.
- Done: store and display recent repositories.
- Done: replace mocked workbench data with real repository status from Tauri.
- Done: show changed files grouped by status.
- Done: display text diffs for selected files.
- Done: stage and unstage complete files.
- Not done: stage and unstage individual hunks for supported text diffs.
- Done: fall back to file-level staging for binary files and unsupported diff shapes.
- Done: add a commit composer with summary, body, amend toggle, and validation.
- Done: create commits through the system `git`.
- Done: fetch, pull, and push through the system `git`.
- Done: show operation result/error details and command output for each Git action.
- Not done: live progress logs for long-running Git operations.

Recommended next milestone: add commit history, branch graph, commit details, and changed files for selected commits.

## P1: Daily Branch Workflows

Goal: support the workflows users perform repeatedly during normal development.

- Done: list local and remote branches.
- Done: checkout local branches and remote branches as local tracking branches.
- Done: create branches from the current commit.
- Done: delete non-current local branches, with active branch deletion blocked by the UI.
- Done: show ahead and behind counts for the active branch.
- Done: create, apply, pop, and drop stashes.
- Not done: display commit history.
- Not done: display a branch graph.
- Not done: show commit details and files changed by the selected commit.
- Done: add a persistent command log for recent repository operations.

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

1. Done: repository open and recent repositories.
2. Done: real status and changed file list.
3. Done: diff viewer.
4. Done: file-level staging and unstaging.
5. Done: commit composer and commit creation.
6. Done: fetch, pull, and push.
7. Done: branch list, checkout, and branch creation.
8. Done: stash workflow.
9. Done: persistent command log.
10. Next: commit history and branch graph.
11. Later: provider detection and account setup.
12. Later: PR/MR list and CI status.
13. Later: merge and rebase preview.
14. Later: conflict display and recovery.
