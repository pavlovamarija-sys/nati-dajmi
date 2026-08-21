// @ts-ignore Deno requires explicit TypeScript extensions.
import { MARKETPLACE_LISTING_LIMIT, MARKETPLACE_ORDER_ASCENDING, MARKETPLACE_ORDER_COLUMN, parseBearerAccessToken, parseVisibleMarketplaceListing, serializeMarketplaceListing, validateBrowseToyListingsRequest } from './marketplace.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('browse requires authentication and accepts no client-controlled fields', () => {
  assertEqual(parseBearerAccessToken(null), null);
  assertEqual(parseBearerAccessToken('Bearer token'), 'token');
  assertEqual(validateBrowseToyListingsRequest({}), true);
  assertEqual(validateBrowseToyListingsRequest({ imagePath: 'other/path.jpg' }), false);
  assertEqual(validateBrowseToyListingsRequest({ limit: 1000 }), false);
});

Deno.test('only another user\'s AVAILABLE listing is visible', () => {
  assertEqual(parseVisibleMarketplaceListing(validRow(), 'viewer')?.id, 'listing-1');
  assertEqual(parseVisibleMarketplaceListing(validRow({ status: 'WITHDRAWN' }), 'viewer'), null);
  assertEqual(parseVisibleMarketplaceListing(validRow({ status: 'DRAFT' }), 'viewer'), null);
  assertEqual(parseVisibleMarketplaceListing(validRow({ owner_user_id: 'viewer' }), 'viewer'), null);
});

Deno.test('malformed condition and negative stars are rejected', () => {
  assertEqual(parseVisibleMarketplaceListing(validRow({ condition: 'UNKNOWN' }), 'viewer'), null);
  assertEqual(parseVisibleMarketplaceListing(validRow({ asking_value_stars: -1 }), 'viewer'), null);
});

Deno.test('safe response excludes owner, provenance, value, and storage path', () => {
  const source = parseVisibleMarketplaceListing(validRow(), 'viewer');
  if (!source) throw new Error('Expected visible source.');
  const response = serializeMarketplaceListing(source, 'https://example.supabase.co/signed.jpg');
  if (!response) throw new Error('Expected safe response.');
  for (const key of ['owner_user_id', 'source_toy_analysis_item_id', 'source_valuation_id', 'image_path', 'source_estimated_value_denars']) {
    assertEqual(key in response, false);
  }
  assertEqual(response.imageUrl, 'https://example.supabase.co/signed.jpg');
});

Deno.test('invalid signed image URL is rejected and missing image may use null fallback', () => {
  const source = parseVisibleMarketplaceListing(validRow(), 'viewer');
  if (!source) throw new Error('Expected visible source.');
  assertEqual(serializeMarketplaceListing(source, 'javascript:alert(1)'), null);
  assertEqual(serializeMarketplaceListing(source, null)?.imageUrl, null);
});

Deno.test('marketplace first page is bounded to twenty listings', () => {
  assertEqual(MARKETPLACE_LISTING_LIMIT, 20);
  assertEqual(MARKETPLACE_ORDER_COLUMN, 'published_at');
  assertEqual(MARKETPLACE_ORDER_ASCENDING, false);
});

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing-1', owner_user_id: 'owner', name: 'Камион', category: 'Возило',
    description: 'Очувана играчка.', condition: 'GOOD', image_path: 'owner/analysis/toy.jpg',
    asking_value_stars: 500, status: 'AVAILABLE', published_at: '2026-08-21T10:00:00.000Z', ...overrides,
  };
}
function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}
