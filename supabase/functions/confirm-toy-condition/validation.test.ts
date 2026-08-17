// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { validateConfirmToyConditionRequest } from './validation.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('accepts and normalizes a valid confirmation request', () => {
  assertJsonEqual(validateConfirmToyConditionRequest({
    toyAnalysisItemId: '  item-1  ',
    confirmedCondition: 'FAIR',
    parentReportedIssues: ['MISSING_PART'],
    parentConditionNote: '  Недостасува тркало.  ',
  }), {
    ok: true,
    value: {
      toyAnalysisItemId: 'item-1',
      confirmedCondition: 'FAIR',
      parentReportedIssues: ['MISSING_PART'],
      parentConditionNote: 'Недостасува тркало.',
    },
  });
});

Deno.test('rejects invalid conditions, issues, duplicates, and blank notes', () => {
  assertRejected(validRequest({ confirmedCondition: 'USED' }));
  assertRejected(validRequest({ parentReportedIssues: ['DAMAGE'] }));
  assertRejected(validRequest({
    parentReportedIssues: ['MISSING_PART', 'MISSING_PART'],
  }));
  assertRejected(validRequest({ parentConditionNote: '   ' }));
});

Deno.test('rejects unexpected and server-owned fields', () => {
  for (const field of [
    'conditionConfirmationType',
    'estimatedValueDenars',
    'conditionAdjustmentBasisPoints',
    'baseSecondHandValueDenars',
    'confidence',
  ]) {
    assertRejected({ ...validRequest(), [field]: 'client-value' });
  }
});

function validRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    toyAnalysisItemId: 'item-1',
    confirmedCondition: 'GOOD',
    parentReportedIssues: [],
    parentConditionNote: null,
    ...overrides,
  };
}

function assertRejected(value: unknown): void {
  if (validateConfirmToyConditionRequest(value).ok) {
    throw new Error('Expected request to be rejected.');
  }
}

function assertJsonEqual(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
