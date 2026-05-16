# Git Workbench

Cross-platform desktop Git client built with Tauri, React, Bun, and strict quality gates.

Git Workbench is intended to become a fast, clear alternative to Fork with strong local Git workflows, transparent command output, safe operation previews, and provider support for GitHub, GitLab.com, and self-hosted GitLab instances.

## Current Status

Implemented on `main`:

- Tauri 2 + React + Bun application scaffold.
- shadcn-based UI preset and three-column workbench shell.
- Strict frontend checks with TypeScript, Oxlint, and Vitest.
- Strict Rust checks with rustfmt, Clippy, and crate-level deny rules.
- Conventional commit enforcement with Husky and Commitlint.
- Repository path open/refresh flow.
- Recent repositories stored in localStorage.
- Real Git status through Tauri commands.
- Porcelain v2 `-z` status parsing for paths with spaces, renames, copies, conflicts, untracked files, and ignored files.
- File diff loading for staged and worktree changes.
- File-level stage and unstage.
- Commit composer with summary, optional body, amend toggle, and staged-change validation.
- Commit, fetch, pull, and push through the system `git`.
- Local and remote branch list.
- Local branch checkout, remote branch checkout as a local tracking branch, branch creation, and non-current local branch deletion.
- Stash list, create, apply, pop, and drop.
- Commit history across local and remote refs.
- Compact branch graph rail in the history view.
- Commit details with body, changed files, and patch text.
- History filtering by subject, author, oid, and refs.
- Merge and rebase previews with source/target branch, planned command, commits, changed files, and likely conflict files.
- Merge and rebase execution after explicit preview confirmation.
- Conflict state display with abort merge, abort rebase, and continue rebase actions.
- Operation queue with live Git command logs for long-running operations.
- Provider remote detection for GitHub, GitLab.com, and self-hosted GitLab-style hosts.
- Provider account configuration with non-secret metadata in app config.
- Provider token storage in the OS keychain.
- Provider API connection testing for configured accounts.
- Provider PR/MR work item list for the active repository.
- Provider CI/check/pipeline status for listed PRs and MRs.
- External PR/MR and CI/pipeline links through the system opener.
- Latest operation result/error panel with command, stdout, and stderr.
- Persistent command log in localStorage.
- Browser fallback client for Vite smoke testing outside the Tauri runtime.

Not implemented yet:

- Hunk-level staging.
- Full PR/MR review and inline commenting.
- Pull and push previews.

See [docs/roadmap.md](docs/roadmap.md) for the active roadmap.

## Requirements

- Bun 1.3.x
- Rust stable toolchain
- System `git`
- Platform requirements for Tauri 2

The app uses the user's existing Git setup for SSH agents, credential helpers, remotes, VPN-specific access, and self-hosted GitLab transport.

## Setup

```bash
bun install
```

## Development

Run the frontend in a browser with the non-mutating fallback client:

```bash
bun run dev
```

Run the desktop app through Tauri:

```bash
bun run tauri:dev
```

Build the frontend:

```bash
bun run build
```

Build the desktop app:

```bash
bun run tauri:build
```

## Quality Gates

Frontend:

```bash
bun run check:front
bun run build
```

Rust backend:

```bash
cd src-tauri
cargo test
cargo fmt -- --check
cargo clippy --all-targets --all-features -- -D warnings
```

Frontend non-null assertions are blocked by Oxlint. Rust code denies unsafe code, unwrap/expect, panic-style control flow, debug macros, and stdout/stderr prints in app code.

## GitHub Workflow

The GitHub repository uses a ruleset that requires pull requests for `main`. Work should land through feature branches and PRs.

Commit messages must follow Conventional Commits, for example:

```bash
feat: add branch checkout command
fix: handle untracked binary diffs
docs: update roadmap progress
```

## Project Structure

```text
src/
  app/                    React workbench shell
  components/ui/          shadcn-generated UI components
  features/repository/    Frontend repository DTOs, helpers, and Tauri client
src-tauri/
  src/git/                Rust system Git command boundary
  src/lib.rs              Tauri command registration
docs/
  roadmap.md              Active product roadmap and progress
```

## Next Milestone

The next milestone is safe complex operations:

- Add previews before pull and push.
- Add hunk-level staging for supported text diffs.
