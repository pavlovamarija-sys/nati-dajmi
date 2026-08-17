export type CropCompleteness = 'COMPLETE' | 'LIKELY_CLIPPED';
export const CROP_REFINEMENT_EXPANSION_EPSILON = 0.01;
export const CROP_REFINEMENT_FULL_IMAGE_EDGE_TOLERANCE = 0.03;
export const CROP_REFINEMENT_FULL_IMAGE_AREA_THRESHOLD = 0.9;
export const CROP_REFINEMENT_OVER_EXPANSION_RATIO = 1.5;
export type CropRefinementEscalationReason =
  | 'PRIMARY_FAILURE'
  | 'LIKELY_CLIPPED_NO_MEANINGFUL_EXPANSION'
  | 'SUSPICIOUS_PRIMARY_SOURCE_BOUNDARY';

export const CROP_REFINEMENT_INSTRUCTIONS = `
Perform geometry-only refinement for an already-identified sellable toy item.
The sellable toy or toy set has already been identified. Do not re-identify it.
Compare the CURRENT PROVIDED REGION with the COMPLETE VISIBLE SELLABLE ITEM OR SET in
the ORIGINAL SOURCE IMAGE. The complete item includes its main body, attached
components, protruding structural parts, explicitly associated accessories, and a
visible board, container, base, or structure that clearly belongs to an identified
multi-component set. Expand the current region only when there is positive visual
evidence that a meaningful part lies outside it, such as a ladder, basket, boom,
wing, rotor, tail, handle, arm, bucket, or associated controller. If the current
region is already sufficient, return geometry equivalent to it and do not enlarge
it unnecessarily. Do not expand merely because the toy is near an edge.
Use refinedBoundingBox for ordinary clipping by the current detector region when
more of the item remains visible elsewhere inside the original image.
sourceBoundaryEdges has a narrower meaning: include an edge only when the complete
sellable item reaches or is truncated by that edge of the ORIGINAL SOURCE IMAGE.
Do not report a source boundary merely because the item is close to the current
detector/refinement box or because its framing is aesthetically tight. The array
may be empty and may contain multiple source-image edges.
Do not identify toys, change names, recommendations, play ideas, condition, or
accessory relationships. Return a rectangle containing the complete identified
sellable toy or set and its already-associated components/accessories. Do not include
unrelated nearby toys or objects merely because they are close to the target.
`.trim();

export const SOURCE_BOUNDARY_EDGES = ['LEFT', 'TOP', 'RIGHT', 'BOTTOM'] as const;
export type SourceBoundaryEdge = typeof SOURCE_BOUNDARY_EDGES[number];

export type CropRefinementCandidate = {
  candidateId: string;
  refinedBoundingBox: NormalizedRefinementBox;
  sourceBoundaryEdges: SourceBoundaryEdge[];
};

export type NormalizedRefinementBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isCropCompleteness(value: unknown): value is CropCompleteness {
  return value === 'COMPLETE' || value === 'LIKELY_CLIPPED';
}

export function selectCropRefinementCandidateIds(
  candidates: readonly { candidateId: string; isToy: boolean; cropCompleteness?: unknown }[],
): string[] {
  return candidates
    .filter((candidate) => candidate.isToy)
    .map((candidate) => candidate.candidateId);
}

export function shouldEscalateCropRefinement(input: {
  cropCompleteness: CropCompleteness;
  originalRegion: NormalizedRefinementBox;
  primaryRefinedRegion: NormalizedRefinementBox | null;
  primarySourceBoundaryEdges: readonly SourceBoundaryEdge[];
  primarySucceeded: boolean;
}): { shouldEscalate: boolean; reason: CropRefinementEscalationReason | null } {
  if (!input.primarySucceeded) {
    return { shouldEscalate: true, reason: 'PRIMARY_FAILURE' };
  }
  if (isPrimarySourceBoundarySuspicious(
    input.originalRegion,
    input.primaryRefinedRegion,
    input.primarySourceBoundaryEdges,
  )) {
    return { shouldEscalate: true, reason: 'SUSPICIOUS_PRIMARY_SOURCE_BOUNDARY' };
  }
  if (input.cropCompleteness !== 'LIKELY_CLIPPED' || input.primarySourceBoundaryEdges.length > 0) {
    return { shouldEscalate: false, reason: null };
  }
  const primary = input.primaryRefinedRegion ?? input.originalRegion;
  const originalEdges = getRegionEdges(input.originalRegion);
  const primaryEdges = getRegionEdges(primary);
  const meaningful = primaryEdges.some((edge, index) =>
    Math.abs(edge - originalEdges[index]) > CROP_REFINEMENT_EXPANSION_EPSILON,
  );
  return meaningful
    ? { shouldEscalate: false, reason: null }
    : { shouldEscalate: true, reason: 'LIKELY_CLIPPED_NO_MEANINGFUL_EXPANSION' };
}

