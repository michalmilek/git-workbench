export const COMPANY_PROFILES_STORAGE_KEY = "git-workbench:company-profiles";
export const COMPANY_PROFILE_LIMIT = 6;

export type CompanyProfile = {
  id: string;
  name: string;
  gitlabBaseUrl: string;
  vpnLabel: string;
  sshHost: string;
  notes: string;
  updatedAt: string;
};

export type CompanyProfileInput = {
  name: string;
  gitlabBaseUrl: string;
  vpnLabel: string;
  sshHost: string;
  notes: string;
};

export function normalizeCompanyProfileInput(input: CompanyProfileInput, now: Date): CompanyProfile | null {
  const profile = {
    gitlabBaseUrl: normalizeProfileUrl(input.gitlabBaseUrl),
    name: input.name.trim(),
    notes: input.notes.trim(),
    sshHost: input.sshHost.trim(),
    vpnLabel: input.vpnLabel.trim()
  };

  if (
    profile.name.length === 0 ||
    [profile.gitlabBaseUrl, profile.notes, profile.sshHost, profile.vpnLabel].every((value) => value.length === 0)
  ) {
    return null;
  }

  return {
    ...profile,
    id: profileId(profile.name, profile.gitlabBaseUrl, profile.sshHost),
    updatedAt: now.toISOString()
  };
}

export function upsertCompanyProfile(profiles: CompanyProfile[], profile: CompanyProfile): CompanyProfile[] {
  return [profile, ...profiles.filter((existingProfile) => existingProfile.id !== profile.id)].slice(0, COMPANY_PROFILE_LIMIT);
}

export function removeCompanyProfile(profiles: CompanyProfile[], id: string): CompanyProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}

export function parseCompanyProfiles(value: string | null): CompanyProfile[] {
  if (value === null || value.length === 0) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isCompanyProfile).slice(0, COMPANY_PROFILE_LIMIT);
  } catch {
    return [];
  }
}

export function serializeCompanyProfiles(profiles: CompanyProfile[]): string {
  return JSON.stringify(profiles.filter(isCompanyProfile).slice(0, COMPANY_PROFILE_LIMIT));
}

export function matchCompanyProfile(profiles: CompanyProfile[], remoteUrls: string[]): CompanyProfile | null {
  for (const profile of profiles) {
    if (remoteUrls.some((remoteUrl) => profileMatchesRemote(profile, remoteUrl))) {
      return profile;
    }
  }

  return null;
}

function profileMatchesRemote(profile: CompanyProfile, remoteUrl: string): boolean {
  if (profile.gitlabBaseUrl.length > 0 && remoteMatchesGitlabBaseUrl(remoteUrl, profile.gitlabBaseUrl)) {
    return true;
  }

  return profile.sshHost.length > 0 && remoteUrl.includes(profile.sshHost);
}

function remoteMatchesGitlabBaseUrl(remoteUrl: string, gitlabBaseUrl: string): boolean {
  const gitlabBase = parseProfileUrl(gitlabBaseUrl);

  if (gitlabBase === null) {
    return false;
  }

  if (!remoteUrl.includes(gitlabBase.host)) {
    return false;
  }

  return gitlabBase.path.length === 0 || remoteUrl.includes(gitlabBase.path);
}

function normalizeProfileUrl(value: string): string {
  const trimmedValue = value.trim().replace(/\/+$/, "");

  if (trimmedValue.length === 0) {
    return "";
  }

  const parsedUrl = parseProfileUrl(trimmedValue);

  if (parsedUrl === null) {
    return trimmedValue;
  }

  return `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.path.length === 0 ? "" : `/${parsedUrl.path}`}`;
}

function parseProfileUrl(value: string): { protocol: string; host: string; path: string } | null {
  try {
    const url = new URL(value);
    return {
      host: url.host,
      path: url.pathname.replace(/^\/+|\/+$/g, ""),
      protocol: url.protocol
    };
  } catch {
    return null;
  }
}

function profileId(name: string, gitlabBaseUrl: string, sshHost: string): string {
  return slug([name, gitlabBaseUrl, sshHost].filter((value) => value.length > 0).join(" "));
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isCompanyProfile(value: unknown): value is CompanyProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const profile = value as Partial<CompanyProfile>;

  return (
    typeof profile.id === "string" &&
    profile.id.length > 0 &&
    typeof profile.name === "string" &&
    profile.name.length > 0 &&
    typeof profile.gitlabBaseUrl === "string" &&
    typeof profile.vpnLabel === "string" &&
    typeof profile.sshHost === "string" &&
    typeof profile.notes === "string" &&
    typeof profile.updatedAt === "string"
  );
}
