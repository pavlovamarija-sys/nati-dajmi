import { shouldWarnAboutHighAskingPrice } from './suggested-toy-price';
import type { ToyValuationCondition } from './toy-valuation-policy';

export function hasSuggestedToyPriceRange(
  condition: ToyValuationCondition,
): boolean {
  return condition !== 'POOR';
}

export function shouldWarnForToyAskingPrice(
  condition: ToyValuationCondition,
  askingPrice: number,
  suggestedMaximumDenars: number,
): boolean {
  return hasSuggestedToyPriceRange(condition) &&
    shouldWarnAboutHighAskingPrice(askingPrice, suggestedMaximumDenars);
}
