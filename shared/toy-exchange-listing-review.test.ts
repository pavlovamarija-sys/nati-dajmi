// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildToyExchangeListingReviewRoute, getInitialAskingValueInput, getListingPreparationUiState, parseToyExchangeAskingValue } from './toy-exchange-listing-review.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('maps every preparation failure to a short UI state', () => {
  const statuses = ['UNAUTHENTICATED', 'SOURCE_NOT_FOUND', 'CROP_NOT_READY', 'VALUATION_MISSING', 'CONDITION_NOT_CONFIRMED', 'UNSUPPORTED_VALUATION', 'INVALID_AUTHORITATIVE_DATA'] as const;
  for (const status of statuses) {
    const state = getListingPreparationUiState(status);
    assertEqual(Boolean(state.title.trim()), true);
    assertEqual(Boolean(state.message.trim()), true);
  }
});

Deno.test('accepts zero and nonnegative integer star values', () => {
  assertEqual(parseToyExchangeAskingValue('0').valid, true);
  assertEqual(parseToyExchangeAskingValue('500').valid, true);
});

Deno.test('rejects negative, fractional, blank, and unsafe star values', () => {
  for (const input of ['-1', '1.5', '', ' ', '12a', '999999999999999999999']) {
    assertEqual(parseToyExchangeAskingValue(input).valid, false);
  }
});

Deno.test('initial asking value is the prepared suggestion', () => {
  assertEqual(getInitialAskingValueInput(0), '0');
  assertEqual(getInitialAskingValueInput(450), '450');
});

Deno.test('review route contains only the toy analysis item ID', () => {
  const route = buildToyExchangeListingReviewRoute(' toy-1 ');
  assertEqual(route.pathname, '/listings/new');
  assertEqual(JSON.stringify(route.params), JSON.stringify({ toyAnalysisItemId: 'toy-1' }));
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
