// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildOpenAIValuationRequest, extractStructuredOutputText, finalizeToyValuation, parseModelValuation, valuationInstructions, valuationResponseSchema, VALUATION_METHOD, VALUATION_VERSION, type ModelValuation } from './openai-valuation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('includes a high-detail image only when a validated image is supplied', () => {
  const textOnly = buildOpenAIValuationRequest('Wooden blocks', 'Building toy');
  assertEqual(containsKey(textOnly, 'image_url'), false);

  const withImage = buildOpenAIValuationRequest('Wooden blocks', 'Building toy', {
    mimeType: 'image/jpeg',
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  });
  assertEqual(containsEntry(withImage, 'type', 'input_image'), true);
  assertEqual(containsEntry(withImage, 'detail', 'high'), true);
  assertEqual(withImage.store, false);
});

Deno.test('strict schema contains only model-owned fields', () => {
  assertJsonEqual(Object.keys(valuationResponseSchema.properties).sort(), [
    'baseSecondHandValueDenars',
    'baseValueConfidence',
    'condition',
    'conditionConfidence',
    'conditionNotes',
  ].sort());
  assertEqual(valuationResponseSchema.additionalProperties, false);
  assertEqual(containsKey(valuationResponseSchema, 'estimatedValueDenars'), false);
  assertEqual(containsKey(valuationResponseSchema, 'conditionAdjustmentBasisPoints'), false);
  assertEqual(containsKey(valuationResponseSchema, 'confidence'), false);
});

Deno.test('condition instructions prioritize supported structural defects', () => {
  for (const expectedInstruction of [
    'missing components or parts',
    'broken, detached, cracked, or deformed structural parts',
    'only then (5) minor cosmetic wear',
    'wheels',
    'exposed attachment points or mounts',
    'asymmetry alone',
    'positive visible evidence',
    'clearly established meaningful missing component',
    'excludes GOOD',
    'does not automatically require POOR',
    'Prioritize economically or structurally important findings',
  ]) {
    assertEqual(valuationInstructions.includes(expectedInstruction), true);
  }
});

Deno.test('extracts structured output text from a Responses API body', () => {
  const text = extractStructuredOutputText({
    output: [{ content: [{ type: 'output_text', text: '{"condition":"GOOD"}' }] }],
  });
  assertEqual(text, '{"condition":"GOOD"}');
});

Deno.test('validates model-owned valuation fields', () => {
  assertJsonEqual(parseModelValuation(validModelValuation()), validModelValuation());
  assertEqual(parseModelValuation({ ...validModelValuation(), condition: 'USED' }), null);
  assertEqual(parseModelValuation(validModelValuation({ conditionNotes: ['a', 'b', 'c', 'd'] })), null);
  assertEqual(parseModelValuation(validModelValuation({ baseValueConfidence: Number.NaN })), null);
  assertEqual(parseModelValuation(validModelValuation({ conditionConfidence: 2 })), null);
  assertEqual(parseModelValuation({
    ...validModelValuation(),
    estimatedValueDenars: 1,
  }), null);
});

Deno.test('final response applies shared deterministic policy and v2 metadata', () => {
  const result = finalizeToyValuation(validModelValuation(), true);

  assertEqual(result.conditionAdjustmentBasisPoints, -2500);
  assertEqual(result.estimatedValueDenars, 800);
  assertEqual(result.confidence, 0.78);
  assertEqual(result.metadata.valuationMethod, VALUATION_METHOD);
  assertEqual(result.metadata.valuationVersion, VALUATION_VERSION);
  assertEqual(VALUATION_METHOD, 'openai-image-aware-condition-estimate');
  assertEqual(VALUATION_VERSION, 'v2');
});

Deno.test('no image deterministically forces UNKNOWN with no adjustment', () => {
  const result = finalizeToyValuation(validModelValuation({
    condition: 'EXCELLENT',
    conditionConfidence: 1,
    conditionNotes: ['Looks clean.'],
  }), false);

  assertEqual(result.condition, 'UNKNOWN');
  assertEqual(result.conditionConfidence, null);
  assertJsonEqual(result.conditionNotes, []);
  assertEqual(result.conditionAdjustmentBasisPoints, 0);
  assertEqual(result.estimatedValueDenars, 1000);
  assertEqual(result.confidence, 0.52);
});

function validModelValuation(
  overrides: Partial<ModelValuation> = {},
): ModelValuation {
  return {
    baseSecondHandValueDenars: 1000,
    baseValueConfidence: 0.8,
    condition: 'FAIR',
    conditionConfidence: 0.9,
    conditionNotes: ['Visible surface wear.'],
    ...overrides,
  };
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsKey(item, key));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([entryKey, entryValue]) => entryKey === key || containsKey(entryValue, key),
  );
}

function containsEntry(value: unknown, key: string, expected: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsEntry(item, key, expected));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return Object.entries(value).some(
    ([entryKey, entryValue]) =>
      (entryKey === key && entryValue === expected) ||
      containsEntry(entryValue, key, expected),
  );
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
