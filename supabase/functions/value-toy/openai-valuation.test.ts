// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildOpenAIValuationRequest, extractStructuredOutputText, parseModelValuation, VALUATION_METHOD, VALUATION_VERSION } from './openai-valuation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('builds a text-only non-stored strict structured request', () => {
  const request = buildOpenAIValuationRequest('Wooden blocks', 'Building toy');
  assertEqual(request.store, false);
  assertEqual(containsKey(request, 'image_url'), false);
  const text = request.text as Record<string, unknown>;
  const format = text.format as Record<string, unknown>;
  assertEqual(format.type, 'json_schema');
  assertEqual(format.strict, true);
});

Deno.test('extracts structured output text from a Responses API body', () => {
  const text = extractStructuredOutputText({
    output: [
      {
        content: [
          {
            type: 'output_text',
            text: '{"estimatedValueDenars":500,"confidence":0.6}',
          },
        ],
      },
    ],
  });
  assertEqual(text, '{"estimatedValueDenars":500,"confidence":0.6}');
});

Deno.test('validates a model valuation including null confidence', () => {
  assertJsonEqual(parseModelValuation({
    estimatedValueDenars: 500,
    confidence: 0.6,
  }), {
    estimatedValueDenars: 500,
    confidence: 0.6,
  });
  assertJsonEqual(parseModelValuation({
    estimatedValueDenars: 0,
    confidence: null,
  }), {
    estimatedValueDenars: 0,
    confidence: null,
  });
});

Deno.test('rejects invalid value, confidence, or extra properties', () => {
  assertEqual(parseModelValuation({ estimatedValueDenars: -1, confidence: 0.5 }), null);
  assertEqual(parseModelValuation({ estimatedValueDenars: 1.5, confidence: 0.5 }), null);
  assertEqual(parseModelValuation({ estimatedValueDenars: 500, confidence: 2 }), null);
  assertEqual(parseModelValuation({ estimatedValueDenars: 500, confidence: Number.NaN }), null);
  assertEqual(parseModelValuation({
    estimatedValueDenars: 500,
    confidence: 0.5,
    explanation: 'extra',
  }), null);
});

Deno.test('uses stable valuation metadata constants', () => {
  assertEqual(VALUATION_METHOD, 'openai-semantic-estimate');
  assertEqual(VALUATION_VERSION, 'v1');
});

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
