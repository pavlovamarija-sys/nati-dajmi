import { supabase } from '@/lib/supabase/client';
import { parseOwnerToyExchangeListing } from '../../../../shared/toy-exchange-owner-listing';
import type { ToyExchangeListing } from '@/features/toy-exchange/types/toy-exchange-listing';

const OWNER_LISTING_SELECT = `
  id,
  source_toy_analysis_item_id,
  name,
  category,
  description,
  condition,
  image_path,
  asking_value_stars,
  source_estimated_value_denars,
  recommendation_at_publication,
  status,
  created_at,
  published_at,
  withdrawn_at
`;

const SIGNED_IMAGE_URL_LIFETIME_SECONDS = 30 * 60;

export async function getOwnerToyExchangeListings(): Promise<ToyExchangeListing[]> {
  const { data, error } = await supabase
    .from('toy_exchange_listings')
    .select(OWNER_LISTING_SELECT)
    .in('status', ['AVAILABLE', 'WITHDRAWN'])
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load toy exchange listings.');
  if (!Array.isArray(data)) throw new Error('Toy exchange listings returned malformed data.');

  try {
    return data.map(parseOwnerToyExchangeListing);
  } catch {
    throw new Error('Toy exchange listings returned malformed data.');
  }
}

export async function createToyExchangeListingImageUrl(imagePath: string): Promise<string | null> {
  if (!readNonblankString(imagePath)) return null;
  const { data, error } = await supabase.storage
    .from('toy-shelf-images')
    .createSignedUrl(imagePath, SIGNED_IMAGE_URL_LIFETIME_SECONDS);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

const LISTING_SOURCE_SELECT = `
  id,
  name,
  category,
  recommendation,
  image_path,
  crop_expected,
  toy_analysis_item_valuations (
    id,
    toy_analysis_item_id,
    estimated_value_denars,
    confidence,
    valuation_method,
    valuation_version,
    base_second_hand_value_denars,
    base_value_confidence,
    ai_condition,
    ai_condition_confidence,
    ai_condition_notes,
    confirmed_condition,
    condition_confirmation_type,
    condition_confirmed_at,
    condition_adjustment_basis_points
  )
`;

export async function getAuthoritativeToyExchangeListingSource(
  toyAnalysisItemId: string,
): Promise<unknown | null> {
  const normalizedItemId = readNonblankString(toyAnalysisItemId);

  if (!normalizedItemId) {
    throw new Error('A valid toy analysis item ID is required.');
  }

  const { data, error } = await supabase
    .from('toy_analysis_items')
    .select(LISTING_SOURCE_SELECT)
    .eq('id', normalizedItemId)
    .maybeSingle();

  if (error) {
    throw new Error('Could not prepare the toy for exchange.');
  }

  return data === null ? null : mapAuthoritativeSourceRow(data);
}

function mapAuthoritativeSourceRow(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const valuations = value.toy_analysis_item_valuations;
  let valuation: unknown;

  if (Array.isArray(valuations)) {
    valuation = valuations.length === 0
      ? null
      : valuations.length === 1
        ? mapValuationRow(valuations[0])
        : valuations;
  } else {
    valuation = valuations === null ? null : mapValuationRow(valuations);
  }

  return {
    id: value.id,
    name: value.name,
    category: value.category,
    recommendation: value.recommendation,
    imagePath: value.image_path,
    cropExpected: value.crop_expected,
    valuation,
  };
}

function mapValuationRow(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    id: value.id,
    toyAnalysisItemId: value.toy_analysis_item_id,
    estimatedValueDenars: value.estimated_value_denars,
    confidence: value.confidence,
    valuationMethod: value.valuation_method,
    valuationVersion: value.valuation_version,
    baseSecondHandValueDenars: value.base_second_hand_value_denars,
    baseValueConfidence: value.base_value_confidence,
    aiCondition: value.ai_condition,
    aiConditionConfidence: value.ai_condition_confidence,
    aiConditionNotes: value.ai_condition_notes,
    confirmedCondition: value.confirmed_condition,
    conditionConfirmationType: value.condition_confirmation_type,
    conditionConfirmedAt: value.condition_confirmed_at,
    conditionAdjustmentBasisPoints: value.condition_adjustment_basis_points,
  };
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
