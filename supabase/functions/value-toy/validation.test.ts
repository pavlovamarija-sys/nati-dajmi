// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateValueToyRequest } from './validation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('accepts and normalizes an item-ID-only request', () => {
  assertJsonEqual(validateValueToyRequest({
    toyAnalysisItemId: '  item-1  ',
  }), {
    ok: true,
    value: { toyAnalysisItemId: 'item-1' },
  });
});

Deno.test('rejects malformed requests and blank item IDs', () => {
  assertEqual(validateValueToyRequest(null).ok, false);
  assertEqual(validateValueToyRequest([]).ok, false);
  assertEqual(validateValueToyRequest('request').ok, false);
  assertEqual(validateValueToyRequest({ toyAnalysisItemId: '   ' }).ok, false);
});

Deno.test('rejects legacy client-supplied valuation fields', () => {
  for (const legacyField of ['name', 'category', 'imagePath']) {
    assertEqual(validateValueToyRequest({
      toyAnalysisItemId: 'item-1',
      [legacyField]: legacyField === 'category' ? null : 'client-value',
    }).ok, false);
  }
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
