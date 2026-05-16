export type KeyboardShortcutAction =
  | "view-changes"
  | "view-history"
  | "view-stashes"
  | "select-next"
  | "select-previous"
  | "stage-selected"
  | "unstage-selected"
  | "refresh"
  | "focus-history-filter";

export type KeyboardShortcutTarget = {
  tagName: string;
  isContentEditable: boolean;
  role: string | null;
};

export type KeyboardShortcutInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: KeyboardShortcutTarget | null;
};

const textEntryTags = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const textEntryRoles = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

const viewShortcuts = new Map<string, KeyboardShortcutAction>([
  ["1", "view-changes"],
  ["2", "view-history"],
  ["3", "view-stashes"]
]);

const plainShortcuts = new Map<string, KeyboardShortcutAction>([
  ["j", "select-next"],
  ["ArrowDown", "select-next"],
  ["k", "select-previous"],
  ["ArrowUp", "select-previous"],
  ["s", "stage-selected"],
  ["u", "unstage-selected"],
  ["r", "refresh"],
  ["/", "focus-history-filter"]
]);

export function resolveKeyboardShortcut(input: KeyboardShortcutInput): KeyboardShortcutAction | null {
  if (input.target && isTextEntryTarget(input.target)) {
    return null;
  }

  if ((input.ctrlKey || input.metaKey) && !input.altKey && !input.shiftKey) {
    return viewShortcuts.get(input.key) ?? null;
  }

  if (input.ctrlKey || input.metaKey || input.altKey || input.shiftKey) {
    return null;
  }

  return plainShortcuts.get(input.key) ?? null;
}

function isTextEntryTarget(target: KeyboardShortcutTarget): boolean {
  if (target.isContentEditable) {
    return true;
  }

  if (textEntryTags.has(target.tagName.toUpperCase())) {
    return true;
  }

  if (target.role && textEntryRoles.has(target.role.toLowerCase())) {
    return true;
  }

  return false;
}
