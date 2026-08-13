// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { expectedCropImagePath, isValidCropRegistrationPath } from './crop-registration.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

const userId = '11111111-1111-4111-8111-111111111111';
const analysisId = '22222222-2222-4222-8222-222222222222';
const toyItemId = '33333333-3333-4333-8333-333333333333';

Deno.test('builds the owner/analysis/item crop path', () => {
  assertEqual(
    expectedCropImagePath(userId, analysisId, toyItemId),
    `${userId}/${analysisId}/${toyItemId}.jpg`,
  );
});

Deno.test('accepts only the exact authenticated owner crop path', () => {
  assertEqual(isValidCropRegistrationPath(userId, validInput()), true);
});

Deno.test('rejects a cross-user crop path', () => {
  assertEqual(
    isValidCropRegistrationPath(userId, {
      ...validInput(),
      imagePath: `other-user/${analysisId}/${toyItemId}.jpg`,
    }),
    false,
  );
});

Deno.test('rejects wrong analysis and item IDs or traversal', () => {
  assertEqual(
    isValidCropRegistrationPath(userId, {
      ...validInput(),
      analysisId: 'different-analysis',
    }),
    false,
  );
  assertEqual(
    isValidCropRegistrationPath(userId, {
      ...validInput(),
      toyItemId: 'different-item',
    }),
    false,
  );
  assertEqual(
    isValidCropRegistrationPath(userId, {
      ...validInput(),
      imagePath: `${userId}/${analysisId}/../${toyItemId}.jpg`,
    }),
    false,
  );
});

function validInput() {
  return {
    analysisId,
    toyItemId,
    imagePath: expectedCropImagePath(userId, analysisId, toyItemId),
  };
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
