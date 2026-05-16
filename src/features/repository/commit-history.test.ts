import { describe, expect, test } from "vitest";

import { buildCommitGraphRows, classifyCommitRef, filterCommitHistory } from "./commit-history";
import type { CommitSummary } from "./repository-types";

function commit(input: Partial<CommitSummary> & Pick<CommitSummary, "oid" | "parents" | "subject">): CommitSummary {
  const shortOid = input.shortOid ?? input.oid.slice(0, 7);

  return {
    authorEmail: input.authorEmail ?? "ada@example.test",
    authorName: input.authorName ?? "Ada Lovelace",
    authoredAt: input.authoredAt ?? "2026-05-16T08:30:00+02:00",
    oid: input.oid,
    parents: input.parents,
    refs: input.refs ?? [],
    shortOid,
    subject: input.subject
  };
}

const commits: CommitSummary[] = [
  commit({
    authorEmail: "alex@example.test",
    authorName: "Alex Rivera",
    oid: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    parents: ["6f5e4d3c2b1a0987654321fedcba9876543210ab"],
    refs: ["HEAD -> main", "tag: v1.0"],
    subject: "Add repository history view"
  }),
  commit({
    authorEmail: "sam@example.test",
    authorName: "Sam Chen",
    oid: "6f5e4d3c2b1a0987654321fedcba9876543210ab",
    parents: ["1111111111111111111111111111111111111111"],
    refs: ["origin/main"],
    subject: "Wire repository status panel"
  }),
  commit({
    authorEmail: "mira@example.test",
    authorName: "Mira Patel",
    oid: "1111111111111111111111111111111111111111",
    parents: [],
    refs: ["feature/history-filters"],
    subject: "Polish filter chips"
  })
];

describe("filterCommitHistory", () => {
  test("returns the same commit list for an empty filter", () => {
    expect(filterCommitHistory(commits, "  \t ")).toBe(commits);
  });

  test("matches plain tokens across commit text with AND semantics", () => {
    expect(filterCommitHistory(commits, "repository alex").map((item) => item.oid)).toEqual([commits[0].oid]);
    expect(filterCommitHistory(commits, "repository mira")).toEqual([]);
  });

  test("keeps quoted terms together", () => {
    expect(filterCommitHistory(commits, "\"repository status\"").map((item) => item.oid)).toEqual([commits[1].oid]);
    expect(filterCommitHistory(commits, "\"status repository\"")).toEqual([]);
  });

  test("matches scoped author, ref, branch, hash, oid, and subject tokens", () => {
    expect(filterCommitHistory(commits, "author:sam").map((item) => item.oid)).toEqual([commits[1].oid]);
    expect(filterCommitHistory(commits, "ref:v1.0").map((item) => item.oid)).toEqual([commits[0].oid]);
    expect(filterCommitHistory(commits, "branch:history-filters").map((item) => item.oid)).toEqual([commits[2].oid]);
    expect(filterCommitHistory(commits, "hash:a1b2c3d").map((item) => item.oid)).toEqual([commits[0].oid]);
    expect(filterCommitHistory(commits, `oid:${commits[1].oid}`).map((item) => item.oid)).toEqual([commits[1].oid]);
    expect(filterCommitHistory(commits, "subject:chips").map((item) => item.oid)).toEqual([commits[2].oid]);
  });

  test("matches merge scoped tokens", () => {
    const mergeCommit = commit({
      oid: "2222222222222222222222222222222222222222",
      parents: [commits[0].oid, commits[1].oid],
      subject: "Merge feature branch"
    });
    const history = [mergeCommit, ...commits];

    expect(filterCommitHistory(history, "merge:true").map((item) => item.oid)).toEqual([mergeCommit.oid]);
    expect(filterCommitHistory(history, "merge:no").map((item) => item.oid)).toEqual(commits.map((item) => item.oid));
  });
});

