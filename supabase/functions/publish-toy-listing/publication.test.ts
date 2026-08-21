// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildAuthoritativeListingInsert, classifyListingInsertError, parseBearerAccessToken, validatePublishToyListingRequest } from './publication.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('accepts valid publication input and normalizes category', () => {
  const valid = validatePublishToyListingRequest(validRequest());
  assertEqual(valid.ok, true);
  const emptyCategory = validatePublishToyListingRequest(validRequest({ category: '  ' }));
  assertEqual(emptyCategory.ok && emptyCategory.value.category, null);
});

Deno.test('normalizes optional parent-written descriptions', () => {
  const nullDescription = validatePublishToyListingRequest(validRequest({ description: null }));
  const emptyDescription = validatePublishToyListingRequest(validRequest({ description: '' }));
  const whitespaceDescription = validatePublishToyListingRequest(validRequest({ description: '  \n ' }));
  const textDescription = validatePublishToyListingRequest(validRequest({
    description: '  Родителски опис.  ',
  }));
  const multilineDescription = validatePublishToyListingRequest(validRequest({
    description: '  Прв ред.\nВтор ред.  ',
  }));

  assertEqual(nullDescription.ok && nullDescription.value.description, null);
  assertEqual(emptyDescription.ok && emptyDescription.value.description, null);
  assertEqual(whitespaceDescription.ok && whitespaceDescription.value.description, null);
  assertEqual(textDescription.ok && textDescription.value.description, 'Родителски опис.');
  assertEqual(multilineDescription.ok && multilineDescription.value.description, 'Прв ред.\nВтор ред.');
});

Deno.test('accepts exactly 1000 description characters and rejects more', () => {
  assertEqual(validatePublishToyListingRequest(validRequest({
    description: 'а'.repeat(1000),
  })).ok, true);
  assertEqual(validatePublishToyListingRequest(validRequest({
    description: 'а'.repeat(1001),
  })).ok, false);
});

Deno.test('stores only normalized client description without changing provenance', () => {
  const validated = validatePublishToyListingRequest(validRequest({
    description: '  Самостојно напишан опис.  ',
  }));
  if (!validated.ok) {
    throw new Error('Expected valid description input.');
  }
  const result = buildAuthoritativeListingInsert(
    validated.value,
    'user-1',
    validSource(),
  );
  if (!result.ok) {
    throw new Error(`Expected valid source, received ${result.reason}.`);
  }
  assertEqual(result.insert.description, 'Самостојно напишан опис.');
  assertEqual(result.insert.owner_user_id, 'user-1');
  assertEqual(result.insert.source_valuation_id, 'valuation-1');
});

Deno.test('validates editable publication fields', () => {
  assertEqual(validatePublishToyListingRequest(validRequest({ name: ' ' })).ok, false);
  assertEqual(validatePublishToyListingRequest(validRequest({ askingValueStars: -1 })).ok, false);
  assertEqual(validatePublishToyListingRequest(validRequest({ askingValueStars: 1.5 })).ok, false);
  assertEqual(validatePublishToyListingRequest(validRequest({ askingValueStars: 0 })).ok, true);
});

Deno.test('rejects client-controlled provenance fields', () => {
  assertEqual(validatePublishToyListingRequest({
    ...validRequest(),
    owner_user_id: 'another-user',
  }).ok, false);
});

Deno.test('rejects unauthenticated authorization headers', () => {
  assertEqual(parseBearerAccessToken(null), null);
  assertEqual(parseBearerAccessToken(''), null);
  assertEqual(parseBearerAccessToken('Basic token'), null);
  assertEqual(parseBearerAccessToken('Bearer '), null);
  assertEqual(parseBearerAccessToken('Bearer user-token'), 'user-token');
});

for (const recommendation of ['KEEP', 'ROTATE', 'PASS_ON'] as const) {
  Deno.test(`builds authoritative ${recommendation} publication`, () => {
    const result = buildAuthoritativeListingInsert(
      validRequest(),
      'user-1',
      validSource({ recommendation }),
    );
    assertEqual(result.ok, true);
    if (result.ok) {
      assertEqual(result.insert.recommendation_at_publication, recommendation);
      assertEqual(result.insert.owner_user_id, 'user-1');
      assertEqual(result.insert.source_valuation_id, 'valuation-1');
      assertEqual(result.insert.status, 'AVAILABLE');
      assertEqual('published_at' in result.insert, false);
    }
  });
}