export function isPrimarySourceBoundarySuspicious(
  originalRegion: NormalizedRefinementBox,
  primaryRefinedRegion: NormalizedRefinementBox | null,
  primarySourceBoundaryEdges: readonly SourceBoundaryEdge[],
): boolean {
  if (primarySourceBoundaryEdges.length === 0) {
    return false;
  }

  const preBoundaryRegion = finalizeCropRefinementRegion(
    originalRegion,
    primaryRefinedRegion ?? undefined,
    [],
  );
  const postBoundaryRegion = applySourceBoundaryEdges(
    preBoundaryRegion,
    primarySourceBoundaryEdges,
  );
  const preArea = regionArea(preBoundaryRegion);
  const postArea = regionArea(postBoundaryRegion);
  const allFourEdges = SOURCE_BOUNDARY_EDGES.every((edge) =>
    primarySourceBoundaryEdges.includes(edge),
  );

  if (allFourEdges && !isEffectivelyFullImage(preBoundaryRegion)) {
    return true;
  }

  return postArea >= CROP_REFINEMENT_FULL_IMAGE_AREA_THRESHOLD &&
    postArea / preArea >= CROP_REFINEMENT_OVER_EXPANSION_RATIO;
}

export function trustedPrimarySourceBoundaryEdges(
  originalRegion: NormalizedRefinementBox,
  primaryRefinedRegion: NormalizedRefinementBox | null,
  primarySourceBoundaryEdges: readonly SourceBoundaryEdge[],
): SourceBoundaryEdge[] {
  return isPrimarySourceBoundarySuspicious(
    originalRegion,
    primaryRefinedRegion,
    primarySourceBoundaryEdges,
  ) ? [] : [...primarySourceBoundaryEdges];
}

export function buildCropRefinementRequestCandidates(
  candidates: readonly { candidateId: string; name: string | null }[],
  currentRegions: ReadonlyMap<string, NormalizedRefinementBox>,
): Array<{ candidateId: string; name: string | null; currentBoundingBox: NormalizedRefinementBox }> {
  return candidates.map((candidate) => {
    const currentBoundingBox = currentRegions.get(candidate.candidateId);
    if (!currentBoundingBox) {
      throw new Error('Current crop-refinement region is unavailable.');
    }
    return {
      candidateId: candidate.candidateId,
      name: candidate.name,
      currentBoundingBox,
    };
  });
}

const CROP_REFINEMENT_KEYS = ['candidateId', 'refinedBoundingBox', 'sourceBoundaryEdges'] as const;
const BOX_KEYS = ['x', 'y', 'width', 'height'] as const;

export function cropRefinementSchema(candidateIds: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      candidates: {
        type: 'array',
        minItems: candidateIds.length,
        maxItems: candidateIds.length,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            candidateId: { type: 'string', enum: [...candidateIds] },
            refinedBoundingBox: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { type: 'number', minimum: 0, maximum: 1 },
                y: { type: 'number', minimum: 0, maximum: 1 },
                width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
                height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
              },
              required: [...BOX_KEYS],
            },
            sourceBoundaryEdges: {
              type: 'array',
              items: { type: 'string', enum: [...SOURCE_BOUNDARY_EDGES] },
              maxItems: SOURCE_BOUNDARY_EDGES.length,
            },
          },
          required: [...CROP_REFINEMENT_KEYS],
        },
      },
    },
    required: ['candidates'],
  };
}

