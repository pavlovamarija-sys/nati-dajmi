// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { beginToyExchangeListingWithdrawal, finishToyExchangeListingWithdrawal, parseOwnerToyExchangeListing } from './toy-exchange-owner-listing.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { TOY_CONDITION_LABELS } from '../src/features/toy-analysis/domain/toy-condition-presentation.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('parses an AVAILABLE owner listing with a null description', () => {
  const listing = parseOwnerToyExchangeListing(validRow());
  assertEqual(listing.status, 'AVAILABLE');
  assertEqual(listing.description, null);
  assertEqual(listing.condition, 'GOOD');
});

Deno.test('parses a WITHDRAWN owner listing and preserves multiline plain text', () => {
  const listing = parseOwnerToyExchangeListing(validRow({
    description: 'Прв ред.\nВтор ред.',
    status: 'WITHDRAWN',
    withdrawn_at: '2026-08-21T12:00:00.000Z',
  }));
  assertEqual(listing.status, 'WITHDRAWN');
  assertEqual(listing.description, 'Прв ред.\nВтор ред.');
});

Deno.test('rejects malformed lifecycle, condition, and numeric data', () => {
  assertThrows(() => parseOwnerToyExchangeListing(validRow({ condition: 'UNKNOWN' })));
  assertThrows(() => parseOwnerToyExchangeListing(validRow({ asking_value_stars: -1 })));
  assertThrows(() => parseOwnerToyExchangeListing(validRow({ status: 'AVAILABLE', published_at: null })));
  assertThrows(() => parseOwnerToyExchangeListing(validRow({ status: 'WITHDRAWN', withdrawn_at: null })));
});

Deno.test('duplicate withdrawal starts are blocked until the listing finishes', () => {
  const inFlight = new Set<string>();
  assertEqual(beginToyExchangeListingWithdrawal(inFlight, 'listing-1'), true);
  assertEqual(beginToyExchangeListingWithdrawal(inFlight, 'listing-1'), false);
  finishToyExchangeListingWithdrawal(inFlight, 'listing-1');
  assertEqual(beginToyExchangeListingWithdrawal(inFlight, 'listing-1'), true);
});

Deno.test('owner listings reuse the shared Macedonian condition presentation', () => {
  assertEqual(TOY_CONDITION_LABELS.EXCELLENT, 'Одлична');
  assertEqual(TOY_CONDITION_LABELS.GOOD, 'Добра');
  assertEqual(TOY_CONDITION_LABELS.FAIR, 'Солидна');
  assertEqual(TOY_CONDITION_LABELS.POOR, 'Лоша');
});

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1', source_toy_analysis_item_id: 'toy-1', name: 'Камион',
    category: 'Возило', description: null, condition: 'GOOD',
    image_path: 'user/analysis/toy-1.jpg', asking_value_stars: 500,
    source_estimated_value_denars: 500, recommendation_at_publication: 'PASS_ON',
    status: 'AVAILABLE', created_at: '2026-08-21T10:00:00.000Z',
    published_at: '2026-08-21T10:00:00.000Z', withdrawn_at: null, ...overrides,
  };
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}

function assertThrows(fn: () => void): void {
  try { fn(); } catch { return; }
  throw new Error('Expected function to throw.');
}
