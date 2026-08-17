import type { ToyBoundingBox } from '@/features/toy-analysis/types/toy-analysis';

export function expandAndClampNormalizedRegion(
  region: ToyBoundingBox,
  paddingRatio: number,
): ToyBoundingBox {
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0) {
    throw new Error('Crop padding ratio must be a nonnegative finite number.');
  }

  const horizontalPadding = region.width * paddingRatio;
  const verticalPadding = region.height * paddingRatio;
  const left = Math.max(0, region.x - horizontalPadding);
  const top = Math.max(0, region.y - verticalPadding);
  const right = Math.min(1, region.x + region.width + horizontalPadding);
  const bottom = Math.min(1, region.y + region.height + verticalPadding);

  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}
