import { expandAndClampNormalizedRegion } from '../src/features/toy-analysis/domain/crop-region';

declare const Deno: {
  test(name: string, test: () => void): void;
};

Deno.test('adds final margin around a long protruding component', () => {
  const result = expandAndClampNormalizedRegion(
    { x: 0.2, y: 0.1, width: 0.6, height: 0.2 },
    0.11,
  );

  assertClose(result.x, 0.134);
  assertClose(result.y, 0.078);
  assertClose(result.width, 0.732);
  assertClose(result.height, 0.244);
});

Deno.test('clamps a toy near the image edge without negative coordinates', () => {
  const result = expandAndClampNormalizedRegion(
    { x: 0, y: 0.9, width: 0.15, height: 0.1 },
    0.11,
  );

  assertClose(result.x, 0);
  assertClose(result.y, 0.889);
  assertClose(result.width, 0.1665);
  assertClose(result.height, 0.111);
  if (result.x < 0 || result.y < 0 || result.x + result.width > 1 || result.y + result.height > 1) {
    throw new Error('Expanded crop escaped image bounds.');
  }
});

Deno.test('keeps simple single-toy expansion sensible', () => {
  const result = expandAndClampNormalizedRegion(
    { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    0.11,
  );

  assertClose(result.x, 0.195);
  assertClose(result.y, 0.195);
  assertClose(result.width, 0.61);
  assertClose(result.height, 0.61);
});

function assertClose(actual: number, expected: number): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`Expected ${expected}, received ${actual}.`);
  }
}
