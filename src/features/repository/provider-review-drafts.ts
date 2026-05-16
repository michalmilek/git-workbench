import type { ProviderReviewDraft, ProviderReviewDraftPreview } from "./repository-types";

export type ProviderReviewDraftValidation = {
  ok: boolean;
  message: string;
};

export function validateProviderReviewDraft(draft: ProviderReviewDraft): ProviderReviewDraftValidation {
  if (draft.body.trim().length === 0) {
    return {
      message: "Write a comment before previewing.",
      ok: false
    };
  }

  if (draft.target.kind === "inline" && draft.target.position === null) {
    return {
      message: "Inline comments need provider position metadata.",
      ok: false
    };
  }

  return {
    message: "Ready to preview.",
    ok: true
  };
}

export function buildProviderReviewDraftPreview(draft: ProviderReviewDraft): ProviderReviewDraftPreview {
  return {
    body: draft.body.trim(),
    summary: providerReviewDraftSummary(draft),
    target: draft.target
  };
}

function providerReviewDraftSummary(draft: ProviderReviewDraft): string {
  if (draft.target.kind === "topLevel") {
    return `Top-level comment on ${draft.itemId}`;
  }

  return `Inline comment on ${draft.target.path}:${draft.target.position?.line ?? "?"}`;
}
