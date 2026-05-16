import { describe, expect, test } from "vitest";

import {
  COMPANY_PROFILES_STORAGE_KEY,
  COMPANY_PROFILE_LIMIT,
  matchCompanyProfile,
  normalizeCompanyProfileInput,
  parseCompanyProfiles,
  removeCompanyProfile,
  serializeCompanyProfiles,
  upsertCompanyProfile,
  type CompanyProfile
} from "./company-profiles";

const now = new Date("2026-05-16T12:00:00.000Z");

describe("company profile helpers", () => {
  test("exports stable localStorage settings", () => {
    expect(COMPANY_PROFILES_STORAGE_KEY).toBe("git-workbench:company-profiles");
    expect(COMPANY_PROFILE_LIMIT).toBe(6);
  });

  test("normalizes valid non-secret profile input", () => {
    expect(
      normalizeCompanyProfileInput(
        {
          gitlabBaseUrl: " https://gitlab.company.test/platform/ ",
          name: " Platform ",
          notes: " Use hardware key ",
          sshHost: " gitlab.company.test ",
          vpnLabel: " Corp VPN "
        },
        now
      )
    ).toEqual({
      gitlabBaseUrl: "https://gitlab.company.test/platform",
      id: "platform-https-gitlab-company-test-platform-gitlab-company-test",
      name: "Platform",
      notes: "Use hardware key",
      sshHost: "gitlab.company.test",
      updatedAt: "2026-05-16T12:00:00.000Z",
      vpnLabel: "Corp VPN"
    });
  });

  test("rejects empty profiles", () => {
    expect(normalizeCompanyProfileInput({ gitlabBaseUrl: "", name: "", notes: "", sshHost: "", vpnLabel: "" }, now)).toBeNull();
    expect(normalizeCompanyProfileInput({ gitlabBaseUrl: "", name: "Corp", notes: "", sshHost: "", vpnLabel: "" }, now)).toBeNull();
  });

  test("upserts profiles latest first, deduplicates by id, and enforces the limit", () => {
    const existing = Array.from({ length: COMPANY_PROFILE_LIMIT }, (_, index) => companyProfile({ id: `profile-${index}`, name: `P${index}` }));
    const replacement = companyProfile({ id: "profile-1", name: "Updated" });
    const newProfile = companyProfile({ id: "profile-new", name: "New" });

    const result = upsertCompanyProfile(existing, replacement);
    const overflowResult = upsertCompanyProfile(existing, newProfile);

    expect(result).toHaveLength(COMPANY_PROFILE_LIMIT);
    expect(result[0]).toEqual(replacement);
    expect(result.filter((profile) => profile.id === "profile-1")).toHaveLength(1);
    expect(overflowResult).toHaveLength(COMPANY_PROFILE_LIMIT);
    expect(overflowResult[0]).toEqual(newProfile);
    expect(overflowResult).not.toContainEqual(existing[COMPANY_PROFILE_LIMIT - 1]);
  });

  test("removes, parses, and serializes profiles", () => {
    const profile = companyProfile({ id: "corp" });
    const invalid = { ...profile, name: "" };

    expect(removeCompanyProfile([profile], "corp")).toEqual([]);
    expect(parseCompanyProfiles(null)).toEqual([]);
    expect(parseCompanyProfiles("not json")).toEqual([]);
    expect(parseCompanyProfiles(JSON.stringify([profile, invalid]))).toEqual([profile]);
    expect(JSON.parse(serializeCompanyProfiles([profile]))).toEqual([profile]);
  });

  test("matches profiles to GitLab base URLs and SSH hosts", () => {
    const platform = companyProfile({
      gitlabBaseUrl: "https://gitlab.company.test/platform",
      id: "platform",
      sshHost: ""
    });
    const infra = companyProfile({
      gitlabBaseUrl: "",
      id: "infra",
      sshHost: "git@gitlab.infra.test"
    });

    expect(matchCompanyProfile([platform, infra], ["ssh://git@gitlab.company.test/platform/workbench.git"])).toEqual(platform);
    expect(matchCompanyProfile([platform, infra], ["git@gitlab.infra.test:tools/repo.git"])).toEqual(infra);
    expect(matchCompanyProfile([platform], ["git@github.com:openai/codex.git"])).toBeNull();
  });
});

function companyProfile(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    gitlabBaseUrl: "https://gitlab.company.test",
    id: "company",
    name: "Company",
    notes: "Use company setup",
    sshHost: "gitlab.company.test",
    updatedAt: "2026-05-16T08:00:00.000Z",
    vpnLabel: "Corp VPN",
    ...overrides
  };
}
