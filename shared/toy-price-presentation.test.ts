import { getEffectiveToyCondition } from './toy-valuation-policy';
import {
  hasSuggestedToyPriceRange,
  shouldWarnForToyAskingPrice,
} from '../src/features/toy-analysis/domain/toy-price-presentation';

declare const Deno: {
  test(name: string, test: () => void): void;
};

Deno.test('offers ranges for normal conditions but not POOR', () => {
  assertEqual(hasSuggestedToyPriceRange('GOOD'), true);
  assertEqual(hasSuggestedToyPriceRange('FAIR'), true);
  assertEqual(hasSuggestedToyPriceRange('POOR'), false);
});

Deno.test('does not warn about a POOR toy asking price without a range', () => {
  assertEqual(shouldWarnForToyAskingPrice('POOR', 1000, 200), false);
});

Deno.test('uses parent-confirmed condition for price presentation', () => {
  const correctedToPoor = getEffectiveToyCondition('GOOD', 'POOR');
  const correctedToFair = getEffectiveToyCondition('POOR', 'FAIR');

  assertEqual(hasSuggestedToyPriceRange(correctedToPoor), false);
  assertEqual(hasSuggestedToyPriceRange(correctedToFair), true);
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
