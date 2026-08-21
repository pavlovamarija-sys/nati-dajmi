export const EXCHANGE_REQUEST_READ_LIMIT = 50;
export const EXCHANGE_REQUEST_IMAGE_URL_LIFETIME_SECONDS = 10 * 60;

export type ExchangeRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ExchangeRequestDecision = 'ACCEPT' | 'REJECT';

export function validateCreateExchangeRequest(value: unknown): { listingId: string } | null {
  if (!isRecord(value) || !hasExactKeys(value, ['listingId'])) return null;
  const listingId = readNonblank(value.listingId);
  return listingId ? { listingId } : null;
}

export function validateRespondExchangeRequest(value: unknown): { requestId: string; decision: ExchangeRequestDecision } | null {
  if (!isRecord(value) || !hasExactKeys(value, ['requestId', 'decision'])) return null;
  const requestId = readNonblank(value.requestId);
  return requestId && (value.decision === 'ACCEPT' || value.decision === 'REJECT')
    ? { requestId, decision: value.decision }
    : null;
}

export function validateReadExchangeRequests(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function parseBearerAccessToken(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized?.startsWith('Bearer ') ? readNonblank(normalized.slice(7)) : null;
}

export function classifyRequestableListing(value: unknown, requesterUserId: string):
  | { ok: true; listingId: string; ownerUserId: string }
  | { ok: false; reason: 'LISTING_NOT_FOUND' | 'LISTING_NOT_AVAILABLE' | 'OWN_LISTING' } {
  if (!isRecord(value)) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  const listingId = readNonblank(value.id); const ownerUserId = readNonblank(value.owner_user_id);
  if (!listingId || !ownerUserId) return { ok: false, reason: 'LISTING_NOT_FOUND' };
  if (value.status !== 'AVAILABLE') return { ok: false, reason: 'LISTING_NOT_AVAILABLE' };
  return ownerUserId === requesterUserId
    ? { ok: false, reason: 'OWN_LISTING' }
    : { ok: true, listingId, ownerUserId };
}

export function buildExchangeRequestInsert(listingId: string, requesterUserId: string, ownerUserId: string): {
  listing_id: string; requester_user_id: string; owner_user_id: string; status: 'PENDING';
} {
  return { listing_id: listingId, requester_user_id: requesterUserId, owner_user_id: ownerUserId, status: 'PENDING' };
}

export function serializeExchangeRequestMutation(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const requestId = readNonblank(value.id); const listingId = readNonblank(value.listing_id);
  const createdAt = readTimestamp(value.created_at); const respondedAt = value.responded_at === null ? null : readTimestamp(value.responded_at);
  if (!requestId || !listingId || !isStatus(value.status) || !createdAt || respondedAt === undefined ||
      (value.status === 'PENDING' && respondedAt !== null) || (value.status !== 'PENDING' && respondedAt === null)) return null;
  return { requestId, listingId, status: value.status, createdAt, respondedAt };
}

export function parseVisibleExchangeRequest(value: unknown, userId: string): {
  direction: 'SENT' | 'RECEIVED'; imagePath: string; dto: Record<string, unknown>;
} | null {
  if (!isRecord(value)) return null;
  const requester = readNonblank(value.requester_user_id); const owner = readNonblank(value.owner_user_id);
  const direction = requester === userId ? 'SENT' : owner === userId ? 'RECEIVED' : null;
  const listing = Array.isArray(value.toy_exchange_listings) ? value.toy_exchange_listings[0] : value.toy_exchange_listings;
  if (!direction || !isRecord(listing)) return null;
  const requestId = readNonblank(value.id); const listingId = readNonblank(value.listing_id);
  const listingName = readNonblank(listing.name); const imagePath = readNonblank(listing.image_path);
  const createdAt = readTimestamp(value.created_at); const respondedAt = value.responded_at === null ? null : readTimestamp(value.responded_at);
  if (!requestId || !listingId || !listingName || !imagePath || !isStatus(value.status) || !createdAt || respondedAt === undefined || !Number.isSafeInteger(listing.asking_value_stars) || Number(listing.asking_value_stars) < 0) return null;
  return { direction, imagePath, dto: { requestId, listingId, listingName, askingValueStars: Number(listing.asking_value_stars), status: value.status, createdAt, respondedAt } };
}

export function attachSignedRequestImage(dto: Record<string, unknown>, imageUrl: string | null): Record<string, unknown> | null {
  if (imageUrl !== null) { try { if (new URL(imageUrl).protocol !== 'https:') return null; } catch { return null; } }
  return { ...dto, listingImageUrl: imageUrl };
}

export function isUniqueViolation(error: unknown): boolean { return isRecord(error) && error.code === '23505'; }
function isStatus(value: unknown): value is ExchangeRequestStatus { return value === 'PENDING' || value === 'ACCEPTED' || value === 'REJECTED'; }
function readNonblank(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function readTimestamp(value: unknown): string | null { return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)) ? value : null; }
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
