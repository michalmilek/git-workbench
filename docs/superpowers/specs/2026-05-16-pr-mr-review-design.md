# PR/MR Review Design

Date: 2026-05-16
Status: Planned

## Goal

Add provider-neutral PR/MR review details and inline commenting for GitHub, GitLab.com, and self-hosted GitLab without changing local Git transport.

## Product Scope

The first implementation should turn the existing Provider review panel into a review workspace for the selected pull request or merge request. It should show changed files, provider threads, CI state, and a safe comment composer. Write actions must be explicit and previewed before sending anything to a provider.

## Provider API References

- GitHub REST pull request files and pull request endpoints: `GET /repos/{owner}/{repo}/pulls/{pull_number}/files` documented at `https://docs.github.com/en/rest/pulls/pulls`.
- GitHub REST pull request review comments: list and create review comments for pull request diffs documented at `https://docs.github.com/en/rest/pulls/comments`.
- GitLab merge request diffs: `GET /projects/:id/merge_requests/:merge_request_iid/diffs` documented at `https://docs.gitlab.com/api/merge_requests/`.
- GitLab discussions: `GET /projects/:id/merge_requests/:merge_request_iid/discussions` and discussion creation documented at `https://docs.gitlab.com/api/discussions/`.
- GitLab notes: `POST /projects/:id/merge_requests/:merge_request_iid/notes` for top-level merge request notes documented at `https://docs.gitlab.com/api/notes/`.

## User Experience

Selecting a provider work item shows:

- Review metadata: provider, PR/MR number, author, source and target branch, state, CI/check status, and external links.
- Changed files with status, additions, deletions, patch text where available, and an indicator for files that are too large or collapsed by the provider.
- Existing provider discussion threads grouped by file and line when possible, with a top-level conversation group for non-inline comments.
- A local draft composer for top-level comments and inline comments.
- A review payload preview before any submit action.
- A command/result panel entry after submit, matching existing Git operation feedback patterns.

## Architecture

Backend commands should remain the provider boundary. Frontend code asks Tauri for review details and sends explicit comment payloads through Tauri commands. Tokens stay in the OS keychain and are only read inside Rust provider commands.

Add provider-neutral DTOs:

- `ProviderReviewDetails`: selected item metadata, file diffs, threads, and submit capability.
- `ProviderReviewFile`: path, previous path, status, additions, deletions, patch text, provider file id data, and size flags.
- `ProviderReviewThread`: thread id, file path, line, resolved state, comments, and provider-specific position metadata needed for replies or inline comments.
- `ProviderReviewDraft`: local top-level or inline draft body plus selected file/line context.
- `ProviderReviewSubmitResult`: command-like result with provider URL, created comment count, stdout, and stderr.

Provider-specific URL builders and JSON parsers should stay in Rust with unit tests. Frontend helper code should focus on grouping review data for display and validating local draft state.

## Write Boundaries

- No automatic provider comments.
- No submit action while the draft body is empty.
- No submit action without a preview step that shows provider, target item, comment type, file path, and line.
- No token, authorization header, or raw provider secret may appear in frontend DTOs, logs, errors, command output, or tests.
- Top-level comments can be submitted before inline comments if provider line-position requirements are not fully resolved.
- Inline comments must use provider-returned position metadata when available. The app should not invent provider diff coordinates from display-only patch text.

## Implementation Stages

1. Read-only review details.
2. Frontend review workspace UI.
3. Local draft helpers and preview panel.
4. Top-level comment submission.
5. Inline comment submission only after provider position metadata is proven by tests.

## Testing

Rust tests should cover provider API URL construction, JSON parsing for GitHub files/comments and GitLab diffs/discussions, token non-exposure, and submit payload construction. Frontend tests should cover DTO client wiring, grouping helpers, draft validation, App panel behavior, preview-before-submit, and browser smoke for selected work item review flows.

## Out Of Scope

- Approving, requesting changes, or merging PRs/MRs.
- Resolving threads.
- Batch review submission with many pending inline comments.
- AI-generated review comments.
- Replacing GitHub/GitLab notification workflows.
