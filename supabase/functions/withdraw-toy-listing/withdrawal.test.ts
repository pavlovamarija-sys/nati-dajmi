// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { buildWithdrawalUpdate, classifyWithdrawableListing, parseBearerAccessToken, serializeWithdrawalResponse, validateWithdrawToyListingRequest } from './withdrawal.ts';

declare const Deno: { test(name: string, fn: () => void): void };

Deno.test('withdrawal request accepts only listingId', () => {
  assertEqual(validateWithdrawToyListingRequest({ listingId: ' listing-1 ' }).ok, true);
  assertEqual(validateWithdrawToyListingRequest({ listingId: 'listing-1', owner_user_id: 'user-2' }).ok, false);
  assertEqual(validateWithdrawToyListingRequest({ listingId: '', status: 'WITHDRAWN' }).ok, false);
});

Deno.test('unauthenticated authorization is rejected', () => {
  assertEqual(parseBearerAccessToken(null), null);
  assertEqual(parseBearerAccessToken('Basic token'), null);
  assertEqual(parseBearerAccessToken('Bearer token'), 'token');
});

Deno.test('inaccessible listing is not found and withdrawn listing is unavailable', () => {
  assertEqual(classifyWithdrawableListing(null).ok, false);
  const withdrawn = classifyWithdrawableListing({ id: 'listing-1', status: 'WITHDRAWN' });
  assertEqual(withdrawn.ok ? '' : withdrawn.reason, 'NOT_AVAILABLE');
  assertEqual(classifyWithdrawableListing({ id: 'listing-1', status: 'AVAILABLE' }).ok, true);
});

Deno.test('database update changes only status', () => {
  assertEqual(JSON.stringify(buildWithdrawalUpdate()), JSON.stringify({ status: 'WITHDRAWN' }));
});

Deno.test('successful response is strict and requires withdrawn timestamp', () => {
  const valid = serializeWithdrawalResponse({ id: 'listing-1', status: 'WITHDRAWN', withdrawn_at: '2026-08-21T12:00:00.000Z' });
  assertEqual(valid?.listing.status, 'WITHDRAWN');
  assertEqual(serializeWithdrawalResponse({ id: 'listing-1', status: 'AVAILABLE', withdrawn_at: null }), null);
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
}
