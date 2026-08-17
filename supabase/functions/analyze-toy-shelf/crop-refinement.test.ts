// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { applySourceBoundaryEdges, buildCropRefinementRequestCandidates, CROP_REFINEMENT_INSTRUCTIONS, cropRefinementSchema, finalizeCropRefinementRegion, isCropCompleteness, isPrimarySourceBoundarySuspicious, selectCropRefinementCandidateIds, shouldEscalateCropRefinement, trustedPrimarySourceBoundaryEdges, validateCropRefinementOutput } from './crop-refinement.ts';

declare const Deno: {
  test(name: string, test: () => void): void;
};

const ids = ['truck'];

Deno.test('validates a refinement result for the exact accepted candidate', () => {
  const result = validateCropRefinementOutput({
    candidates: [{
      candidateId: 'truck',
      refinedBoundingBox: { x: 0.1, y: 0.05, width: 0.8, height: 0.8 },
      sourceBoundaryEdges: [],
    }],
  }, ids);
  if (!result || result[0].refinedBoundingBox.y !== 0.05) {
    throw new Error('Expected valid refinement output.');
  }
});

Deno.test('rejects unknown IDs, invalid boxes, and extra fields', () => {
  const unknown = validateCropRefinementOutput({
    candidates: [{ candidateId: 'other', refinedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, sourceBoundaryEdges: [] }],
  }, ids);
  const invalidBox = validateCropRefinementOutput({
    candidates: [{ candidateId: 'truck', refinedBoundingBox: { x: 0.5, y: 0, width: 0.6, height: 0.5 }, sourceBoundaryEdges: [] }],
  }, ids);
  const extra = validateCropRefinementOutput({
    candidates: [{ candidateId: 'truck', refinedBoundingBox: { x: 0, y: 0, width: 1, height: 1 }, sourceBoundaryEdges: [], reason: 'no' }],
  }, ids);
  if (unknown || invalidBox || extra) {
    throw new Error('Expected malformed refinement output to be rejected.');
  }
});

Deno.test('builds a strict exact-candidate schema', () => {
  const schema = cropRefinementSchema(['truck', 'remote']);
  if (JSON.stringify(schema).includes('name') || JSON.stringify(schema).includes('recommendation')) {
    throw new Error('Refinement schema must contain geometry only.');
  }
});

Deno.test('accepts only the controlled crop-completeness values', () => {
  if (!isCropCompleteness('COMPLETE') || !isCropCompleteness('LIKELY_CLIPPED') ||
      isCropCompleteness('MAYBE_CLIPPED')) {
    throw new Error('Unexpected crop-completeness value handling.');
  }
});

Deno.test('refinement instructions are geometry-only and evidence-based', () => {
  for (const phrase of [
    'positive visual evidence',
    'CURRENT PROVIDED REGION',
    'COMPLETE VISIBLE SELLABLE ITEM',
    'ORIGINAL SOURCE IMAGE',
    'Do not re-identify it',
    'do not enlarge it unnecessarily',
    'protruding structural parts',
    'explicitly associated accessories',
    'unrelated nearby toys',
    'sourceBoundaryEdges',
    'geometry-only',
  ]) {
    if (!CROP_REFINEMENT_INSTRUCTIONS.includes(phrase)) {
      throw new Error(`Missing refinement instruction: ${phrase}`);
    }
  }
});

Deno.test('schedules every accepted toy regardless of candidate-crop completeness', () => {
  const scheduled = selectCropRefinementCandidateIds([
    { candidateId: 'complete-truck', isToy: true, cropCompleteness: 'COMPLETE' },
    { candidateId: 'clipped-crane', isToy: true, cropCompleteness: 'LIKELY_CLIPPED' },
    { candidateId: 'associated-controller', isToy: false, cropCompleteness: null },
  ]);
  assertEqual(scheduled, ['complete-truck', 'clipped-crane']);
});

Deno.test('escalates primary failure for both completeness states', () => {
  for (const cropCompleteness of ['COMPLETE', 'LIKELY_CLIPPED'] as const) {
    const result = shouldEscalateCropRefinement({
      cropCompleteness,
      originalRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
      primaryRefinedRegion: null,
      primarySourceBoundaryEdges: [],
      primarySucceeded: false,
    });
    if (!result.shouldEscalate || result.reason !== 'PRIMARY_FAILURE') {
      throw new Error('Expected primary failure escalation.');
    }
  }
});

Deno.test('escalates clipped candidates when mini is unchanged within tolerance', () => {
  const result = shouldEscalateCropRefinement({
    cropCompleteness: 'LIKELY_CLIPPED',
    originalRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primaryRefinedRegion: { x: 0.2001, y: 0.2, width: 0.4999, height: 0.5 },
    primarySourceBoundaryEdges: [],
    primarySucceeded: true,
  });
  if (!result.shouldEscalate || result.reason !== 'LIKELY_CLIPPED_NO_MEANINGFUL_EXPANSION') {
    throw new Error('Expected ineffective clipped refinement escalation.');
  }
});

