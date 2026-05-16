import { describe, expect, test } from "vitest";

import { commitGraphConnectorWidth, commitGraphLaneOffset, commitGraphRailWidth } from "./commit-graph-visuals";

describe("commit graph visuals", () => {
  test("keeps a readable rail width even for linear history", () => {
    expect(commitGraphRailWidth(1)).toBe(44);
    expect(commitGraphRailWidth(3)).toBe(66);
  });

  test("centers lanes inside the wider rail rhythm", () => {
    expect(commitGraphLaneOffset(0)).toBe("22px");
    expect(commitGraphLaneOffset(2)).toBe("66px");
  });

  test("sizes horizontal connectors across visible lanes", () => {
    expect(commitGraphConnectorWidth(0, 2)).toBe("44px");
  });
});
