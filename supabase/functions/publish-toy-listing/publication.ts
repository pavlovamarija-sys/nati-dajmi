// @ts-ignore Deno requires explicit TypeScript extensions for shared local modules.
import { classifyPersistedValuationRow } from '../confirm-toy-condition/confirmation.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for shared local modules.
import { TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH, TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH, TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH } from '../../../shared/toy-exchange-listing-preparation.ts';

export type PublishToyListingRequest = {
  toyAnalysisItemId: string;
  name: string;
  category: string | null;
  description: string | null;
  askingValueStars: number;
};

export type PublishToyListingRequestValidation =
  | { ok: true; value: PublishToyListingRequest }
  | { ok: false; error: string };

export type ToyListingInsert = {
  owner_user_id: string;
  source_toy_analysis_item_id: string;
  source_valuation_id: string;
  name: string;
  category: string | null;
  description: string | null;
  condition: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  image_path: string;
  asking_value_stars: number;
  source_estimated_value_denars: number;
  recommendation_at_publication: 'KEEP' | 'ROTATE' | 'PASS_ON';
  status: 'AVAILABLE';
};

export type PublicationSnapshotResult =
  | { ok: true; insert: ToyListingInsert }
  | {
    ok: false;
    reason:
      | 'SOURCE_NOT_OWNED'
      | 'CROP_NOT_READY'
      | 'VALUATION_MISSING'
      | 'UNSUPPORTED_VALUATION'
      | 'CONDITION_NOT_CONFIRMED'
      | 'INVALID_SOURCE';
  };

export function classifyListingInsertError(error: unknown):
  | 'ACTIVE_LISTING_EXISTS'
  | 'PUBLICATION_FAILED' {
  return isRecord(error) && error.code === '23505'
    ? 'ACTIVE_LISTING_EXISTS'
    : 'PUBLICATION_FAILED';
}

export function parseBearerAccessToken(authorization: string | null): string | null {
  const normalized = authorization?.trim();
  if (!normalized?.startsWith('Bearer ')) {
    return null;
  }
  return readNonblankString(normalized.slice('Bearer '.length));
}

export function validatePublishToyListingRequest(
  value: unknown,
): PublishToyListingRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (!hasExactKeys(value, [
    'toyAnalysisItemId',
    'name',
    'category',
    'description',
    'askingValueStars',
  ])) {
    return { ok: false, error: 'Request body contains unsupported fields.' };
  }

  const toyAnalysisItemId = readNonblankString(value.toyAnalysisItemId);
  const name = readNonblankString(value.name);
  const category = normalizeNullableString(value.category);
  const description = normalizeNullableString(value.description);

  if (!toyAnalysisItemId) {
    return { ok: false, error: 'toyAnalysisItemId is required.' };
  }
  if (!name || name.length > TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH) {
    return { ok: false, error: 'name is invalid.' };
  }
  if (category === undefined || (category !== null && category.length > TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH)) {
    return { ok: false, error: 'category is invalid.' };
  }
  if (description === undefined || (description !== null && getTextLength(description) > TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH)) {
    return { ok: false, error: 'description is invalid.' };
  }
  if (!Number.isSafeInteger(value.askingValueStars) || Number(value.askingValueStars) < 0) {
    return { ok: false, error: 'askingValueStars is invalid.' };
  }

  return {
    ok: true,
    value: {
      toyAnalysisItemId,
      name,
      category,
      description,
      askingValueStars: Number(value.askingValueStars),
    },
  };
}

export function buildAuthoritativeListingInsert(
  request: PublishToyListingRequest,
  authenticatedUserId: string,
  sourceRow: unknown,
): PublicationSnapshotResult {
  if (!isRecord(sourceRow)) {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }

  const itemId = readNonblankString(sourceRow.id);
  const ownerUserId = readNonblankString(sourceRow.owner_user_id);
  const imagePath = readNonblankString(sourceRow.image_path);
  const recommendation = sourceRow.recommendation;

  if (!itemId || !ownerUserId || !isRecommendation(recommendation)) {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }
  if (ownerUserId !== authenticatedUserId || itemId !== request.toyAnalysisItemId) {
    return { ok: false, reason: 'SOURCE_NOT_OWNED' };
  }
  if (sourceRow.crop_expected !== true || !imagePath) {
    return { ok: false, reason: 'CROP_NOT_READY' };
  }

  const valuationRows = normalizeRelatedRows(sourceRow.toy_analysis_item_valuations);
  if (valuationRows === null) {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }
  if (valuationRows.length === 0) {
    return { ok: false, reason: 'VALUATION_MISSING' };
  }
  if (valuationRows.length !== 1) {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }

  const classification = classifyPersistedValuationRow(valuationRows[0]);
  if (classification.generation === 'v1') {
    return { ok: false, reason: 'UNSUPPORTED_VALUATION' };
  }
  if (classification.generation === 'invalid') {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }

  const valuation = classification.valuation;
  if (valuation.valuationVersion !== 'v2') {
    return { ok: false, reason: 'UNSUPPORTED_VALUATION' };
  }
  if (valuation.toyAnalysisItemId !== itemId) {
    return { ok: false, reason: 'INVALID_SOURCE' };
  }
  if (
    valuation.confirmedCondition === null ||
    valuation.conditionConfirmationType === null ||
    valuation.conditionConfirmedAt === null ||
    valuation.confirmedCondition === 'UNKNOWN'
  ) {
    return { ok: false, reason: 'CONDITION_NOT_CONFIRMED' };
  }

  return {
    ok: true,
    insert: {
      owner_user_id: authenticatedUserId,
      source_toy_analysis_item_id: itemId,
      source_valuation_id: valuation.id,
      name: request.name,
      category: request.category,
      description: request.description,
      condition: valuation.confirmedCondition,
      image_path: imagePath,
      asking_value_stars: request.askingValueStars,
      source_estimated_value_denars: valuation.estimatedValueDenars,
      recommendation_at_publication: recommendation,
      status: 'AVAILABLE',
    },
  };
}

function normalizeRelatedRows(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }
  if (isRecord(value)) {
    return [value];
  }
  return value === null ? [] : null;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim() || null;
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getTextLength(value: string): number {
  return Array.from(value).length;
}

function isRecommendation(value: unknown): value is 'KEEP' | 'ROTATE' | 'PASS_ON' {
  return value === 'KEEP' || value === 'ROTATE' || value === 'PASS_ON';
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
