// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { evaluateToyExchangeListingSource } from './toy-exchange-listing-preparation.ts';

declare const Deno: {
  test(name: string, fn: () => void): void;
};

const recommendations = ['KEEP', 'ROTATE', 'PASS_ON'] as const;

for (const recommendation of recommendations) {
  Deno.test(`${recommendation} confirmed v2 toy is ready`, () => {
    const result = evaluateToyExchangeListingSource(validSource({ recommendation }));
    assertEqual(result.status, 'READY');
  });
}

Deno.test('uses the final denar value as the suggested star value, including zero', () => {
  const result = evaluateToyExchangeListingSource(validSource({
    valuation: { estimatedValueDenars: 0 },
  }));

  if (result.status !== 'READY') {
    throw new Error(`Expected READY, received ${result.status}.`);
  }

  assertEqual(result.listing.sourceEstimatedValueDenars, 0);
  assertEqual(result.listing.suggestedAskingValueStars, 0);
});

Deno.test('blocks a missing crop', () => {
  assertStatus(validSource({ imagePath: null }), 'CROP_NOT_READY');
});

Deno.test('blocks a missing valuation', () => {
  assertStatus(validSource({ valuation: null }), 'VALUATION_MISSING');
});

Deno.test('blocks unconfirmed and UNKNOWN conditions', () => {
  assertStatus(validSource({ valuation: {
    confirmedCondition: null,
    conditionConfirmationType: null,
    conditionConfirmedAt: null,
  } }), 'CONDITION_NOT_CONFIRMED');
  assertStatus(validSource({ valuation: {
    confirmedCondition: 'UNKNOWN',
    conditionConfirmationType: 'CORRECTED',
  } }), 'CONDITION_NOT_CONFIRMED');
});

Deno.test('blocks a legacy v1 valuation', () => {
  assertStatus(validSource({ valuation: legacyValuation() }), 'UNSUPPORTED_VALUATION');
});

Deno.test('blocks malformed v2 provenance', () => {
  assertStatus(validSource({ valuation: { aiConditionNotes: null } }), 'INVALID_AUTHORITATIVE_DATA');
});

Deno.test('blocks a valuation linked to another item', () => {
  assertStatus(validSource({ valuation: {
    toyAnalysisItemId: 'another-item',
  } }), 'INVALID_AUTHORITATIVE_DATA');
});

Deno.test('blocks a negative final value', () => {
  assertStatus(validSource({ valuation: {
    estimatedValueDenars: -1,
  } }), 'INVALID_AUTHORITATIVE_DATA');
});

function validSource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const valuationOverrides = isRecord(overrides.valuation) ? overrides.valuation : {};
  const valuation = overrides.valuation === null
    ? null
    : { ...validValuation(), ...valuationOverrides };

  return {
    id: 'toy-item-1',
    name: 'Toy truck',
    category: 'Toy vehicle',
    recommendation: 'KEEP',
    imagePath: 'user/analysis/toy-item-1.jpg',
    cropExpected: true,
    ...overrides,
    valuation,
  };
}

function validValuation(): Record<string, unknown> {
  return {
    id: 'valuation-1',
    toyAnalysisItemId: 'toy-item-1',
    estimatedValueDenars: 500,
    confidence: 0.8,
    valuationMethod: 'openai-image-aware-condition-estimate',
    valuationVersion: 'v2',
    baseSecondHandValueDenars: 600,
    baseValueConfidence: 0.8,
    aiCondition: 'GOOD',
    aiConditionConfidence: 0.75,
    aiConditionNotes: ['Visible condition evidence.'],
    confirmedCondition: 'GOOD',
    conditionConfirmationType: 'ACCEPTED_AI',
    conditionConfirmedAt: '2026-08-20T12:00:00.000Z',
    conditionAdjustmentBasisPoints: -1500,
  };
}

function legacyValuation(): Record<string, unknown> {
  return {
    ...validValuation(),
    valuationVersion: 'v1',
    baseSecondHandValueDenars: null,
    baseValueConfidence: null,
    aiCondition: null,
    aiConditionConfidence: null,
    aiConditionNotes: null,
    confirmedCondition: null,
    conditionConfirmationType: null,
    conditionConfirmedAt: null,
    conditionAdjustmentBasisPoints: null,
  };
}

function assertStatus(value: unknown, expected: string): void {
  const result = evaluateToyExchangeListingSource(value);
  assertEqual(result.status, expected);
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
