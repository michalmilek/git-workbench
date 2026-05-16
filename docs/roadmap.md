# Git Workbench Roadmap

Date: 2026-05-14
Status: Active
Last updated: 2026-05-16

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
- Repository history, lane-based branch graph, commit details, changed files, and patch text.
- History filtering across plain terms and scoped `author:`, `ref:`, `branch:`, `hash:`, `oid:`, `subject:`, and `merge:` queries.
- Provider remote detection for GitHub, GitLab.com, and self-hosted GitLab-style hosts.
- Provider account configuration with non-secret metadata in app config.
- Provider token storage in the OS keychain.
- Provider API connection testing for configured accounts.
- Provider PR/MR work item list for the active repository.
- Provider CI/check/pipeline status for listed PRs and MRs.
- Provider-neutral PR/MR detail surface for GitHub, GitLab.com, and self-hosted GitLab work items.
- External PR/MR and CI/pipeline links through the system opener.
- Merge and rebase previews with source/target branch, planned command, commits, changed files, and likely conflict files.
- Pull and push previews with incoming/outgoing commits and changed files.
- Merge and rebase execution after explicit preview confirmation.
- Conflict state display with abort merge, abort rebase, and continue rebase actions.
- Operation queue with live Git command logs for long-running operations.
- Smart commit grouping suggestions with conventional summaries, commit bodies, counts, and group staging.
- Multi-repository workspace list with persisted repository snapshots and active repository switching.
- Workspace batch operations for fetch all, pull selected, and push selected.
- Repository health panel with dirty, sync, PR/MR, CI, and last-refresh summaries.
- Company setup profiles for matching self-hosted GitLab remotes to VPN, SSH, and setup notes.
- Keyboard-first navigation for view switching, list movement, refresh, staging, unstaging, and history filter focus.
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
- Hunk-level stage and unstage for supported text diffs.
- Commit composer with summary, optional body, amend toggle, and staged-change validation.
- Commit creation through the system `git`.
- Fetch, pull, and push commands through the system `git`.
- Local and remote branch list.
- Local branch checkout, remote branch checkout as a local tracking branch, branch creation, and non-current local branch deletion.
- Stash list, create, apply, pop, and drop.
- Commit history across local and remote refs.
- Lane-based branch graph in the history view.
- Commit details with body, changed files, and patch text.
- History filtering by plain terms and scoped `author:`, `ref:`, `branch:`, `hash:`, `oid:`, `subject:`, and `merge:` queries.
- Provider remote detection for GitHub, GitLab.com, and self-hosted GitLab-style hosts.
- Provider account configuration with non-secret metadata in app config.
- Provider token storage in the OS keychain.
- Provider API connection testing for configured accounts.
- Provider PR/MR work item list for the active repository.
- Provider CI/check/pipeline status for listed PRs and MRs.
- Provider-neutral PR/MR detail surface for GitHub, GitLab.com, and self-hosted GitLab work items.
- External PR/MR and CI/pipeline links through the system opener.
- Merge and rebase previews with source/target branch, planned command, commits, changed files, and likely conflict files.
- Pull and push previews with incoming/outgoing commits and changed files.
- Merge and rebase execution after explicit preview confirmation.
- Conflict state display with abort merge, abort rebase, and continue rebase actions.
- Operation queue with live Git command logs for long-running operations.
- Smart commit grouping suggestions with conventional summaries, commit bodies, staged/worktree/conflict counts, and group staging that skips unresolved conflicts.
- Multi-repository workspace list with persisted repository snapshots, branch/sync/change summaries, and active repository switching.
- Workspace batch operations for fetch all, pull selected, and push selected.
- Repository health panel with dirty, sync, PR/MR, CI, and last-refresh summaries.
- Company setup profiles for GitLab, VPN, and SSH setup metadata.
- Keyboard-first navigation for repeated repository workflows.
- Latest operation result/error display with command, stdout, and stderr.
- Persistent command log stored in localStorage.
- Frontend tests for repository summaries, recents, commit validation, and Tauri invoke payloads.
- Rust tests for status parsing, command argument construction, untracked diff rendering, branch workflows, stash workflows, history workflows, and real temporary Git repository flows.

## P0: Usable Local Git Core

Goal: turn the current shell into the first useful desktop Git client.

