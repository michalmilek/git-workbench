# Provider Work Item Details Design

Date: 2026-05-16
Status: Implemented

## Goal

Add one provider-neutral PR/MR detail surface that works for GitHub pull requests, GitLab merge requests, and self-hosted GitLab merge requests.

## Scope

This milestone uses provider work item data the app already loads. It does not add inline review comments, provider-side mutations, or extra provider API calls. The view should make a selected PR/MR readable in one consistent shape regardless of provider.

## User Experience

The Work items panel keeps showing the active repository's open PRs/MRs. Selecting one item updates a details panel in the action panel with:

- PR/MR title and provider-specific review kind.
- Provider, remote, state, author, source branch, and target branch.
- CI/check status with the same badge tones used elsewhere.
- External links for PR/MR and CI when trusted provider URLs are available.

When no work items exist, the details panel shows a neutral empty state. When provider work items are loading or unavailable, it should not claim a specific PR/MR selection exists.

## Architecture

Add `src/features/repository/provider-work-item-details.ts` as a pure helper that resolves the selected item and returns display-ready fields. `App.tsx` owns the selected provider work item id, resets it when repository/provider data changes, and renders a details panel using the helper. Existing provider account and provider remote behavior remains unchanged.

## Testing

Vitest covers deterministic item selection, provider-specific labels, branch/author fallbacks, and CI/check rollups. Browser smoke verifies selecting GitHub and GitLab/custom GitLab work items updates the common detail surface without console errors or mobile overflow.

## Out Of Scope

- Inline PR/MR comments.
- Provider-side approvals, merges, labels, assignments, or status mutations.
- Fetching provider diff files beyond the already-loaded work item DTO.
