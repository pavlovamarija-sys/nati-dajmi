// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { canStartAuthoritativeToyValuation, parseAuthoritativeToy } from './authoritative-toy.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('parses and normalizes an authoritative toy row', () => {
  assertJsonEqual(parseAuthoritativeToy({
    id: '  item-1  ',
    analysis_id: '  analysis-1  ',
    name: '  Wooden blocks  ',
    category: '  Building toy  ',
    image_path: '  user/analysis/item-1.jpg  ',
    crop_expected: true,
  }), {
    toyAnalysisItemId: 'item-1',
    analysisId: 'analysis-1',
    name: 'Wooden blocks',
    category: 'Building toy',
    imagePath: 'user/analysis/item-1.jpg',
    cropExpected: true,
  });
});

Deno.test('allows null category and image path', () => {
  assertEqual(parseAuthoritativeToy({
    id: 'item-1',
    analysis_id: 'analysis-1',
    name: 'Toy figure',
    category: null,
    image_path: null,
    crop_expected: false,
  }) !== null, true);
});

Deno.test('rejects malformed authoritative toy rows', () => {
  const validRow = {
    id: 'item-1',
    analysis_id: 'analysis-1',
    name: 'Toy figure',
    category: null,
    image_path: null,
    crop_expected: false,
  };

  assertEqual(parseAuthoritativeToy({ ...validRow, id: '   ' }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, analysis_id: '' }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, name: '' }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, category: 4 }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, image_path: '  ' }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, crop_expected: null }), null);
  assertEqual(parseAuthoritativeToy({ ...validRow, unexpected: true }), null);
});

Deno.test('enforces expected crop readiness before valuation', () => {
  const base = {
    toyAnalysisItemId: 'item-1',
    analysisId: 'analysis-1',
    name: 'Toy',
    category: null,
  };
  assertEqual(canStartAuthoritativeToyValuation({
    ...base,
    cropExpected: true,
    imagePath: null,
  }), false);
  assertEqual(canStartAuthoritativeToyValuation({
    ...base,
    cropExpected: true,
    imagePath: 'user/analysis/item-1.jpg',
  }), true);
  assertEqual(canStartAuthoritativeToyValuation({
    ...base,
    cropExpected: false,
    imagePath: null,
  }), true);
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertJsonEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
