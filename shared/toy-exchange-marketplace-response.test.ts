// This test duplicates no parser logic; it exercises the production client parser.
// @ts-ignore Node/Deno test harness resolves explicit TypeScript extensions.
import { parseMarketplaceResponse } from './toy-exchange-marketplace-response.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('client strictly parses a safe marketplace card', () => {
  const cards = parseMarketplaceResponse({ listings: [validCard()] });
  assertEqual(cards[0].name, 'Камион');
  assertEqual(cards[0].imageUrl, 'https://example.supabase.co/signed.jpg');
});

Deno.test('client accepts nullable description and image fallback', () => {
  const cards = parseMarketplaceResponse({ listings: [validCard({ description: null, imageUrl: null })] });
  assertEqual(cards[0].description, null);
  assertEqual(cards[0].imageUrl, null);
});

Deno.test('client rejects malformed cards and extra private fields', () => {
  assertThrows(() => parseMarketplaceResponse({ listings: [validCard({ condition: 'UNKNOWN' })] }));
  assertThrows(() => parseMarketplaceResponse({ listings: [validCard({ askingValueStars: -1 })] }));
  assertThrows(() => parseMarketplaceResponse({ listings: [{ ...validCard(), owner_user_id: 'owner' }] }));
  assertThrows(() => parseMarketplaceResponse({ listings: [validCard({ imageUrl: 'javascript:bad' })] }));
});

function validCard(overrides: Record<string, unknown> = {}) {
  return { id: 'listing-1', name: 'Камион', category: 'Возило', description: 'Очувана играчка.', condition: 'GOOD', askingValueStars: 500, publishedAt: '2026-08-21T10:00:00.000Z', imageUrl: 'https://example.supabase.co/signed.jpg', ...overrides };
}
function assertEqual(actual: unknown, expected: unknown): void { if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`); }
function assertThrows(fn: () => void): void { try { fn(); } catch { return; } throw new Error('Expected function to throw.'); }
