export type MarketplaceListing = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  askingValueStars: number;
  publishedAt: string;
  imageUrl: string | null;
};

const CARD_KEYS = ['id', 'name', 'category', 'description', 'condition', 'askingValueStars', 'publishedAt', 'imageUrl'];

export function parseMarketplaceResponse(value: unknown): MarketplaceListing[] {
  if (!isRecord(value) || !hasExactKeys(value, ['listings']) || !Array.isArray(value.listings)) throw new Error('Marketplace returned malformed data.');
  return value.listings.map(parseCard);
}
function parseCard(value: unknown): MarketplaceListing {
  if (!isRecord(value) || !hasExactKeys(value, CARD_KEYS)) throw new Error('Marketplace returned malformed data.');
  const id = readNonblankString(value.id); const name = readNonblankString(value.name);
  const category = readNullableText(value.category); const description = readNullableText(value.description);
  const publishedAt = readTimestamp(value.publishedAt); const imageUrl = value.imageUrl === null ? null : readHttpsUrl(value.imageUrl);
  if (!id || !name || category === undefined || description === undefined || !isCondition(value.condition) || !Number.isSafeInteger(value.askingValueStars) || Number(value.askingValueStars) < 0 || !publishedAt || imageUrl === undefined) throw new Error('Marketplace returned malformed data.');
  return { id, name, category, description, condition: value.condition, askingValueStars: Number(value.askingValueStars), publishedAt, imageUrl };
}
function readHttpsUrl(value: unknown): string | undefined { if (typeof value !== 'string') return undefined; try { return new URL(value).protocol === 'https:' ? value : undefined; } catch { return undefined; } }
function readNullableText(value: unknown): string | null | undefined { return value === null ? null : typeof value === 'string' && value.trim() ? value : undefined; }
function readNonblankString(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function readTimestamp(value: unknown): string | null { return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)) ? value : null; }
function isCondition(value: unknown): value is MarketplaceListing['condition'] { return value === 'EXCELLENT' || value === 'GOOD' || value === 'FAIR' || value === 'POOR'; }
function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
