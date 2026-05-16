# Keyboard-First Navigation Design

Date: 2026-05-16
Status: Implemented

## Goal

Add keyboard-first navigation for repeated repository workflows without changing the existing Git operation model.

## Scope

This milestone adds a small global shortcut layer for the workbench. Shortcuts are active only when focus is outside text-entry controls. They switch top-level views, move selection in the active list, refresh the current repository, stage and unstage the selected file, and focus the history filter.

## User Experience

- `Ctrl+1` / `Cmd+1` switches to Changes.
- `Ctrl+2` / `Cmd+2` switches to History.
- `Ctrl+3` / `Cmd+3` switches to Stashes.
- `j` and `ArrowDown` select the next item in the active list.
- `k` and `ArrowUp` select the previous item in the active list.
- `r` refreshes the current repository or opens the typed repository path.
- `s` stages the selected changed file when it has worktree changes.
- `u` unstages the selected changed file when it has staged changes.
- `/` focuses the history filter while the History view is active.

## Architecture

Add `src/features/repository/keyboard-shortcuts.ts` as a pure helper that maps normalized keyboard input to actions and ignores editable targets. `App.tsx` installs one keydown listener, maps actions to existing view state and Git operations, and uses existing list selection functions for diffs, commits, and stashes.

## Testing

Vitest covers shortcut mapping and editable-target suppression in the pure helper. App component tests cover view switching, focusing the history filter, moving changed-file selection, stage/unstage shortcuts, and ignoring shortcuts while typing.

## Out Of Scope

- A visible command palette.
- User-customizable shortcuts.
- Shortcut rebinding.
- Destructive stash or branch shortcuts.
- Full menu-bar integration.