export function validateCropRefinementOutput(
  value: unknown,
  expectedCandidateIds: readonly string[],
): CropRefinementCandidate[] | null {
  if (!isRecord(value) || !Array.isArray(value.candidates) ||
      value.candidates.length !== expectedCandidateIds.length) {
    return null;
  }

  const expected = new Set(expectedCandidateIds);
  const seen = new Set<string>();
  const result: CropRefinementCandidate[] = [];
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !hasExactKeys(candidate, CROP_REFINEMENT_KEYS) ||
        typeof candidate.candidateId !== 'string' ||
        !expected.has(candidate.candidateId) || seen.has(candidate.candidateId)) {
      return null;
    }
    const box = candidate.refinedBoundingBox;
    if (!isRecord(box) || !hasExactKeys(box, BOX_KEYS) ||
        !isValidNormalizedBox(box)) {
      return null;
    }
    const edges = candidate.sourceBoundaryEdges;
    if (!Array.isArray(edges) || !areValidSourceBoundaryEdges(edges)) {
      return null;
    }
    seen.add(candidate.candidateId);
    result.push({
      candidateId: candidate.candidateId,
      refinedBoundingBox: box,
      sourceBoundaryEdges: edges,
    });
  }

  return seen.size === expected.size ? result : null;
}

export function applySourceBoundaryEdges(
  region: NormalizedRefinementBox,
  edges: readonly SourceBoundaryEdge[],
): NormalizedRefinementBox {
  const edgeSet = new Set(edges);
  const left = edgeSet.has('LEFT') ? 0 : region.x;
  const top = edgeSet.has('TOP') ? 0 : region.y;
  const right = edgeSet.has('RIGHT') ? 1 : Math.min(1, region.x + region.width);
  const bottom = edgeSet.has('BOTTOM') ? 1 : Math.min(1, region.y + region.height);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function finalizeCropRefinementRegion(
  originalRegion: NormalizedRefinementBox,
  refinedRegion: NormalizedRefinementBox | undefined,
  sourceBoundaryEdges: readonly SourceBoundaryEdge[],
): NormalizedRefinementBox {
  const unionRegion = refinedRegion
    ? unionCandidateRegions([originalRegion, refinedRegion])
    : originalRegion;
  return applySourceBoundaryEdges(unionRegion, sourceBoundaryEdges);
}

function areValidSourceBoundaryEdges(value: unknown[]): value is SourceBoundaryEdge[] {
  const edges = new Set<SourceBoundaryEdge>();
  for (const edge of value) {
    if (typeof edge !== 'string' ||
        !SOURCE_BOUNDARY_EDGES.includes(edge as SourceBoundaryEdge) ||
        edges.has(edge as SourceBoundaryEdge)) {
      return false;
    }
    edges.add(edge as SourceBoundaryEdge);
  }
  return true;
}

function getRegionEdges(region: NormalizedRefinementBox): [number, number, number, number] {
  return [region.x, region.y, region.x + region.width, region.y + region.height];
}

function isEffectivelyFullImage(region: NormalizedRefinementBox): boolean {
  const [left, top, right, bottom] = getRegionEdges(region);
  return regionArea(region) >= CROP_REFINEMENT_FULL_IMAGE_AREA_THRESHOLD &&
    left <= CROP_REFINEMENT_FULL_IMAGE_EDGE_TOLERANCE &&
    top <= CROP_REFINEMENT_FULL_IMAGE_EDGE_TOLERANCE &&
    right >= 1 - CROP_REFINEMENT_FULL_IMAGE_EDGE_TOLERANCE &&
    bottom >= 1 - CROP_REFINEMENT_FULL_IMAGE_EDGE_TOLERANCE;
}

function regionArea(region: NormalizedRefinementBox): number {
  return region.width * region.height;
}

function isValidNormalizedBox(value: Record<string, unknown>): value is NormalizedRefinementBox {
  const { x, y, width, height } = value;
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1 &&
    typeof y === 'number' && Number.isFinite(y) && y >= 0 && y <= 1 &&
    typeof width === 'number' && Number.isFinite(width) && width > 0 && width <= 1 &&
    typeof height === 'number' && Number.isFinite(height) && height > 0 && height <= 1 &&
    x + width <= 1 && y + height <= 1;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...keys].sort());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { unionCandidateRegions } from './candidate-region.ts';
