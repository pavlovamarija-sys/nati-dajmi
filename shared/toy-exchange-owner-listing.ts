export type ToyExchangeListingStatus = 'AVAILABLE' | 'WITHDRAWN';

export type OwnerToyExchangeListing = {
  id: string;
  sourceToyAnalysisItemId: string;
  name: string;
  category: string | null;
  description: string | null;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  imagePath: string;
  askingValueStars: number;
  sourceEstimatedValueDenars: number;
  recommendationAtPublication: 'KEEP' | 'ROTATE' | 'PASS_ON';
  status: ToyExchangeListingStatus;
  createdAt: string;
  publishedAt: string | null;
  withdrawnAt: string | null;
};

export function parseOwnerToyExchangeListing(value: unknown): OwnerToyExchangeListing {
  if (!isRecord(value)) {
    throw new Error('Malformed toy exchange listing.');
  }

  const id = readNonblankString(value.id);
  const sourceToyAnalysisItemId = readNonblankString(value.source_toy_analysis_item_id);
  const name = readNonblankString(value.name);
  const category = readNullableText(value.category);
  const description = readNullableText(value.description);
  const imagePath = readNonblankString(value.image_path);
  const createdAt = readTimestamp(value.created_at);
  const publishedAt = readNullableTimestamp(value.published_at);
  const withdrawnAt = readNullableTimestamp(value.withdrawn_at);

  if (
    !id || !sourceToyAnalysisItemId || !name || category === undefined ||
    description === undefined || !isCondition(value.condition) || !imagePath ||
    !Number.isSafeInteger(value.asking_value_stars) || Number(value.asking_value_stars) < 0 ||
    !Number.isSafeInteger(value.source_estimated_value_denars) || Number(value.source_estimated_value_denars) < 0 ||
    !isRecommendation(value.recommendation_at_publication) || !isStatus(value.status) ||
    !createdAt || publishedAt === undefined || withdrawnAt === undefined ||
    (value.status === 'AVAILABLE' && (!publishedAt || withdrawnAt !== null)) ||
    (value.status === 'WITHDRAWN' && withdrawnAt === null)
  ) {
    throw new Error('Malformed toy exchange listing.');
  }

  return {
    id,
    sourceToyAnalysisItemId,
    name,
    category,
    description,
    condition: value.condition,
    imagePath,
    askingValueStars: Number(value.asking_value_stars),
    sourceEstimatedValueDenars: Number(value.source_estimated_value_denars),
    recommendationAtPublication: value.recommendation_at_publication,
    status: value.status,
    createdAt,
    publishedAt,
    withdrawnAt,
  };
}

export function beginToyExchangeListingWithdrawal(inFlightIds: Set<string>, listingId: string): boolean {
  if (inFlightIds.has(listingId)) return false;
  inFlightIds.add(listingId);
  return true;
}

export function finishToyExchangeListingWithdrawal(inFlightIds: Set<string>, listingId: string): void {
  inFlightIds.delete(listingId);
}

function readNullableText(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value)) ? value : null;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
  return value === null ? null : readTimestamp(value) ?? undefined;
}

function isCondition(value: unknown): value is OwnerToyExchangeListing['condition'] {
  return value === 'EXCELLENT' || value === 'GOOD' || value === 'FAIR' || value === 'POOR';
}

function isRecommendation(value: unknown): value is OwnerToyExchangeListing['recommendationAtPublication'] {
  return value === 'KEEP' || value === 'ROTATE' || value === 'PASS_ON';
}

function isStatus(value: unknown): value is ToyExchangeListingStatus {
  return value === 'AVAILABLE' || value === 'WITHDRAWN';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
