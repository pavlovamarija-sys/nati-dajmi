// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { MAX_AUTHORITATIVE_TOY_IMAGE_BYTES, isExpectedAuthoritativeToyImagePath, validateAuthoritativeToyImage } from './authoritative-toy-image.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('accepts a valid JPEG payload', () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const result = validateAuthoritativeToyImage('image/jpeg', bytes);

  assertEqual(result?.mimeType, 'image/jpeg');
  assertEqual(result?.bytes, bytes);
});

Deno.test('rejects empty, invalid MIME, non-JPEG, and oversized payloads', () => {
  assertEqual(validateAuthoritativeToyImage('image/jpeg', new Uint8Array()), null);
  assertEqual(
    validateAuthoritativeToyImage('image/png', new Uint8Array([0xff, 0xd8, 0xff])),
    null,
  );
  assertEqual(
    validateAuthoritativeToyImage('image/jpeg', new Uint8Array([0x89, 0x50, 0x4e])),
    null,
  );
  assertEqual(
    validateAuthoritativeToyImage(
      'image/jpeg',
      new Uint8Array(MAX_AUTHORITATIVE_TOY_IMAGE_BYTES + 1),
    ),
    null,
  );
});

Deno.test('accepts only the expected authoritative crop path', () => {
  assertEqual(isExpectedAuthoritativeToyImagePath(
    'user-1/analysis-1/item-1.jpg',
    'user-1',
    'analysis-1',
    'item-1',
  ), true);

  for (const path of [
    'other-user/analysis-1/item-1.jpg',
    'user-1/analysis-1/other-item.jpg',
    'user-1/analysis-1/../item-1.jpg',
    'user-1\\analysis-1\\item-1.jpg',
    'user-1/analysis-1/item-1.png',
  ]) {
    assertEqual(isExpectedAuthoritativeToyImagePath(
      path,
      'user-1',
      'analysis-1',
      'item-1',
    ), false);
  }
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
