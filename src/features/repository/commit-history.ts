import type { CommitSummary } from "./repository-types";

export type CommitGraphLane = {
  lane: number;
  active: boolean;
  current: boolean;
  continuesAbove: boolean;
  continuesBelow: boolean;
  colorIndex: number;
};

export type CommitGraphRow = {
  commit: CommitSummary;
  connectorLanes: number[];
  currentLane: number;
  laneCount: number;
  lanes: CommitGraphLane[];
  mergeParentLanes: number[];
  isMerge: boolean;
};

type FilterToken = {
  scope: string | null;
  value: string;
};

const scopedFilters = new Set(["author", "ref", "branch", "hash", "oid", "subject", "merge"]);
const truthyMergeValues = new Set(["true", "yes", "1"]);
const falseyMergeValues = new Set(["false", "no", "0"]);
const localBranchPrefixes = new Set(["bugfix", "chore", "docs", "feature", "fix", "hotfix", "release", "wip"]);

export function filterCommitHistory(commits: CommitSummary[], filter: string): CommitSummary[] {
  const tokens = parseFilterTokens(filter);
  if (tokens.length === 0) {
    return commits;
  }

  return commits.filter((commit) => tokens.every((token) => isCommitTokenMatch(commit, token)));
}

export function buildCommitGraphRows(commits: CommitSummary[]): CommitGraphRow[] {
  const loadedOids = new Set(commits.map((commit) => commit.oid));
  const activeLanes: string[] = [];

  return commits.map((commit) => {
    const lanesAbove = activeLanes.slice();
    const existingLane = activeLanes.indexOf(commit.oid);
    const currentLane = existingLane === -1 ? activeLanes.length : existingLane;

    if (existingLane === -1) {
      activeLanes.push(commit.oid);
    }

    const nextLanes: Array<string | undefined> = activeLanes.slice();
    const loadedParents = commit.parents.filter((parent) => loadedOids.has(parent));
    const mergeParentLanes: number[] = [];

    for (const [lane, oid] of nextLanes.entries()) {
      if (lane !== currentLane && oid === commit.oid) {
        nextLanes[lane] = undefined;
      }
    }

    if (loadedParents.length === 0) {
      nextLanes[currentLane] = undefined;
    } else {
      nextLanes[currentLane] = loadedParents[0];

      for (const parent of loadedParents.slice(1)) {
        const parentLane = nextLanes.indexOf(parent);
        if (parentLane === -1) {
          nextLanes.splice(currentLane + mergeParentLanes.length + 1, 0, parent);
          mergeParentLanes.push(currentLane + mergeParentLanes.length + 1);
        } else {
          mergeParentLanes.push(parentLane);
        }
      }
    }

    const rowLaneCount = Math.max(activeLanes.length, nextLanes.length);
    const duplicateCurrentLanes = lanesAbove
      .map((oid, lane) => (oid === commit.oid ? lane : -1))
      .filter((lane) => lane !== -1);
    const connectorLanes = Array.from(new Set([currentLane, ...duplicateCurrentLanes, ...mergeParentLanes])).sort(
      (left, right) => left - right
    );
    const lanes = Array.from({ length: rowLaneCount }, (_, lane): CommitGraphLane => {
      const oidAbove = lanesAbove[lane];
      const oidBelow = nextLanes[lane];
      const current = lane === currentLane;

      return {
        active: current || oidBelow !== undefined,
        colorIndex: lane,
        continuesAbove: oidAbove !== undefined,
        continuesBelow: oidBelow !== undefined,
        current,
        lane
      };
    });

    activeLanes.splice(0, activeLanes.length, ...nextLanes.filter((oid) => oid !== undefined));

    return {
      commit,
      connectorLanes,
      currentLane,
      isMerge: commit.parents.length > 1,
      laneCount: rowLaneCount,
      lanes,
      mergeParentLanes
    };
  });
}

export function classifyCommitRef(ref: string): "head" | "tag" | "remote" | "local" {
  if (ref === "HEAD" || ref.startsWith("HEAD ->")) {
    return "head";
  }

  if (ref.startsWith("tag: ") || ref.startsWith("refs/tags/")) {
    return "tag";
  }

  if (
    ref.startsWith("origin/") ||
    ref.startsWith("upstream/") ||
    ref.startsWith("remotes/") ||
    ref.startsWith("refs/remotes/") ||
    isLikelyShortRemoteRef(ref)
  ) {
    return "remote";
  }

  return "local";
}

function isLikelyShortRemoteRef(ref: string): boolean {
  const [firstSegment, secondSegment] = ref.split("/");
  return secondSegment !== undefined && !localBranchPrefixes.has(firstSegment);
}

function parseFilterTokens(filter: string): FilterToken[] {
  return splitFilterTokens(filter).map((token) => {
    const colonIndex = token.indexOf(":");
    if (colonIndex === -1) {
      return { scope: null, value: normalize(token) };
    }

    const scope = normalize(token.slice(0, colonIndex));
    if (!scopedFilters.has(scope)) {
      return { scope: null, value: normalize(token) };
    }

    return { scope, value: normalize(token.slice(colonIndex + 1)) };
  });
}

function splitFilterTokens(filter: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;

  for (const character of filter.trim()) {
    if (character === "\"") {
      quoted = !quoted;
    } else if (/\s/.test(character) && !quoted) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function isCommitTokenMatch(commit: CommitSummary, token: FilterToken): boolean {
  if (token.value.length === 0) {
    return true;
  }

  if (token.scope === "author") {
    return textIncludes([commit.authorName, commit.authorEmail], token.value);
  }

  if (token.scope === "ref") {
    return textIncludes(commit.refs, token.value);
  }

  if (token.scope === "branch") {
    return textIncludes(commit.refs.flatMap(branchSearchValues), token.value);
  }

  if (token.scope === "hash" || token.scope === "oid") {
    return textIncludes([commit.oid, commit.shortOid], token.value);
  }

  if (token.scope === "subject") {
    return textIncludes([commit.subject], token.value);
  }

  if (token.scope === "merge") {
    return isMergeTokenMatch(commit, token.value);
  }

  return textIncludes(
    [commit.subject, commit.authorName, commit.authorEmail, commit.oid, commit.shortOid, ...commit.refs],
    token.value
  );
}

function isMergeTokenMatch(commit: CommitSummary, value: string): boolean {
  if (truthyMergeValues.has(value)) {
    return commit.parents.length > 1;
  }

  if (falseyMergeValues.has(value)) {
    return commit.parents.length <= 1;
  }

  return false;
}

function branchSearchValues(ref: string): string[] {
  if (ref.startsWith("HEAD ->")) {
    return [ref.slice("HEAD ->".length).trim()];
  }

  const refKind = classifyCommitRef(ref);
  if (refKind === "local" || refKind === "remote") {
    return [ref.replace(/^refs\/heads\//, "").replace(/^refs\/remotes\//, "").replace(/^remotes\//, "")];
  }

  return [];
}

function textIncludes(values: string[], query: string): boolean {
  return values.some((value) => normalize(value).includes(query));
}

function normalize(value: string): string {
  return value.toLocaleLowerCase();
}
