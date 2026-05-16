import { describe, expect, test } from "vitest";

import { trustedProviderUrl } from "./provider-links";

describe("trustedProviderUrl", () => {
  test("allows https URLs under the provider base URL", () => {
    expect(
      trustedProviderUrl(
        "https://gitlab.company.test/gitlab/platform/workbench/-/merge_requests/17",
        "https://gitlab.company.test/gitlab"
      )
    ).toBe("https://gitlab.company.test/gitlab/platform/workbench/-/merge_requests/17");
  });

  test("rejects non-https and outside-provider URLs", () => {
    expect(trustedProviderUrl("http://gitlab.company.test/gitlab/platform/workbench", "https://gitlab.company.test/gitlab")).toBeNull();
    expect(trustedProviderUrl("file:///Applications/Calculator.app", "https://gitlab.company.test/gitlab")).toBeNull();
    expect(trustedProviderUrl("https://evil.example.test/gitlab/platform/workbench", "https://gitlab.company.test/gitlab")).toBeNull();
    expect(trustedProviderUrl("https://gitlab.company.test/other/platform/workbench", "https://gitlab.company.test/gitlab")).toBeNull();
  });
});