Deno.test('does not escalate clipped candidates after meaningful expansion or edge evidence', () => {
  const expanded = shouldEscalateCropRefinement({
    cropCompleteness: 'LIKELY_CLIPPED',
    originalRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primaryRefinedRegion: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    primarySourceBoundaryEdges: [],
    primarySucceeded: true,
  });
  const edge = shouldEscalateCropRefinement({
    cropCompleteness: 'LIKELY_CLIPPED',
    originalRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primaryRefinedRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primarySourceBoundaryEdges: ['LEFT'],
    primarySucceeded: true,
  });
  if (expanded.shouldEscalate || edge.shouldEscalate) {
    throw new Error('Expected useful primary refinement to avoid escalation.');
  }
});

Deno.test('does not escalate unchanged complete candidates', () => {
  const result = shouldEscalateCropRefinement({
    cropCompleteness: 'COMPLETE',
    originalRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primaryRefinedRegion: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
    primarySourceBoundaryEdges: [],
    primarySucceeded: true,
  });
  if (result.shouldEscalate) {
    throw new Error('Complete unchanged candidates should not escalate.');
  }
});

Deno.test('escalates all-four primary edges for a region smaller than the source image', () => {
  const original = { x: 0.135, y: 0.351, width: 0.726, height: 0.4105 };
  const result = shouldEscalateCropRefinement({
    cropCompleteness: 'COMPLETE',
    originalRegion: original,
    primaryRefinedRegion: original,
    primarySourceBoundaryEdges: ['LEFT', 'TOP', 'RIGHT', 'BOTTOM'],
    primarySucceeded: true,
  });
  if (!result.shouldEscalate || result.reason !== 'SUSPICIOUS_PRIMARY_SOURCE_BOUNDARY') {
    throw new Error('Expected suspicious all-four source boundaries to escalate.');
  }
});

Deno.test('does not escalate all-four edges when the region is effectively the full image', () => {
  const result = shouldEscalateCropRefinement({
    cropCompleteness: 'COMPLETE',
    originalRegion: { x: 0.01, y: 0.01, width: 0.98, height: 0.98 },
    primaryRefinedRegion: null,
    primarySourceBoundaryEdges: ['LEFT', 'TOP', 'RIGHT', 'BOTTOM'],
    primarySucceeded: true,
  });
  if (result.shouldEscalate) {
    throw new Error('An already full-image region should not escalate solely for four edges.');
  }
});

Deno.test('allows modest one-edge and two-edge source-boundary evidence', () => {
  const original = { x: 0.05, y: 0.08, width: 0.7, height: 0.65 };
  if (
    isPrimarySourceBoundarySuspicious(original, null, ['LEFT']) ||
    isPrimarySourceBoundarySuspicious(original, null, ['LEFT', 'TOP'])
  ) {
    throw new Error('Expected modest source-boundary expansion to remain trusted.');
  }
});

Deno.test('escalates implausible area expansion even without all four edges', () => {
  const original = { x: 0.2, y: 0.05, width: 0.6, height: 0.9 };
  if (!isPrimarySourceBoundarySuspicious(original, null, ['LEFT', 'RIGHT'])) {
    throw new Error('Expected excessive primary source-boundary expansion to be suspicious.');
  }
});

Deno.test('quarantines suspicious primary edges while preserving primary box geometry', () => {
  const original = { x: 0.17, y: 0.38, width: 0.638, height: 0.372 };
  const refined = { x: 0.135, y: 0.351, width: 0.726, height: 0.4105 };
  const trusted = trustedPrimarySourceBoundaryEdges(
    original,
    refined,
    ['LEFT', 'TOP', 'RIGHT', 'BOTTOM'],
  );
  assertEqual(trusted, []);
  assertRegionClose(finalizeCropRefinementRegion(original, refined, trusted), {
    x: 0.135,
    y: 0.351,
    width: 0.726,
    height: 0.4105,
  });
});

Deno.test('uses fallback edge evidence after suspicious primary edges are quarantined', () => {
  const original = { x: 0.17, y: 0.38, width: 0.638, height: 0.372 };
  const primary = { x: 0.135, y: 0.351, width: 0.726, height: 0.4105 };
  const fallback = { x: 0.08, y: 0.32, width: 0.78, height: 0.46 };
  const afterPrimary = finalizeCropRefinementRegion(
    original,
    primary,
    trustedPrimarySourceBoundaryEdges(original, primary, ['LEFT', 'TOP', 'RIGHT', 'BOTTOM']),
  );
  assertRegionClose(finalizeCropRefinementRegion(afterPrimary, fallback, ['LEFT']), {
    x: 0,
    y: 0.32,
    width: 0.861,
    height: 0.46,
  });
});