Deno.test('rejects a source not owned by the authenticated user', () => {
  assertReason(validSource({ owner_user_id: 'user-2' }), 'SOURCE_NOT_OWNED');
});

Deno.test('rejects a missing or unexpected crop', () => {
  assertReason(validSource({ image_path: null }), 'CROP_NOT_READY');
  assertReason(validSource({ crop_expected: false }), 'CROP_NOT_READY');
});

Deno.test('rejects unconfirmed and UNKNOWN condition', () => {
  assertReason(validSource({ valuation: {
    confirmed_condition: null,
    condition_confirmation_type: null,
    condition_confirmed_at: null,
  } }), 'CONDITION_NOT_CONFIRMED');
  assertReason(validSource({ valuation: {
    confirmed_condition: 'UNKNOWN',
    condition_confirmation_type: 'CORRECTED',
  } }), 'CONDITION_NOT_CONFIRMED');
});

Deno.test('rejects legacy and mismatched valuations', () => {
  assertReason(validSource({ valuation: legacyValuation() }), 'UNSUPPORTED_VALUATION');
  assertReason(validSource({ valuation: {
    toy_analysis_item_id: 'toy-item-2',
  } }), 'INVALID_SOURCE');
});

Deno.test('maps active-listing uniqueness conflicts without exposing database text', () => {
  assertEqual(classifyListingInsertError({ code: '23505', message: 'raw' }), 'ACTIVE_LISTING_EXISTS');
  assertEqual(classifyListingInsertError({ code: '23514' }), 'PUBLICATION_FAILED');
});

function validRequest(overrides: Record<string, unknown> = {}) {
  return {
    toyAnalysisItemId: 'toy-item-1',
    name: 'Камион',
    category: 'Возило',
    description: null,
    askingValueStars: 500,
    ...overrides,
  };
}

function validSource(overrides: Record<string, unknown> = {}) {
  const valuationOverrides = isRecord(overrides.valuation) ? overrides.valuation : {};
  return {
    id: 'toy-item-1',
    owner_user_id: 'user-1',
    recommendation: 'PASS_ON',
    image_path: 'user-1/analysis-1/toy-item-1.jpg',
    crop_expected: true,
    ...overrides,
    toy_analysis_item_valuations: overrides.valuation === null
      ? []
      : [{ ...validValuation(), ...valuationOverrides }],
  };
}

function validValuation() {
  return {
    id: 'valuation-1',
    toy_analysis_item_id: 'toy-item-1',
    estimated_value_denars: 500,
    confidence: 0.8,
    valuation_method: 'openai-image-aware-condition-estimate',
    valuation_version: 'v2',
    created_at: '2026-08-20T10:00:00.000Z',
    updated_at: '2026-08-20T11:00:00.000Z',
    base_second_hand_value_denars: 600,
    base_value_confidence: 0.8,
    ai_condition: 'GOOD',
    ai_condition_confidence: 0.75,
    ai_condition_notes: ['Visible condition evidence.'],
    confirmed_condition: 'GOOD',
    condition_confirmation_type: 'ACCEPTED_AI',
    condition_confirmed_at: '2026-08-20T11:00:00.000Z',
    parent_reported_issues: [],
    parent_condition_note: null,
    condition_adjustment_basis_points: -1500,
  };
}

function legacyValuation() {
  return {
    ...validValuation(),
    valuation_version: 'v1',
    base_second_hand_value_denars: null,
    base_value_confidence: null,
    ai_condition: null,
    ai_condition_confidence: null,
    ai_condition_notes: null,
    confirmed_condition: null,
    condition_confirmation_type: null,
    condition_confirmed_at: null,
    parent_reported_issues: null,
    parent_condition_note: null,
    condition_adjustment_basis_points: null,
  };
}

function assertReason(source: unknown, expected: string) {
  const result = buildAuthoritativeListingInsert(validRequest(), 'user-1', source);
  assertEqual(result.ok ? 'READY' : result.reason, expected);
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
