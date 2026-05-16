import { describe, expect, test, vi } from "vitest";

const dialogMocks = vi.hoisted(() => ({
  open: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMocks.open
}));

import { buildCloneRepositoryInput, selectRepositoryDirectory } from "./repository-picker";

describe("selectRepositoryDirectory", () => {
  test("returns the selected folder path from the native dialog", async () => {
    dialogMocks.open.mockResolvedValue("/Users/name/project");

    await expect(selectRepositoryDirectory()).resolves.toBe("/Users/name/project");

    expect(dialogMocks.open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "Open repository folder"
    });
  });

  test("returns null when the native dialog is cancelled", async () => {
    dialogMocks.open.mockResolvedValue(null);

    await expect(selectRepositoryDirectory()).resolves.toBeNull();
  });
});

describe("buildCloneRepositoryInput", () => {
  test("trims clone URL and destination path", () => {
    expect(
      buildCloneRepositoryInput({
        destinationPath: " /work/codex ",
        remoteUrl: " https://github.com/openai/codex.git "
      })
    ).toEqual({
      destinationPath: "/work/codex",
      remoteUrl: "https://github.com/openai/codex.git"
    });
  });

  test("rejects empty clone fields", () => {
    expect(buildCloneRepositoryInput({ destinationPath: " /work/codex ", remoteUrl: " " })).toEqual({
      message: "Enter a repository URL before cloning."
    });
    expect(buildCloneRepositoryInput({ destinationPath: " ", remoteUrl: "https://github.com/openai/codex.git" })).toEqual({
      message: "Choose a destination folder before cloning."
    });
  });
});