describe("classifyCommitRef", () => {
  test("classifies common git decoration refs", () => {
    expect(classifyCommitRef("HEAD")).toBe("head");
    expect(classifyCommitRef("HEAD -> main")).toBe("head");
    expect(classifyCommitRef("tag: v1.0")).toBe("tag");
    expect(classifyCommitRef("origin/main")).toBe("remote");
    expect(classifyCommitRef("company/main")).toBe("remote");
    expect(classifyCommitRef("feature/history")).toBe("local");
  });
});

describe("buildCommitGraphRows", () => {
  test("builds linear graph rows", () => {
    const rows = buildCommitGraphRows(commits);

    expect(rows.map((row) => row.currentLane)).toEqual([0, 0, 0]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 1, 1]);
    expect(rows.map((row) => row.isMerge)).toEqual([false, false, false]);
    expect(rows[0].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: false, continuesBelow: true, current: true, lane: 0 }
    ]);
    expect(rows[1].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: true, continuesBelow: true, current: true, lane: 0 }
    ]);
    expect(rows[2].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: true, continuesBelow: false, current: true, lane: 0 }
    ]);
  });

  test("keeps side branch lanes active until their shared parent", () => {
    const root = commit({ oid: "0000000000000000000000000000000000000000", parents: [], subject: "Initial commit" });
    const main = commit({ oid: "1111111111111111111111111111111111111111", parents: [root.oid], subject: "Main work" });
    const feature = commit({ oid: "2222222222222222222222222222222222222222", parents: [root.oid], subject: "Feature work" });
    const rows = buildCommitGraphRows([feature, main, root]);

    expect(rows.map((row) => row.currentLane)).toEqual([0, 1, 0]);
    expect(rows.map((row) => row.laneCount)).toEqual([1, 2, 2]);
    expect(rows.map((row) => row.connectorLanes)).toEqual([[0], [1], [0, 1]]);
    expect(rows[1].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: true, continuesBelow: true, current: false, lane: 0 },
      { active: true, colorIndex: 1, continuesAbove: false, continuesBelow: true, current: true, lane: 1 }
    ]);
    expect(rows[2].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: true, continuesBelow: false, current: true, lane: 0 },
      { active: false, colorIndex: 1, continuesAbove: true, continuesBelow: false, current: false, lane: 1 }
    ]);
  });

  test("records merge parent lanes", () => {
    const root = commit({ oid: "0000000000000000000000000000000000000000", parents: [], subject: "Initial commit" });
    const main = commit({ oid: "1111111111111111111111111111111111111111", parents: [root.oid], subject: "Main work" });
    const feature = commit({ oid: "2222222222222222222222222222222222222222", parents: [root.oid], subject: "Feature work" });
    const merge = commit({
      oid: "3333333333333333333333333333333333333333",
      parents: [main.oid, feature.oid],
      subject: "Merge feature"
    });
    const rows = buildCommitGraphRows([merge, main, feature, root]);

    expect(rows[0]).toMatchObject({
      connectorLanes: [0, 1],
      currentLane: 0,
      isMerge: true,
      laneCount: 2,
      mergeParentLanes: [1]
    });
    expect(rows[0].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: false, continuesBelow: true, current: true, lane: 0 },
      { active: true, colorIndex: 1, continuesAbove: false, continuesBelow: true, current: false, lane: 1 }
    ]);
  });

  test("ends lanes for parents outside the loaded history window", () => {
    const rows = buildCommitGraphRows([
      commit({
        oid: "9999999999999999999999999999999999999999",
        parents: ["8888888888888888888888888888888888888888"],
        subject: "Latest loaded commit"
      })
    ]);

    expect(rows[0].lanes).toEqual([
      { active: true, colorIndex: 0, continuesAbove: false, continuesBelow: false, current: true, lane: 0 }
    ]);
    expect(rows[0].connectorLanes).toEqual([0]);
  });
});
