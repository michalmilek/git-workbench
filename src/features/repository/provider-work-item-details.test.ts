import { describe, expect, test } from "vitest";

import { buildProviderWorkItemDetails } from "./provider-work-item-details";
import type { ProviderCheckStatus, ProviderWorkItem } from "./repository-types";

describe("buildProviderWorkItemDetails", () => {
  test("returns no detail when there are no provider work items", () => {
    expect(buildProviderWorkItemDetails([], "github:origin:42")).toEqual({
      detail: null,
      selectedId: null
    });
  });

  test("selects the requested item and returns its detail labels", () => {
    const result = buildProviderWorkItemDetails(
      [
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
      "gitlab:company:17"
    );

    expect(result).toEqual({
      detail: {
        authorLabel: "sam-chen",
        branchFlowLabel: "fix/provider-refresh -> main",
        checkLabel: "Failed",
        checkTone: "destructive",
        ciUrl: "https://gitlab.company.test/platform/workbench/-/pipelines/20260516",
        providerBaseUrl: "https://gitlab.company.test",
        providerLabel: "Custom GitLab",
        remoteLabel: "company",
        reviewKindLabel: "Merge request",
        selectedId: "gitlab:company:17",
        stateLabel: "opened",
        title: "Refresh provider work after account changes",
        workUrl: "https://gitlab.company.test/platform/workbench/-/merge_requests/17"
      },
      selectedId: "gitlab:company:17"
    });
  });

  test("falls back to the first item when the selected id is null or missing", () => {
    const items = [
      providerWorkItem({ id: "github:origin:42", title: "Add provider work panel" }),
      providerWorkItem({ id: "github:origin:43", title: "Polish provider details" })
    ];

    expect(buildProviderWorkItemDetails(items, null).selectedId).toBe("github:origin:42");
    expect(buildProviderWorkItemDetails(items, "github:origin:404").selectedId).toBe("github:origin:42");
  });

  test("labels GitHub pull requests and GitLab merge requests", () => {
    expect(buildProviderWorkItemDetails([providerWorkItem({ providerKind: "github" })], null).detail).toMatchObject({
      providerLabel: "GitHub",
      reviewKindLabel: "Pull request"
    });
    expect(buildProviderWorkItemDetails([providerWorkItem({ providerKind: "gitlab" })], null).detail).toMatchObject({
      providerLabel: "GitLab",
      reviewKindLabel: "Merge request"
    });
    expect(buildProviderWorkItemDetails([providerWorkItem({ providerKind: "customGitlab" })], null).detail).toMatchObject({
      providerLabel: "Custom GitLab",
      reviewKindLabel: "Merge request"
    });
  });

  test("formats unknown author, branch, and check labels", () => {
    expect(
      buildProviderWorkItemDetails(
        [
          providerWorkItem({
            author: null,
            checkStatus: "unknown",
            ciUrl: null,
            sourceBranch: null,
            targetBranch: null,
            webUrl: null
          })
        ],
        null
      ).detail
    ).toMatchObject({
      authorLabel: "unknown author",
      branchFlowLabel: "unknown -> unknown",
      checkLabel: "Unknown",
      checkTone: "outline",
      ciUrl: null,
      workUrl: null
    });
  });

  test.each([
    ["pending", "Running", "outline"],
    ["running", "Running", "outline"],
    ["success", "Passing", "secondary"],
    ["failed", "Failed", "destructive"],
    ["canceled", "Failed", "destructive"],
    ["unknown", "Unknown", "outline"]
  ] satisfies [ProviderCheckStatus, string, "secondary" | "destructive" | "outline"][])(
    "formats %s checks",
    (checkStatus, checkLabel, checkTone) => {
      expect(buildProviderWorkItemDetails([providerWorkItem({ checkStatus })], null).detail).toMatchObject({
        checkLabel,
        checkTone
      });
    }
  );
});

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
