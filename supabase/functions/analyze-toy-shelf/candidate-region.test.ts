// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { unionCandidateRegions } from './candidate-region.ts';

declare const Deno: {
  test(name: string, test: () => void): void;
};

Deno.test('unions the main toy and an associated accessory region', () => {
  const result = unionCandidateRegions([
    { x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
    { x: 0.2, y: 0.6, width: 0.2, height: 0.2 },
  ]);

  assertEqual(result, { x: 0.1, y: 0.1, width: 0.4, height: 0.7 });
});

Deno.test('includes multiple associated regions and clamps image bounds', () => {
  const result = unionCandidateRegions([
    { x: 0.9, y: 0.9, width: 0.2, height: 0.2 },
    { x: 0, y: 0, width: 0.1, height: 0.1 },
  ]);

  assertEqual(result, { x: 0, y: 0, width: 1, height: 1 });
});

Deno.test('unions a representative with every detachable set component', () => {
  const result = unionCandidateRegions([
    { x: 0.35, y: 0.35, width: 0.15, height: 0.15 },
    { x: 0.1, y: 0.15, width: 0.12, height: 0.12 },
    { x: 0.7, y: 0.2, width: 0.15, height: 0.15 },
    { x: 0.2, y: 0.7, width: 0.12, height: 0.12 },
    { x: 0.75, y: 0.72, width: 0.1, height: 0.1 },
  ]);

  assertRegionClose(result, { x: 0.1, y: 0.15, width: 0.75, height: 0.67 });
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
