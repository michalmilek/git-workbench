export const commitGraphLaneSpacing = 22;
export const commitGraphMinimumRailWidth = 44;

export function commitGraphRailWidth(laneCount: number): number {
  return Math.max(commitGraphMinimumRailWidth, laneCount * commitGraphLaneSpacing);
}

export function commitGraphLaneOffset(laneIndex: number): string {
  return `${laneIndex * commitGraphLaneSpacing + commitGraphLaneSpacing}px`;
}

export function commitGraphConnectorWidth(startLane: number, endLane: number): string {
  return `${(endLane - startLane) * commitGraphLaneSpacing}px`;
}
