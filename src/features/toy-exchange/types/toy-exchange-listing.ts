export type {
  ListableToyCondition,
  PreparedToyExchangeListing,
  ToyExchangeListingEligibilityResult,
  ToyExchangeListingPreparationFailure,
  ToyExchangeRecommendation,
} from '../../../../shared/toy-exchange-listing-preparation';

export type ToyExchangeListingPreparationResult =
  | import('../../../../shared/toy-exchange-listing-preparation').ToyExchangeListingEligibilityResult
  | { status: 'UNAUTHENTICATED' };

export type PublishedToyExchangeListing = {
  id: string;
  sourceToyAnalysisItemId: string;
  name: string;
  category: string | null;
  description: string | null;
  condition: import('../../../../shared/toy-exchange-listing-preparation').ListableToyCondition;
  askingValueStars: number;
  status: 'AVAILABLE';
  publishedAt: string;
};

export type {
  OwnerToyExchangeListing as ToyExchangeListing,
  ToyExchangeListingStatus,
} from '../../../../shared/toy-exchange-owner-listing';
