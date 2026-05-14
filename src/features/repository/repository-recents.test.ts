import { describe, expect, test } from "vitest";

import {
  RECENT_REPOSITORY_LIMIT,
  parseRecentRepositories,
  serializeRecentRepositories,
  updateRecentRepositories
} from "./repository-recents";

describe("recent repository helpers", () => {
  test("moves an opened repository to the front", () => {
    expect(updateRecentRepositories(["/work/alpha", "/work/beta"], " /work/beta ")).toEqual([
      "/work/beta",
      "/work/alpha"
    ]);
  });

  test("keeps a limited list of unique non-empty paths", () => {
    const recents = updateRecentRepositories(
      ["/one", "", "/two", "/three", "/four", "/five", "/six"],
      "/seven"
    );

    expect(recents).toHaveLength(RECENT_REPOSITORY_LIMIT);
    expect(recents).toEqual(["/seven", "/one", "/two", "/three", "/four", "/five"]);
  });

  test("round-trips recent repositories for localStorage", () => {
    const stored = serializeRecentRepositories([" /repo ", "/repo", "/other"]);

    expect(parseRecentRepositories(stored)).toEqual(["/repo", "/other"]);
    expect(parseRecentRepositories(null)).toEqual([]);
  });
});
