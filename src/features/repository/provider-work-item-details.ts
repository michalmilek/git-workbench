import type { ProviderAccountKind, ProviderCheckStatus, ProviderWorkItem } from "./repository-types";

export type ProviderWorkItemDetailTone = "secondary" | "destructive" | "outline";

export type ProviderWorkItemDetail = {
  selectedId: string;
  accountId: string | null;
  title: string;
  providerLabel: string;
  reviewKindLabel: string;
  stateLabel: string;
  authorLabel: string;
  branchFlowLabel: string;
  remoteLabel: string;
  checkLabel: string;
  checkTone: ProviderWorkItemDetailTone;
  workUrl: string | null;
  ciUrl: string | null;
  providerBaseUrl: string;
};

export type ProviderWorkItemDetails = {
  selectedId: string | null;
  detail: ProviderWorkItemDetail | null;
};

export function buildProviderWorkItemDetails(items: ProviderWorkItem[], selectedId: string | null): ProviderWorkItemDetails {
  if (items.length === 0) {
    return {
      detail: null,
      selectedId: null
    };
  }

  const item = selectedId === null ? items[0] : items.find((workItem) => workItem.id === selectedId) ?? items[0];
  const check = formatCheck(item.checkStatus);

  return {
    detail: {
      accountId: item.accountId,
      authorLabel: item.author ?? "unknown author",
      branchFlowLabel: `${item.sourceBranch ?? "unknown"} -> ${item.targetBranch ?? "unknown"}`,
      checkLabel: check.label,
      checkTone: check.tone,
      ciUrl: item.ciUrl,
      providerBaseUrl: item.providerBaseUrl,
      providerLabel: providerLabel(item.providerKind),
      remoteLabel: item.remoteName,
      reviewKindLabel: reviewKindLabel(item.providerKind),
      selectedId: item.id,
      stateLabel: item.state,
      title: item.title,
      workUrl: item.webUrl
    },
    selectedId: item.id
  };
}

function providerLabel(providerKind: ProviderAccountKind): string {
  switch (providerKind) {
    case "customGitlab":
      return "Custom GitLab";
    case "github":
      return "GitHub";
    case "gitlab":
      return "GitLab";
  }
}

function reviewKindLabel(providerKind: ProviderAccountKind): string {
  switch (providerKind) {
    case "github":
      return "Pull request";
    case "customGitlab":
    case "gitlab":
      return "Merge request";
  }
}

function formatCheck(status: ProviderCheckStatus): { label: string; tone: ProviderWorkItemDetailTone } {
  switch (status) {
    case "pending":
    case "running":
      return { label: "Running", tone: "outline" };
    case "success":
      return { label: "Passing", tone: "secondary" };
    case "failed":
    case "canceled":
      return { label: "Failed", tone: "destructive" };
    case "unknown":
      return { label: "Unknown", tone: "outline" };
  }
}
