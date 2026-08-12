// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { matchDetectionsToQueries, parseProviderDetections } from './replicate-grounding-dino.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('normalizes successful Grounding DINO pixel boxes', () => {
  const detections = parseProviderDetections(
    successfulPrediction([
      { bbox: [300, 800, 900, 2000], label: 'plastic horse', confidence: 0.82 },
    ]),
    3000,
    4000,
  );

  assertEqual(detections.length, 1);
  assertJsonEqual(detections[0].boundingBox, {
    x: 0.1,
    y: 0.2,
    width: 0.2,
    height: 0.3,
  });
});

Deno.test('returns no detections for a valid empty output', () => {
  assertEqual(parseProviderDetections(successfulPrediction([]), 3000, 4000).length, 0);
});

Deno.test('rejects invalid detector boxes and keeps valid boxes', () => {
  const detections = parseProviderDetections(
    successfulPrediction([
      { bbox: [-1, 0, 10, 10], label: 'horse', confidence: 0.8 },
      { bbox: [30, 40, 20, 50], label: 'dog', confidence: 0.8 },
      { bbox: [100, 200, 500, 700], label: 'plush dog', confidence: 0.7 },
    ]),
    3000,
    4000,
  );

  assertEqual(detections.length, 1);
});

Deno.test('rejects malformed prediction output', () => {
  assertThrows(() => parseProviderDetections({ status: 'failed' }, 3000, 4000));
});

Deno.test('matches highest-confidence detections without reuse', () => {
  const detections = parseProviderDetections(
    successfulPrediction([
      { bbox: [0, 0, 300, 400], label: 'dog', confidence: 0.7 },
      { bbox: [600, 800, 1200, 1600], label: 'dog', confidence: 0.9 },
    ]),
    3000,
    4000,
  );
  const matches = matchDetectionsToQueries(
    [
      { toyId: 'first', query: 'soft dog toy' },
      { toyId: 'second', query: 'small dog toy' },
    ],
    detections,
  );

  assertEqual(matches.length, 2);
  assertEqual(matches[0].confidence, 0.9);
  assertEqual(new Set(matches.map((item) => JSON.stringify(item.boundingBox))).size, 2);
});

function successfulPrediction(detections: unknown[]): unknown {
  return { status: 'succeeded', output: { detections } };
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

function assertThrows(action: () => void): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error('Expected action to throw.');
}
