export type NormalizedCandidateRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function unionCandidateRegions(
  regions: readonly NormalizedCandidateRegion[],
): NormalizedCandidateRegion {
  if (regions.length === 0) {
    throw new Error('At least one candidate region is required.');
  }

  const left = Math.min(...regions.map((region) => region.x));
  const top = Math.min(...regions.map((region) => region.y));
  const right = Math.max(...regions.map((region) => region.x + region.width));
  const bottom = Math.max(...regions.map((region) => region.y + region.height));

  return {
    x: Math.max(0, left),
    y: Math.max(0, top),
    width: Math.min(1, right) - Math.max(0, left),
    height: Math.min(1, bottom) - Math.max(0, top),
  };
}
