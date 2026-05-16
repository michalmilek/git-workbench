import { describe, expect, test } from "vitest";

import { buildProviderReviewGroups, summarizeProviderReviewDetails } from "./provider-review-details";
import type { ProviderReviewDetails, ProviderReviewFile, ProviderReviewThread } from "./repository-types";

describe("provider review details helpers", () => {
  test("summarizes review files, threads, comments, and provider size flags", () => {
    expect(
      summarizeProviderReviewDetails(
        providerReviewDetails({
          files: [
            providerReviewFile({ path: "src/app/App.tsx" }),
            providerReviewFile({ collapsed: true, path: "src/generated.ts" }),
            providerReviewFile({ path: "dist/large.js", tooLarge: true })
          ],
          threads: [
            providerReviewThread({ comments: [{ author: "Alex", body: "Looks good", createdAt: "2026-05-16T08:00:00Z", id: "1", system: false }] }),
            providerReviewThread({
              comments: [
                { author: "Sam", body: "Question", createdAt: "2026-05-16T08:10:00Z", id: "2", system: false },
                { author: "Alex", body: "Answered", createdAt: "2026-05-16T08:12:00Z", id: "3", system: false }
              ],
              id: "thread-inline",
              line: 42,
              path: "src/app/App.tsx"
            })
          ]
        })
      )
    ).toEqual({
      collapsedFileCount: 1,
      commentCount: 3,
      fileCount: 3,
      inlineThreadCount: 1,
      threadCount: 2,
      tooLargeFileCount: 1,
      topLevelThreadCount: 1
    });
  });

  test("groups top-level and inline review threads with their files", () => {
    const topLevel = providerReviewThread({ id: "thread-top", path: null });
    const appThread = providerReviewThread({ id: "thread-app", line: 12, path: "src/app/App.tsx" });
    const clientThread = providerReviewThread({ id: "thread-client", line: 8, path: "src/repository-client.ts" });

    expect(
      buildProviderReviewGroups(
        providerReviewDetails({
          files: [
            providerReviewFile({ path: "src/app/App.tsx" }),
            providerReviewFile({ path: "src/repository-client.ts" })
          ],
          threads: [topLevel, appThread, clientThread]
        })
      )
    ).toEqual({
      files: [
        {
          file: providerReviewFile({ path: "src/app/App.tsx" }),
          threads: [appThread]
        },
        {
          file: providerReviewFile({ path: "src/repository-client.ts" }),
          threads: [clientThread]
        }
      ],
      topLevelThreads: [topLevel]
    });
  });
});

function providerReviewDetails(overrides: Partial<ProviderReviewDetails> = {}): ProviderReviewDetails {
  return {
    author: "alex-rivera",
    checkStatus: "running",
    files: [],
    itemId: "github:origin:42",
    message: "Loaded review details.",
    providerBaseUrl: "https://github.com",
    providerKind: "github",
    remoteName: "origin",
    sourceBranch: "feature/review",
    state: "open",
    targetBranch: "main",
    threads: [],
    title: "Add review details",
    webUrl: "https://github.com/openai/codex/pull/42",
    ...overrides
  };
}

function providerReviewFile(overrides: Partial<ProviderReviewFile> = {}): ProviderReviewFile {
  return {
    additions: 24,
    collapsed: false,
    deletions: 6,
    patch: "@@ -1,2 +1,3 @@",
    path: "src/app/App.tsx",
    position: null,
    previousPath: null,
    status: "modified",
    tooLarge: false,
    ...overrides
  };
}

function providerReviewThread(overrides: Partial<ProviderReviewThread> = {}): ProviderReviewThread {
  return {
    comments: [],
    id: "thread-top",
    line: null,
    path: null,
    resolved: false,
    ...overrides
  };
}
