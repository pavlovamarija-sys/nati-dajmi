// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateValueToyRequest } from './validation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('accepts and normalizes a complete value-toy request', () => {
  const result = validateValueToyRequest({
    toyAnalysisItemId: '  item-1  ',
    name: '  Wooden blocks  ',
    category: '  Building toy  ',
    imagePath: '  user/analysis/item-1.jpg  ',
  });

  assertJsonEqual(result, {
    ok: true,
    value: {
      toyAnalysisItemId: 'item-1',
      name: 'Wooden blocks',
      category: 'Building toy',
      imagePath: 'user/analysis/item-1.jpg',
    },
  });
});

Deno.test('accepts null category and omitted or null imagePath', () => {
  const withoutImage = validateValueToyRequest({
    toyAnalysisItemId: 'item-1',
    name: 'Toy figure',
    category: null,
  });
  const nullImage = validateValueToyRequest({
    toyAnalysisItemId: 'item-1',
    name: 'Toy figure',
    category: null,
    imagePath: null,
  });

  assertEqual(withoutImage.ok, true);
  assertEqual(nullImage.ok, true);
});

Deno.test('rejects malformed top-level values', () => {
  assertEqual(validateValueToyRequest(null).ok, false);
  assertEqual(validateValueToyRequest([]).ok, false);
  assertEqual(validateValueToyRequest('request').ok, false);
});

Deno.test('rejects blank required fields', () => {
  assertEqual(validateValueToyRequest(validRequest({ toyAnalysisItemId: '   ' })).ok, false);
  assertEqual(validateValueToyRequest(validRequest({ name: '\t' })).ok, false);
});

Deno.test('rejects invalid category values', () => {
  assertEqual(validateValueToyRequest(validRequest({ category: undefined })).ok, false);
  assertEqual(validateValueToyRequest(validRequest({ category: 4 })).ok, false);
});

Deno.test('rejects a supplied blank or non-string imagePath', () => {
  assertEqual(validateValueToyRequest(validRequest({ imagePath: '   ' })).ok, false);
  assertEqual(validateValueToyRequest(validRequest({ imagePath: 4 })).ok, false);
});

function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    toyAnalysisItemId: 'item-1',
    name: 'Toy figure',
    category: 'Toy figure',
    ...overrides,
  };
}

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
