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
  GitOperationResult,
  ProviderAccount,
  ProviderRemoteList,
  ProviderWorkItem,
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
  listStashes: vi.fn<() => Promise<StashEntry[]>>(),
  pullRepository: vi.fn<() => Promise<GitOperationResult>>()
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

  test("renders provider-neutral work item details and updates selection", async () => {
    repositoryMocks.listProviderWorkItems.mockResolvedValue({
      items: [
        providerWorkItem({ id: "github:origin:42", title: "Add provider work panel" }),
        providerWorkItem({
          author: "sam-chen",
          checkStatus: "failed",
          ciUrl: "https://gitlab.company.test/platform/workbench/-/pipelines/20260516",
          id: "gitlab:company:17",
          providerBaseUrl: "https://gitlab.company.test",
          providerKind: "customGitlab",
          remoteName: "company",
          sourceBranch: "fix/provider-refresh",
          state: "opened",
          targetBranch: "main",
          title: "Refresh provider work after account changes",
          webUrl: "https://gitlab.company.test/platform/workbench/-/merge_requests/17"
        })
      ],
      message: "Loaded 2 provider work item(s)."
    });

    await openRepository(container, "/repo");

    expect(providerWorkItemDetailsText(container)).toContain("Add provider work panel");
    expect(providerWorkItemDetailsText(container)).toContain("Pull request");
    expect(providerWorkItemDetailsText(container)).toContain("GitHub");
    expect(providerWorkItemDetailsText(container)).toContain("Running");

    await clickButton(container, "Refresh provider work after account changes");

    expect(providerWorkItemDetailsText(container)).toContain("Refresh provider work after account changes");
    expect(providerWorkItemDetailsText(container)).toContain("Merge request");
    expect(providerWorkItemDetailsText(container)).toContain("Custom GitLab");
    expect(providerWorkItemDetailsText(container)).toContain("fix/provider-refresh -> main");
    expect(providerWorkItemDetailsText(container)).toContain("Failed");
  });

  test("runs pull for selected workspace repositories only", async () => {
    repositoryMocks.pullRepository.mockResolvedValue({ command: "git pull", stderr: "", stdout: "Pulled selected repository." });

    await openRepository(container, "/repo");
    await openRepository(container, "/repo-two");
    await clickCheckbox(container, "Select /repo for batch operations");
    await clickButton(container, "Pull selected");

    expect(repositoryMocks.pullRepository).toHaveBeenCalledTimes(1);
    expect(repositoryMocks.pullRepository).toHaveBeenCalledWith({
      operationId: expect.any(String),
      repositoryPath: "/repo"
    });
    expect(container.textContent).toContain("Pull repo");
    expect(container.textContent).toContain("Pulled selected repository.");
  });

  test("saves a company setup profile and matches it to provider remotes", async () => {
    repositoryMocks.listProviderRemotes.mockResolvedValue({
      remotes: [
        {
          fetchUrl: "ssh://git@gitlab.company.test/platform/workbench.git",
          host: "gitlab.company.test",
          owner: "platform",
          providerKind: "customGitlab",
          pushUrl: null,
          remoteName: "company",
          repository: "workbench",
          webUrl: "https://gitlab.company.test/platform/workbench"
        }
      ]
    });

    await openRepository(container, "/repo");
    await setFieldValue(container, "#company-profile-name", "Platform");
    await setFieldValue(container, "#company-profile-gitlab-url", "https://gitlab.company.test/platform");
    await setFieldValue(container, "#company-profile-vpn", "Corp VPN");
    await setFieldValue(container, "#company-profile-ssh", "gitlab.company.test");
    await setFieldValue(container, "#company-profile-notes", "Use hardware key");
    await clickButton(container, "Save profile");

    expect(companyProfilesText(container)).toContain("Matched: Platform");
    expect(companyProfilesText(container)).toContain("Corp VPN");
    expect(companyProfilesText(container)).toContain("gitlab.company.test");
    expect(companyProfilesText(container)).toContain("Use hardware key");
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
  repositoryMocks.pullRepository.mockResolvedValue({ command: "git pull", stderr: "", stdout: "" });
}

async function openRepository(container: HTMLElement, path: string) {
  await act(async () => {
    const input = requiredElement<HTMLInputElement>(container.querySelector("#repository-path"));
    setNativeFieldValue(input, path);
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

async function clickCheckbox(container: HTMLElement, label: string) {
  await act(async () => {
    const checkbox = requiredElement<HTMLInputElement>(container.querySelector(`input[aria-label="${label}"]`));
    checkbox.click();
  });

  await flushReactWork();
}

async function setFieldValue(container: HTMLElement, selector: string, value: string) {
  await act(async () => {
    const field = requiredElement<HTMLInputElement | HTMLTextAreaElement>(container.querySelector(selector));
    setNativeFieldValue(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await flushReactWork();
}

function setNativeFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor === undefined || descriptor.set === undefined) {
    throw new Error("Expected a native field value setter.");
  }

  descriptor.set.call(field, value);
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

function providerWorkItemDetailsText(container: HTMLElement): string {
  return requiredElement(container.querySelector("[data-testid='provider-work-item-details-panel']")).textContent ?? "";
}

function companyProfilesText(container: HTMLElement): string {
  return requiredElement(container.querySelector("[data-testid='company-profiles-panel']")).textContent ?? "";
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

function providerWorkItem(overrides: Partial<ProviderWorkItem> = {}): ProviderWorkItem {
  return {
    accountId: "account-1",
    author: "alex-rivera",
    checkStatus: "running",
    ciUrl: "https://github.com/openai/codex/actions/runs/1516",
    id: "github:origin:42",
    providerBaseUrl: "https://github.com",
    providerKind: "github",
    remoteName: "origin",
    sourceBranch: "feature/provider-work-panel",
    state: "open",
    targetBranch: "main",
    title: "Add provider work panel",
    webUrl: "https://github.com/openai/codex/pull/42",
    ...overrides
  };
}