Deno.test('keeps multiple accepted toys in one refinement candidate list', () => {
  const scheduled = selectCropRefinementCandidateIds([
    { candidateId: 'toy-1', isToy: true },
    { candidateId: 'toy-2', isToy: true },
    { candidateId: 'suppressed-part', isToy: false },
  ]);
  assertEqual(scheduled, ['toy-1', 'toy-2']);
});

Deno.test('supplies each accepted toy with its current combined region', () => {
  const truckRegion = { x: 0.1, y: 0.2, width: 0.8, height: 0.7 };
  const secondToyRegion = { x: 0.72, y: 0.05, width: 0.2, height: 0.2 };
  const requestCandidates = buildCropRefinementRequestCandidates([
    { candidateId: 'truck', name: 'fire truck with controller' },
    { candidateId: 'toy-2', name: 'toy figure' },
  ], new Map([
    ['truck', truckRegion],
    ['toy-2', secondToyRegion],
  ]));

  assertEqual(requestCandidates, [
    { candidateId: 'truck', name: 'fire truck with controller', currentBoundingBox: truckRegion },
    { candidateId: 'toy-2', name: 'toy figure', currentBoundingBox: secondToyRegion },
  ]);
});

Deno.test('rejects a refinement request when an accepted current region is missing', () => {
  let threw = false;
  try {
    buildCropRefinementRequestCandidates(
      [{ candidateId: 'missing', name: 'toy' }],
      new Map(),
    );
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('Expected a missing current region to be rejected.');
  }
});

Deno.test('accepts controlled source boundaries including empty and multiple edges', () => {
  for (const sourceBoundaryEdges of [[], ['LEFT'], ['RIGHT'], ['TOP'], ['BOTTOM'], ['TOP', 'RIGHT']]) {
    const result = validateCropRefinementOutput({
      candidates: [{
        candidateId: 'truck',
        refinedBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
        sourceBoundaryEdges,
      }],
    }, ids);
    if (!result) {
      throw new Error(`Expected valid source boundaries: ${JSON.stringify(sourceBoundaryEdges)}.`);
    }
  }
});

Deno.test('rejects duplicate, invalid, missing, and malformed source boundaries', () => {
  const candidates = [
    { candidateId: 'truck', refinedBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, sourceBoundaryEdges: ['LEFT', 'LEFT'] },
    { candidateId: 'truck', refinedBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, sourceBoundaryEdges: ['CENTER'] },
    { candidateId: 'truck', refinedBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 } },
    { candidateId: 'truck', refinedBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }, sourceBoundaryEdges: 'LEFT' },
  ];
  for (const candidate of candidates) {
    if (validateCropRefinementOutput({ candidates: [candidate] }, ids)) {
      throw new Error(`Expected invalid source boundaries to be rejected: ${JSON.stringify(candidate)}.`);
    }
  }
});

Deno.test('expands deterministically to each requested source boundary', () => {
  const region = { x: 0.2, y: 0.25, width: 0.5, height: 0.4 };
  assertRegionClose(applySourceBoundaryEdges(region, ['LEFT']), { x: 0, y: 0.25, width: 0.7, height: 0.4 });
  assertRegionClose(applySourceBoundaryEdges(region, ['RIGHT']), { x: 0.2, y: 0.25, width: 0.8, height: 0.4 });
  assertRegionClose(applySourceBoundaryEdges(region, ['TOP']), { x: 0.2, y: 0, width: 0.5, height: 0.65 });
  assertRegionClose(applySourceBoundaryEdges(region, ['BOTTOM']), { x: 0.2, y: 0.25, width: 0.5, height: 0.75 });
  assertRegionClose(applySourceBoundaryEdges(region, ['LEFT', 'TOP', 'RIGHT', 'BOTTOM']), { x: 0, y: 0, width: 1, height: 1 });
});

Deno.test('normal refinement unions without shrinking and does not expand to a source edge', () => {
  const original = { x: 0.2, y: 0.3, width: 0.5, height: 0.4 };
  const refined = { x: 0.15, y: 0.25, width: 0.45, height: 0.35 };
  assertRegionClose(finalizeCropRefinementRegion(original, refined, []), {
    x: 0.15,
    y: 0.25,
    width: 0.55,
    height: 0.45,
  });
});

Deno.test('source-boundary expansion happens after union and remains normalized', () => {
  const original = { x: 0.18, y: 0.42, width: 0.78, height: 0.53 };
  const refined = { x: 0.148, y: 0.393, width: 0.786, height: 0.596 };
  assertRegionClose(finalizeCropRefinementRegion(original, refined, ['LEFT']), {
    x: 0,
    y: 0.393,
    width: 0.96,
    height: 0.596,
  });
});

Deno.test('missing refinement preserves the original fallback region', () => {
  const original = { x: 0.1, y: 0.2, width: 0.6, height: 0.5 };
  assertEqual(finalizeCropRefinementRegion(original, undefined, []), original);
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function assertRegionClose(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (Math.abs(actual[key] - expected[key]) > 1e-12) {
      throw new Error(`Expected ${key}=${expected[key]}, received ${actual[key]}.`);
    }
  }
}
