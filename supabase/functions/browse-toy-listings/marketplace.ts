export const MARKETPLACE_LISTING_LIMIT = 20;
export const MARKETPLACE_IMAGE_URL_LIFETIME_SECONDS = 10 * 60;
export const MARKETPLACE_ORDER_COLUMN = 'published_at';
export const MARKETPLACE_ORDER_ASCENDING = false;

export type MarketplaceListingCardSource = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  askingValueStars: number;
  publishedAt: string;
  imagePath: string;
};

export function validateBrowseToyListingsRequest(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function parseBearerAccessToken(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized?.startsWith('Bearer ')
    ? readNonblankString(normalized.slice('Bearer '.length))
    : null;
}

export function parseVisibleMarketplaceListing(
  value: unknown,
  authenticatedUserId: string,
): MarketplaceListingCardSource | null {
  if (!isRecord(value) || value.status !== 'AVAILABLE' || value.owner_user_id === authenticatedUserId) {
    return null;
  }
  const id = readNonblankString(value.id);
  const name = readNonblankString(value.name);
  const category = readNullableText(value.category);
  const description = readNullableText(value.description);
  const imagePath = readNonblankString(value.image_path);
  const publishedAt = readTimestamp(value.published_at);
  if (
    !id || !name || category === undefined || description === undefined ||
    !isCondition(value.condition) || !imagePath || !publishedAt ||
    !Number.isSafeInteger(value.asking_value_stars) || Number(value.asking_value_stars) < 0
  ) return null;
  return {
    id,
    name,
    category,
    description,
    condition: value.condition,
    askingValueStars: Number(value.asking_value_stars),
    publishedAt,
    imagePath,
  };
}

export function serializeMarketplaceListing(
  source: MarketplaceListingCardSource,
  signedImageUrl: string | null,
): Record<string, unknown> | null {
  if (signedImageUrl !== null && !isHttpsUrl(signedImageUrl)) return null;
  return {
    id: source.id,
    name: source.name,
    category: source.category,
    description: source.description,
    condition: source.condition,
    askingValueStars: source.askingValueStars,
    publishedAt: source.publishedAt,
    imageUrl: signedImageUrl,
  };
}

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function readNullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)) ? value : null;
}
function isCondition(value: unknown): value is MarketplaceListingCardSource['condition'] {
  return value === 'EXCELLENT' || value === 'GOOD' || value === 'FAIR' || value === 'POOR';
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
