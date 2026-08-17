// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildToyConditionConfirmationUpdate, classifyPersistedValuationRow, type PersistedV2ToyValuation } from './confirmation.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type { ConfirmToyConditionRequest } from './validation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

const CONFIRMED_AT = '2026-08-15T12:00:00.000Z';

Deno.test('derives ACCEPTED_AI and recalculates without fake confidence', () => {
  const valuation = validValuation({
    aiCondition: 'GOOD',
    baseSecondHandValueDenars: 1000,
    baseValueConfidence: 0.7,
  });
  const update = buildToyConditionConfirmationUpdate(
    valuation,
    validRequest({ confirmedCondition: 'GOOD' }),
    CONFIRMED_AT,
  );

  assertEqual(update.conditionConfirmationType, 'ACCEPTED_AI');
  assertEqual(update.conditionAdjustmentBasisPoints, 0);
  assertEqual(update.estimatedValueDenars, 1000);
  assertEqual(update.confidence, 0.7);
});

Deno.test('derives CORRECTED and applies only the selected-condition policy', () => {
  const valuation = validValuation({
    aiCondition: 'GOOD',
    baseSecondHandValueDenars: 1000,
  });
  const withoutIssue = buildToyConditionConfirmationUpdate(
    valuation,
    validRequest({ confirmedCondition: 'FAIR' }),
    CONFIRMED_AT,
  );
  const withIssue = buildToyConditionConfirmationUpdate(
    valuation,
    validRequest({
      confirmedCondition: 'FAIR',
      parentReportedIssues: ['MISSING_PART'],
    }),
    CONFIRMED_AT,
  );

  assertEqual(withIssue.conditionConfirmationType, 'CORRECTED');
  assertEqual(withIssue.conditionAdjustmentBasisPoints, -2500);
  assertEqual(withIssue.estimatedValueDenars, 800);
  assertEqual(withIssue.estimatedValueDenars, withoutIssue.estimatedValueDenars);
});

Deno.test('allows UNKNOWN with zero adjustment', () => {
  const update = buildToyConditionConfirmationUpdate(
    validValuation({ baseSecondHandValueDenars: 1000 }),
    validRequest({ confirmedCondition: 'UNKNOWN' }),
    CONFIRMED_AT,
  );

  assertEqual(update.conditionAdjustmentBasisPoints, 0);
  assertEqual(update.estimatedValueDenars, 1000);
});

Deno.test('classifies all-null v2 provenance as legacy', () => {
  const row = validPersistedRow();
  for (const field of [
    'base_second_hand_value_denars',
    'base_value_confidence',
    'ai_condition',
    'ai_condition_confidence',
    'ai_condition_notes',
    'confirmed_condition',
    'condition_confirmation_type',
    'condition_confirmed_at',
    'parent_reported_issues',
    'parent_condition_note',
    'condition_adjustment_basis_points',
  ]) {
    row[field] = null;
  }

  assertEqual(classifyPersistedValuationRow(row).generation, 'v1');
});

Deno.test('rejects malformed partial v2 valuation rows', () => {
  const row = validPersistedRow();
  row.ai_condition = null;
  assertEqual(classifyPersistedValuationRow(row).generation, 'invalid');
});

function validRequest(
  overrides: Partial<ConfirmToyConditionRequest> = {},
): ConfirmToyConditionRequest {
  return {
    toyAnalysisItemId: 'item-1',
    confirmedCondition: 'GOOD',
    parentReportedIssues: [],
    parentConditionNote: null,
    ...overrides,
  };
}

function validValuation(
  overrides: Partial<PersistedV2ToyValuation> = {},
): PersistedV2ToyValuation {
  return {
    id: 'valuation-1',
    toyAnalysisItemId: 'item-1',
    baseSecondHandValueDenars: 1000,
    baseValueConfidence: 0.8,
    aiCondition: 'GOOD',
    aiConditionConfidence: 0.7,
    aiConditionNotes: ['Normal visible wear.'],
    confirmedCondition: null,
    conditionConfirmationType: null,
    conditionConfirmedAt: null,
    parentReportedIssues: [],
    parentConditionNote: null,
    conditionAdjustmentBasisPoints: 0,
    estimatedValueDenars: 1000,
    confidence: 0.74,
    valuationMethod: 'openai-image-aware-condition-estimate',
    valuationVersion: 'v2',
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

function validPersistedRow(): Record<string, unknown> {
  const valuation = validValuation();
  return {
    id: valuation.id,
    toy_analysis_item_id: valuation.toyAnalysisItemId,
    base_second_hand_value_denars: valuation.baseSecondHandValueDenars,
    base_value_confidence: valuation.baseValueConfidence,
    ai_condition: valuation.aiCondition,
    ai_condition_confidence: valuation.aiConditionConfidence,
    ai_condition_notes: valuation.aiConditionNotes,
    confirmed_condition: valuation.confirmedCondition,
    condition_confirmation_type: valuation.conditionConfirmationType,
    condition_confirmed_at: valuation.conditionConfirmedAt,
    parent_reported_issues: valuation.parentReportedIssues,
    parent_condition_note: valuation.parentConditionNote,
    condition_adjustment_basis_points: valuation.conditionAdjustmentBasisPoints,
    estimated_value_denars: valuation.estimatedValueDenars,
    confidence: valuation.confidence,
    valuation_method: valuation.valuationMethod,
    valuation_version: valuation.valuationVersion,
    created_at: valuation.createdAt,
    updated_at: valuation.updatedAt,
  };
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
