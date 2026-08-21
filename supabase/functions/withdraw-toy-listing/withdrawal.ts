export type WithdrawToyListingRequest = { listingId: string };

export function validateWithdrawToyListingRequest(value: unknown):
  | { ok: true; value: WithdrawToyListingRequest }
  | { ok: false } {
  if (!isRecord(value) || !hasExactKeys(value, ['listingId'])) return { ok: false };
  const listingId = readNonblankString(value.listingId);
  return listingId ? { ok: true, value: { listingId } } : { ok: false };
}

export function parseBearerAccessToken(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized?.startsWith('Bearer ')
    ? readNonblankString(normalized.slice('Bearer '.length))
    : null;
}

export function classifyWithdrawableListing(value: unknown):
  | { ok: true; id: string }
  | { ok: false; reason: 'LISTING_NOT_FOUND' | 'NOT_AVAILABLE' } {
  if (value === null) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  if (!isRecord(value) || !readNonblankString(value.id)) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  return value.status === 'AVAILABLE'
    ? { ok: true, id: String(value.id).trim() }
    : { ok: false, reason: 'NOT_AVAILABLE' };
}

export function buildWithdrawalUpdate(): { status: 'WITHDRAWN' } {
  return { status: 'WITHDRAWN' };
}

export function serializeWithdrawalResponse(value: unknown): {
  listing: { id: string; status: 'WITHDRAWN'; withdrawnAt: string };
} | null {
  if (!isRecord(value)) return null;
  const id = readNonblankString(value.id);
  const withdrawnAt = readTimestamp(value.withdrawn_at);
  return id && value.status === 'WITHDRAWN' && withdrawnAt
    ? { listing: { id, status: 'WITHDRAWN', withdrawnAt } }
    : null;
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)) ? value : null;
}
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
