import { supabase } from '@/lib/supabase/client';

const FUNCTION_NAME = 'withdraw-toy-listing';

export type WithdrawToyExchangeListingResult = {
  listing: { id: string; status: 'WITHDRAWN'; withdrawnAt: string };
};
export type ToyExchangeWithdrawalErrorCode = 'UNAUTHENTICATED' | 'LISTING_NOT_FOUND' | 'NOT_AVAILABLE' | 'WITHDRAWAL_FAILED';

export class ToyExchangeWithdrawalError extends Error {
  constructor(readonly code: ToyExchangeWithdrawalErrorCode) {
    super('Could not withdraw the toy listing.');
    this.name = 'ToyExchangeWithdrawalError';
  }
}

export async function withdrawToyExchangeListing(listingId: string): Promise<WithdrawToyExchangeListingResult> {
  const normalizedId = typeof listingId === 'string' ? listingId.trim() : '';
  if (!normalizedId) throw new ToyExchangeWithdrawalError('WITHDRAWAL_FAILED');
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try { invocation = await supabase.functions.invoke(FUNCTION_NAME, { body: { listingId: normalizedId } }); }
  catch { throw new ToyExchangeWithdrawalError('WITHDRAWAL_FAILED'); }
  if (invocation.error) throw new ToyExchangeWithdrawalError(await readErrorCode(invocation.error));
  return parseResponse(invocation.data);
}

function parseResponse(value: unknown): WithdrawToyExchangeListingResult {
  if (!isRecord(value) || !hasExactKeys(value, ['listing']) || !isRecord(value.listing) ||
      !hasExactKeys(value.listing, ['id', 'status', 'withdrawnAt'])) throw new ToyExchangeWithdrawalError('WITHDRAWAL_FAILED');
  const { listing } = value;
  if (typeof listing.id !== 'string' || !listing.id.trim() || listing.status !== 'WITHDRAWN' ||
      typeof listing.withdrawnAt !== 'string' || Number.isNaN(Date.parse(listing.withdrawnAt))) throw new ToyExchangeWithdrawalError('WITHDRAWAL_FAILED');
  return { listing: { id: listing.id.trim(), status: 'WITHDRAWN', withdrawnAt: listing.withdrawnAt } };
}
async function readErrorCode(error: unknown): Promise<ToyExchangeWithdrawalErrorCode> {
  if (isRecord(error) && 'context' in error && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json();
      const code = isRecord(body) && isRecord(body.error) ? body.error.code : null;
      if (code === 'UNAUTHENTICATED' || code === 'LISTING_NOT_FOUND' || code === 'NOT_AVAILABLE') return code;
    } catch { /* neutral fallback */ }
  }
  return 'WITHDRAWAL_FAILED';
}
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
