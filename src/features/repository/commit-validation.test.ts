import { describe, expect, test } from "vitest";

import { isCommitSummaryValid } from "./commit-validation";

describe("isCommitSummaryValid", () => {
  test("requires non-whitespace summary text", () => {
    expect(isCommitSummaryValid("")).toBe(false);
    expect(isCommitSummaryValid("   ")).toBe(false);
    expect(isCommitSummaryValid("Wire local git core")).toBe(true);
  });
});
