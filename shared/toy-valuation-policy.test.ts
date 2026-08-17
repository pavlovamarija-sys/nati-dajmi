// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { getEffectiveToyCondition, isParentReportedToyIssue, isToyConditionConfirmationType, isToyValuationCondition } from './toy-valuation-policy.ts';

declare const Deno: {
  test(name: string, fn: () => void): void;
};

Deno.test('accepts controlled confirmation and parent-issue values', () => {
  assertEqual(isToyConditionConfirmationType('ACCEPTED_AI'), true);
  assertEqual(isToyConditionConfirmationType('CORRECTED'), true);
  assertEqual(isParentReportedToyIssue('MISSING_PART'), true);
  assertEqual(isParentReportedToyIssue('BROKEN_PART'), true);
  assertEqual(isParentReportedToyIssue('DOES_NOT_WORK'), true);
  assertEqual(isParentReportedToyIssue('HEAVY_WEAR'), true);
  assertEqual(isParentReportedToyIssue('OTHER'), true);
});

Deno.test('rejects unknown controlled values', () => {
  assertEqual(isToyConditionConfirmationType('CONFIRMED'), false);
  assertEqual(isParentReportedToyIssue('COSMETIC_WEAR'), false);
  assertEqual(isToyValuationCondition('USED'), false);
});

Deno.test('uses AI condition before confirmation', () => {
  assertEqual(getEffectiveToyCondition('GOOD', null), 'GOOD');
});

Deno.test('uses confirmed condition without changing AI provenance', () => {
  const aiCondition = 'GOOD' as const;
  const effectiveCondition = getEffectiveToyCondition(aiCondition, 'POOR');

  assertEqual(effectiveCondition, 'POOR');
  assertEqual(aiCondition, 'GOOD');
});

Deno.test('effective-condition helper rejects invalid enum values', () => {
  assertThrows(() => getEffectiveToyCondition('USED' as never, null));
  assertThrows(() => getEffectiveToyCondition('GOOD', 'USED' as never));
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertThrows(callback: () => void): void {
  let threw = false;

  try {
    callback();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error('Expected callback to throw.');
  }
}
