import { describe, expect, test } from "vitest";

import { buildProviderReviewDraftPreview, validateProviderReviewDraft } from "./provider-review-drafts";
import type { ProviderReviewDraft, ProviderReviewPosition } from "./repository-types";

describe("provider review drafts", () => {
  test("rejects empty top-level draft bodies", () => {
    expect(validateProviderReviewDraft(providerReviewDraft({ body: "   " }))).toEqual({
      message: "Write a comment before previewing.",
      ok: false
    });
  });

  test("accepts top-level draft bodies with comment text", () => {
    expect(validateProviderReviewDraft(providerReviewDraft({ body: "Looks ready." }))).toEqual({
      message: "Ready to preview.",
      ok: true
    });
  });

  test("rejects inline drafts without provider position metadata", () => {
    expect(
      validateProviderReviewDraft(
        providerReviewDraft({
          body: "Please adjust this line.",
          target: {
            kind: "inline",
            path: "src/app/App.tsx",
            position: null
          }
        })
      )
    ).toEqual({
      message: "Inline comments need provider position metadata.",
      ok: false
    });
  });

  test("builds preview summary text for top-level drafts", () => {
    expect(buildProviderReviewDraftPreview(providerReviewDraft({ body: "Looks ready." }))).toEqual({
      body: "Looks ready.",
      summary: "Top-level comment on github:origin:42",
      target: {
        kind: "topLevel"
      }
    });
  });

  test("builds preview summary text for inline drafts", () => {
    expect(
      buildProviderReviewDraftPreview(
        providerReviewDraft({
          body: "Please adjust this line.",
          target: {
            kind: "inline",
            path: "src/app/App.tsx",
            position: providerReviewPosition({ line: 42, path: "src/app/App.tsx" })
          }
        })
      )
    ).toEqual({
      body: "Please adjust this line.",
      summary: "Inline comment on src/app/App.tsx:42",
      target: {
        kind: "inline",
        path: "src/app/App.tsx",
        position: providerReviewPosition({ line: 42, path: "src/app/App.tsx" })
      }
    });
  });
});

function providerReviewDraft(overrides: Partial<ProviderReviewDraft> = {}): ProviderReviewDraft {
  return {
    body: "Looks ready.",
    itemId: "github:origin:42",
    target: {
      kind: "topLevel"
    },
    ...overrides
  };
}

function providerReviewPosition(overrides: Partial<ProviderReviewPosition> = {}): ProviderReviewPosition {
  return {
    baseSha: "base",
    headSha: "head",
    line: 12,
    newLine: 12,
    oldLine: null,
    oldPath: null,
    path: "src/app/App.tsx",
    positionType: "text",
    providerKind: "github",
    side: "RIGHT",
    startSha: "start",
    ...overrides
  };
}
