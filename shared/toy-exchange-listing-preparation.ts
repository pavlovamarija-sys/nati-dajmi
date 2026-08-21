export const TOY_EXCHANGE_RECOMMENDATIONS = [
  'KEEP',
  'ROTATE',
  'PASS_ON',
] as const;

export const LISTABLE_TOY_CONDITIONS = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'POOR',
] as const;

export const TOY_EXCHANGE_LISTING_NAME_MAX_LENGTH = 120;
export const TOY_EXCHANGE_LISTING_CATEGORY_MAX_LENGTH = 80;
export const TOY_EXCHANGE_LISTING_DESCRIPTION_MAX_LENGTH = 1000;

export type ToyExchangeRecommendation =
  (typeof TOY_EXCHANGE_RECOMMENDATIONS)[number];
export type ListableToyCondition = (typeof LISTABLE_TOY_CONDITIONS)[number];

export type PreparedToyExchangeListing = {
  sourceToyAnalysisItemId: string;
  sourceValuationId: string;
  name: string;
  category: string | null;
  recommendation: ToyExchangeRecommendation;
  imagePath: string;
  confirmedCondition: ListableToyCondition;
  sourceEstimatedValueDenars: number;
  suggestedAskingValueStars: number;
};

export type ToyExchangeListingPreparationFailure =
  | 'SOURCE_NOT_FOUND'
  | 'CROP_NOT_READY'
  | 'VALUATION_MISSING'
  | 'CONDITION_NOT_CONFIRMED'
  | 'UNSUPPORTED_VALUATION'
  | 'INVALID_AUTHORITATIVE_DATA';

export type ToyExchangeListingEligibilityResult =
  | { status: 'READY'; listing: PreparedToyExchangeListing }
  | { status: ToyExchangeListingPreparationFailure };

export function evaluateToyExchangeListingSource(
  value: unknown,
): ToyExchangeListingEligibilityResult {
  if (value === null) {
    return { status: 'SOURCE_NOT_FOUND' };
  }

  if (!isRecord(value)) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  const sourceToyAnalysisItemId = readNonblankString(value.id);
  const name = readNonblankString(value.name);
  const category = readNullableNonblankString(value.category);
  const recommendation = value.recommendation;
  const imagePath = readNullableNonblankString(value.imagePath);

  if (
    !sourceToyAnalysisItemId ||
    !name ||
    category === undefined ||
    !isToyExchangeRecommendation(recommendation) ||
    imagePath === undefined
  ) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  if (value.cropExpected !== true || imagePath === null) {
    return { status: 'CROP_NOT_READY' };
  }

  if (value.valuation === null) {
    return { status: 'VALUATION_MISSING' };
  }

  if (!isRecord(value.valuation)) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  const valuation = value.valuation;
  const sourceValuationId = readNonblankString(valuation.id);
  const valuationItemId = readNonblankString(valuation.toyAnalysisItemId);
  const valuationMethod = readNonblankString(valuation.valuationMethod);
  const valuationVersion = readNonblankString(valuation.valuationVersion);

  if (!sourceValuationId || !valuationItemId || !valuationMethod || !valuationVersion) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  if (valuationItemId !== sourceToyAnalysisItemId) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  if (valuationVersion !== 'v2' || hasOnlyNullV2Fields(valuation)) {
    return { status: 'UNSUPPORTED_VALUATION' };
  }

  if (!hasValidV2Provenance(valuation)) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  if (
    valuation.confirmedCondition === null ||
    valuation.conditionConfirmationType === null ||
    valuation.conditionConfirmedAt === null ||
    valuation.confirmedCondition === 'UNKNOWN'
  ) {
    return { status: 'CONDITION_NOT_CONFIRMED' };
  }

  if (!isListableToyCondition(valuation.confirmedCondition)) {
    return { status: 'INVALID_AUTHORITATIVE_DATA' };
  }

  const estimatedValueDenars = Number(valuation.estimatedValueDenars);

  return {
    status: 'READY',
    listing: {
      sourceToyAnalysisItemId,
      sourceValuationId,
      name,
      category,
      recommendation,
      imagePath,
      confirmedCondition: valuation.confirmedCondition,
      sourceEstimatedValueDenars: estimatedValueDenars,
      suggestedAskingValueStars: estimatedValueDenars,
    },
  };
}

function hasOnlyNullV2Fields(value: Record<string, unknown>): boolean {
  return [
    value.baseSecondHandValueDenars,
    value.baseValueConfidence,
    value.aiCondition,
    value.aiConditionConfidence,
    value.aiConditionNotes,
    value.confirmedCondition,
    value.conditionConfirmationType,
    value.conditionConfirmedAt,
    value.conditionAdjustmentBasisPoints,
  ].every((field) => field === null);
}

function hasValidV2Provenance(value: Record<string, unknown>): boolean {
  const confirmationType = value.conditionConfirmationType;
  const confirmedCondition = value.confirmedCondition;

  return (
    isNonnegativeInteger(value.baseSecondHandValueDenars) &&
    isValidConfidence(value.baseValueConfidence) &&
    isToyCondition(value.aiCondition) &&
    isValidConfidence(value.aiConditionConfidence) &&
    isNonblankStringArray(value.aiConditionNotes) &&
    (confirmedCondition === null || isToyCondition(confirmedCondition)) &&
    (
      confirmationType === null ||
      confirmationType === 'ACCEPTED_AI' ||
      confirmationType === 'CORRECTED'
    ) &&
    isNullableTimestamp(value.conditionConfirmedAt) &&
    Number.isInteger(value.conditionAdjustmentBasisPoints) &&
    Number(value.conditionAdjustmentBasisPoints) >= -10000 &&
    Number(value.conditionAdjustmentBasisPoints) <= 10000 &&
    isNonnegativeInteger(value.estimatedValueDenars) &&
    isValidConfidence(value.confidence) &&
    (
      confirmationType !== 'ACCEPTED_AI' ||
      confirmedCondition === value.aiCondition
    ) &&
    (
      (confirmedCondition === null &&
        confirmationType === null &&
        value.conditionConfirmedAt === null) ||
      (confirmedCondition !== null &&
        confirmationType !== null &&
        isTimestamp(value.conditionConfirmedAt))
    )
  );
}

function isToyExchangeRecommendation(
  value: unknown,
): value is ToyExchangeRecommendation {
  return typeof value === 'string' &&
    (TOY_EXCHANGE_RECOMMENDATIONS as readonly string[]).includes(value);
}

function isListableToyCondition(value: unknown): value is ListableToyCondition {
  return typeof value === 'string' &&
    (LISTABLE_TOY_CONDITIONS as readonly string[]).includes(value);
}

function isToyCondition(value: unknown): boolean {
  return isListableToyCondition(value) || value === 'UNKNOWN';
}

function isNonnegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isValidConfidence(value: unknown): boolean {
  return value === null || (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isNonblankStringArray(value: unknown): boolean {
  return Array.isArray(value) &&
    value.every((item) => Boolean(readNonblankString(item)));
}

function isNullableTimestamp(value: unknown): boolean {
  return value === null || isTimestamp(value);
}

function isTimestamp(value: unknown): boolean {
  return typeof value === 'string' &&
    Boolean(value.trim()) &&
    !Number.isNaN(Date.parse(value));
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNullableNonblankString(
  value: unknown,
): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readNonblankString(value) ?? undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