- Done: open a local repository by path.
- Done: store and display recent repositories.
- Done: replace mocked workbench data with real repository status from Tauri.
- Done: show changed files grouped by status.
- Done: display text diffs for selected files.
- Done: stage and unstage complete files.
- Done: stage and unstage individual hunks for supported text diffs.
- Done: fall back to file-level staging for binary files and unsupported diff shapes.
- Done: add a commit composer with summary, body, amend toggle, and validation.
- Done: create commits through the system `git`.
- Done: fetch, pull, and push through the system `git`.
- Done: show operation result/error details and command output for each Git action.
- Done: live progress logs for long-running Git operations.

Recommended next milestone: implement local PR/MR review drafts and safe comment submission.

## P1: Daily Branch Workflows

Goal: support the workflows users perform repeatedly during normal development.

- Done: list local and remote branches.
- Done: checkout local branches and remote branches as local tracking branches.
- Done: create branches from the current commit.
- Done: delete non-current local branches, with active branch deletion blocked by the UI.
- Done: show ahead and behind counts for the active branch.
- Done: create, apply, pop, and drop stashes.
- Done: display commit history.
- Done: display a lane-based branch graph.
- Done: show commit details and files changed by the selected commit.
- Done: add a persistent command log for recent repository operations.

## P2: Remotes And Providers

Goal: make GitHub, GitLab.com, and company GitLab instances first-class without taking over Git transport.

- Done: detect provider type from remote URLs.
- Done: support GitHub remotes.
- Done: support GitLab.com remotes.
- Done: support custom GitLab base URLs for self-hosted instances.
- Done: add provider account configuration.
- Done: store provider tokens in the OS keychain.
- Done: keep non-secret provider metadata in local app config.
- Done: test provider API connections.
- Done: show PR/MR lists for the active repository.
- Done: show CI/check/pipeline status.
- Done: show provider-neutral PR/MR details for the active repository.
- Done: open PR/MR and pipeline links externally.
- Keep push and pull using the user's existing system Git, SSH agent, credential helper, and VPN setup.

## P3: Safe Complex Operations

Goal: make risky Git actions understandable before they run and recoverable after failure.

- Done: add merge preview.
- Done: add rebase preview.
- Done: add pull preview.
- Done: add push preview.
- Done: show source branch, target branch, and planned command intent.
- Done: detect likely conflict files when possible.
- Done: execute merge only after preview and confirmation.
- Done: execute rebase only after preview and confirmation.
- Done: show conflict files and conflict state.
- Done: add recovery actions for abort merge, abort rebase, and continue rebase.
- Done: keep long-running operations visible in an operation queue with live logs.

## P4: Differentiators

Goal: build the features that make the app clearly better than a standard Git GUI.

- Done: add a highly readable branch graph with strong filtering.
- Done: add "what will happen" previews before pull, push, merge, and rebase.
- Done: add smart commit grouping for related changes.
- Done: add a multi-repository workspace.
- Done: add a repository health panel with dirty state, ahead/behind counts, CI status, open PR/MR state, and last refresh time.
- Done: add provider-neutral PR/MR views across GitHub and GitLab.
- Done: add batch operations: fetch all, pull selected, push selected.
- Done: add profiles for company GitLab, VPN, and SSH setups.
- Done: add keyboard-first navigation for repeated workflows.
- Done: plan full PR/MR review and inline commenting.
- Done: implement read-only PR/MR review details.
- Next: implement local review drafts and safe provider comment submission.

## Later Or Explicitly Out Of Scope For Now

These should wait until review/commenting support lands:

- Review approvals, requested changes, and thread resolution.
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
10. Done: commit history and branch graph.
11. Done: provider detection and account setup.
12. Done: PR/MR list and CI status.
13. Done: merge and rebase preview.
14. Done: conflict display and recovery.
15. Done: live operation queue with logs.
16. Done: pull and push previews.
17. Done: hunk-level staging.
18. Done: branch graph readability and stronger history filtering.
19. Done: smart commit grouping.
20. Done: multi-repository workspace.
21. Done: repository health panel.
22. Done: provider-neutral PR/MR views.
23. Done: batch repository operations.
24. Done: company GitLab, VPN, and SSH setup profiles.
25. Done: keyboard-first navigation.
26. Done: full PR/MR review planning.
27. Done: read-only PR/MR review details.
28. Next: local review drafts and safe provider comment submission.
