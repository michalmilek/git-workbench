import { describe, expect, test } from "vitest";

import { resolveKeyboardShortcut } from "./keyboard-shortcuts";
import type { KeyboardShortcutAction, KeyboardShortcutInput, KeyboardShortcutTarget } from "./keyboard-shortcuts";

const defaultTarget: KeyboardShortcutTarget = {
  isContentEditable: false,
  role: null,
  tagName: "DIV"
};

function shortcutInput(input: Partial<KeyboardShortcutInput>): KeyboardShortcutInput {
  return {
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    target: defaultTarget,
    ...input
  };
}

describe("resolveKeyboardShortcut", () => {
  test.each([
    ["1", "view-changes"],
    ["2", "view-history"],
    ["3", "view-stashes"]
  ] satisfies Array<[string, KeyboardShortcutAction]>)("maps Ctrl+%s to %s", (key, action) => {
    expect(resolveKeyboardShortcut(shortcutInput({ ctrlKey: true, key }))).toBe(action);
  });

  test.each([
    ["1", "view-changes"],
    ["2", "view-history"],
    ["3", "view-stashes"]
  ] satisfies Array<[string, KeyboardShortcutAction]>)("maps Cmd+%s to %s", (key, action) => {
    expect(resolveKeyboardShortcut(shortcutInput({ key, metaKey: true }))).toBe(action);
  });

  test.each(["1", "2", "3"])("ignores view shortcut %s when Alt or Shift is held", (key) => {
    expect(resolveKeyboardShortcut(shortcutInput({ altKey: true, ctrlKey: true, key }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ ctrlKey: true, key, shiftKey: true }))).toBeNull();
  });

  test.each([
    ["j", "select-next"],
    ["ArrowDown", "select-next"],
    ["k", "select-previous"],
    ["ArrowUp", "select-previous"]
  ] satisfies Array<[string, KeyboardShortcutAction]>)("maps %s to %s", (key, action) => {
    expect(resolveKeyboardShortcut(shortcutInput({ key }))).toBe(action);
  });

  test.each([
    ["/", "focus-history-filter"],
    ["s", "stage-selected"],
    ["u", "unstage-selected"],
    ["r", "refresh"]
  ] satisfies Array<[string, KeyboardShortcutAction]>)("maps %s to %s", (key, action) => {
    expect(resolveKeyboardShortcut(shortcutInput({ key }))).toBe(action);
  });

  test.each([
    { isContentEditable: false, role: null, tagName: "INPUT" },
    { isContentEditable: false, role: null, tagName: "TEXTAREA" },
    { isContentEditable: false, role: null, tagName: "SELECT" },
    { isContentEditable: true, role: null, tagName: "DIV" },
    { isContentEditable: false, role: "textbox", tagName: "DIV" },
    { isContentEditable: false, role: "searchbox", tagName: "DIV" },
    { isContentEditable: false, role: "combobox", tagName: "DIV" },
    { isContentEditable: false, role: "spinbutton", tagName: "DIV" }
  ] satisfies KeyboardShortcutTarget[])("ignores shortcuts from text-entry target %#", (target) => {
    expect(resolveKeyboardShortcut(shortcutInput({ key: "s", target }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ ctrlKey: true, key: "1", target }))).toBeNull();
  });

  test("ignores unrecognized keys", () => {
    expect(resolveKeyboardShortcut(shortcutInput({ key: "x" }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ key: "Enter" }))).toBeNull();
  });

  test.each(["j", "k", "ArrowDown", "ArrowUp", "/", "s", "u", "r"])("ignores modified non-view shortcut %s", (key) => {
    expect(resolveKeyboardShortcut(shortcutInput({ ctrlKey: true, key }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ key, metaKey: true }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ altKey: true, key }))).toBeNull();
    expect(resolveKeyboardShortcut(shortcutInput({ key, shiftKey: true }))).toBeNull();
  });
});
