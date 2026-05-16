# Company Setup Profiles Design

Date: 2026-05-16
Status: Implemented

## Goal

Add lightweight profiles for company GitLab, VPN, and SSH setup notes so self-hosted repositories are easier to recognize and prepare before Git/provider operations.

## Scope

This milestone stores non-secret setup metadata locally in the frontend. It does not replace SSH agents, VPN clients, keychains, Git credential helpers, or provider tokens. Profiles can describe a GitLab base URL, VPN label, SSH host, and operator notes.

## User Experience

The provider area gets a "Company profiles" panel. Users can save a profile with name, GitLab URL, VPN label, SSH host, and notes. The app shows the saved profiles and highlights the first profile that matches the active repository's provider remote URLs or SSH host.

## Architecture

Add `src/features/repository/company-profiles.ts` as a pure localStorage helper for normalization, parsing, serialization, upsert/remove, and remote matching. `App.tsx` owns profile form state and renders a compact panel near provider account configuration. Matching uses already-loaded provider remotes and never sends profile data outside the app.

## Testing

Vitest covers normalization, persistence, deduplication, limit enforcement, removal, invalid stored data, and remote matching. App component tests cover saving a profile and matching it against a loaded custom GitLab remote. Browser smoke verifies creating/removing a profile, match display, no console errors, and mobile overflow.

## Out Of Scope

- Storing tokens or SSH private keys.
- Starting/stopping VPN clients.
- Editing system SSH config.
- Replacing provider accounts or Git credential helpers.
