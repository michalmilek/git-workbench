import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { App } from "./App";
import { RECENT_REPOSITORIES_STORAGE_KEY, serializeRecentRepositories } from "@/features/repository/repository-recents";
import type {
  BranchList,
  ConflictState,
  CommitDetails,
  FileDiff,
  ProviderAccount,
  ProviderRemoteList,
  ProviderWorkItemList,
  RepositoryStatus,
  StashEntry
} from "@/features/repository/repository-types";

const repositoryMocks = vi.hoisted(() => ({
  getCommitDetails: vi.fn<() => Promise<CommitDetails>>(),
  getConflictState: vi.fn<() => Promise<ConflictState>>(),
  getFileDiff: vi.fn<() => Promise<FileDiff>>(),
  getRepositoryStatus: vi.fn<() => Promise<RepositoryStatus>>(),
  listBranches: vi.fn<() => Promise<BranchList>>(),
  listCommitHistory: vi.fn<() => Promise<[]>>(),
  listProviderAccounts: vi.fn<() => Promise<ProviderAccount[]>>(),
  listProviderRemotes: vi.fn<() => Promise<ProviderRemoteList>>(),
  listProviderWorkItems: vi.fn<() => Promise<ProviderWorkItemList>>(),
  listStashes: vi.fn<() => Promise<StashEntry[]>>()
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {}))
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn()
}));

vi.mock("@/features/repository/repository-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/repository/repository-client")>();

  return {
    ...actual,
    ...repositoryMocks
  };
});

describe("App repository health", () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(async () => {
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    installMemoryLocalStorage();
    localStorage.setItem(RECENT_REPOSITORIES_STORAGE_KEY, serializeRecentRepositories(["/repo"]));
    resetRepositoryMocks();
    container = document.createElement("div");
    document.body.append(container);

    await act(async () => {
      root = createRoot(container);
      root.render(<App />);
    });
  });

  afterEach(async () => {
    if (root !== null) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    vi.clearAllMocks();
  });

  test("keeps the last successful refresh age when a repository refresh fails", async () => {
    repositoryMocks.getRepositoryStatus.mockResolvedValueOnce(repositoryStatus()).mockRejectedValueOnce(new Error("status failed"));

    await openRepository(container, "/repo");
    expect(repositoryHealthText(container)).toContain("Last refreshJust now");

    await clickButton(container, "Refresh");
    expect(repositoryHealthText(container)).toContain("Last refreshJust now");
    expect(repositoryHealthText(container)).not.toContain("Last refreshNever refreshed");
  });
});

function installMemoryLocalStorage() {
  const storage = createMemoryStorage();
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    }
  };
}

function resetRepositoryMocks() {
  repositoryMocks.getRepositoryStatus.mockResolvedValue(repositoryStatus());
  repositoryMocks.getConflictState.mockResolvedValue(noConflictState());
  repositoryMocks.getFileDiff.mockResolvedValue({ isBinary: false, path: "src/App.tsx", text: "" });
  repositoryMocks.listBranches.mockResolvedValue({ branches: [] });
  repositoryMocks.listCommitHistory.mockResolvedValue([]);
  repositoryMocks.getCommitDetails.mockRejectedValue(new Error("commit details are not used in this test"));
  repositoryMocks.listProviderAccounts.mockResolvedValue([]);
  repositoryMocks.listProviderRemotes.mockResolvedValue({ remotes: [] });
  repositoryMocks.listProviderWorkItems.mockResolvedValue({ items: [], message: "No open provider work items found." });
  repositoryMocks.listStashes.mockResolvedValue([]);
}

async function openRepository(container: HTMLElement, path: string) {
  await act(async () => {
    const input = requiredElement<HTMLInputElement>(container.querySelector("#repository-path"));
    input.value = path;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await flushReactWork();

  await clickButton(container, "Open");
}

async function clickButton(container: HTMLElement, label: string) {
  await act(async () => {
    const button = findButton(container, label);
    button.click();
  });

  await flushReactWork();
}

async function flushReactWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes(label) === true);

  return requiredElement(button ?? null);
}

function repositoryHealthText(container: HTMLElement): string {
  return requiredElement(container.querySelector("[data-testid='repository-health-panel']")).textContent ?? "";
}

function requiredElement<T extends Element>(element: T | null): T {
  if (element === null) {
    throw new Error("Expected test element to exist.");
  }

  return element;
}

function repositoryStatus(): RepositoryStatus {
  return {
    ahead: 0,
    behind: 0,
    branch: "main",
    files: [],
    upstream: "origin/main"
  };
}

function noConflictState(): ConflictState {
  return {
    canAbortMerge: false,
    canAbortRebase: false,
    canContinueRebase: false,
    files: [],
    message: "No merge or rebase in progress.",
    operation: "none"
  };
}
