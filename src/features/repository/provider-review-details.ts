import type { ProviderReviewDetails, ProviderReviewFile, ProviderReviewThread } from "./repository-types";

export type ProviderReviewSummary = {
  fileCount: number;
  threadCount: number;
  inlineThreadCount: number;
  topLevelThreadCount: number;
  commentCount: number;
  tooLargeFileCount: number;
  collapsedFileCount: number;
};

export type ProviderReviewFileGroup = {
  file: ProviderReviewFile;
  threads: ProviderReviewThread[];
};

export type ProviderReviewGroups = {
  files: ProviderReviewFileGroup[];
  topLevelThreads: ProviderReviewThread[];
};

export function summarizeProviderReviewDetails(details: ProviderReviewDetails): ProviderReviewSummary {
  const inlineThreadCount = details.threads.filter((thread) => thread.path !== null).length;

  return {
    collapsedFileCount: details.files.filter((file) => file.collapsed).length,
    commentCount: details.threads.reduce((count, thread) => count + thread.comments.length, 0),
    fileCount: details.files.length,
    inlineThreadCount,
    threadCount: details.threads.length,
    tooLargeFileCount: details.files.filter((file) => file.tooLarge).length,
    topLevelThreadCount: details.threads.length - inlineThreadCount
  };
}

export function buildProviderReviewGroups(details: ProviderReviewDetails): ProviderReviewGroups {
  return {
    files: details.files.map((file) => ({
      file,
      threads: details.threads.filter((thread) => thread.path === file.path)
    })),
    topLevelThreads: details.threads.filter((thread) => thread.path === null)
  };
}
