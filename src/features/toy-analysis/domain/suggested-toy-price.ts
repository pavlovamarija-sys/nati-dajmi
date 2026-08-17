export const SUGGESTED_PRICE_MIN_MULTIPLIER = 0.8;
export const SUGGESTED_PRICE_MAX_MULTIPLIER = 1.2;
export const ASKING_PRICE_WARNING_MULTIPLIER = 1.3;

export type SuggestedToyPriceRange = {
  minDenars: number;
  maxDenars: number;
};

export function getSuggestedToyPriceRange(
  estimatedValueDenars: number,
): SuggestedToyPriceRange {
  if (!Number.isInteger(estimatedValueDenars) || estimatedValueDenars < 0) {
    throw new Error('Estimated value must be a nonnegative integer.');
  }

  if (estimatedValueDenars === 0) {
    return { minDenars: 0, maxDenars: 0 };
  }

  const minDenars = roundPracticalDenars(
    estimatedValueDenars * SUGGESTED_PRICE_MIN_MULTIPLIER,
  );
  const maxDenars = Math.max(
    minDenars,
    roundPracticalDenars(estimatedValueDenars * SUGGESTED_PRICE_MAX_MULTIPLIER),
  );

  return { minDenars, maxDenars };
}

export function shouldWarnAboutHighAskingPrice(
  askingPrice: number,
  suggestedMaximumDenars: number,
): boolean {
  if (!isValidAskingPrice(askingPrice) ||
      !Number.isInteger(suggestedMaximumDenars) ||
      suggestedMaximumDenars < 0) {
    return false;
  }

  return askingPrice > suggestedMaximumDenars * ASKING_PRICE_WARNING_MULTIPLIER;
}

export function isValidAskingPrice(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function roundPracticalDenars(value: number): number {
  if (value === 0) {
    return 0;
  }

  const increment = value < 500 ? 25 : 50;
  return Math.max(increment, Math.round(value / increment) * increment);
}
