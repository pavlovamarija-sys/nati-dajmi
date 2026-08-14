import type { ToyValuation } from '@/features/toy-analysis/types/toy-valuation';
import { supabase } from '@/lib/supabase/client';

const VALUATION_SELECT = `
  id,
  toy_analysis_item_id,
  estimated_value_denars,
  confidence,
  valuation_method,
  valuation_version,
  created_at
`;

export type UpsertToyValuationInput = {
  toyAnalysisItemId: string;
  estimatedValueDenars: number;
  confidence: number | null;
  valuationMethod: string;
  valuationVersion: string;
};

export async function upsertToyValuation(
  input: UpsertToyValuationInput,
): Promise<ToyValuation> {
  const validated = validateUpsertInput(input);
  const { data, error } = await supabase
    .from('toy_analysis_item_valuations')
    .upsert(
      {
        toy_analysis_item_id: validated.toyAnalysisItemId,
        estimated_value_denars: validated.estimatedValueDenars,
        confidence: validated.confidence,
        valuation_method: validated.valuationMethod,
        valuation_version: validated.valuationVersion,
      },
      { onConflict: 'toy_analysis_item_id' },
    )
    .select(VALUATION_SELECT)
    .single();

  if (error) {
    throw new Error('Could not save the toy valuation.', { cause: error });
  }

  return parsePersistedToyValuation(data);
}

export async function getToyValuation(
  toyAnalysisItemId: string,
): Promise<ToyValuation | null> {
  const normalizedItemId = readNonblankString(toyAnalysisItemId);

  if (!normalizedItemId) {
    throw new Error('A valid toy analysis item ID is required.');
  }

  const { data, error } = await supabase
    .from('toy_analysis_item_valuations')
    .select(VALUATION_SELECT)
    .eq('toy_analysis_item_id', normalizedItemId)
    .maybeSingle();

  if (error) {
    throw new Error('Could not load the toy valuation.', { cause: error });
  }

  return data === null ? null : parsePersistedToyValuation(data);
}

function validateUpsertInput(input: UpsertToyValuationInput): UpsertToyValuationInput {
  const toyAnalysisItemId = readNonblankString(input.toyAnalysisItemId);
  const valuationMethod = readNonblankString(input.valuationMethod);
  const valuationVersion = readNonblankString(input.valuationVersion);

  if (!toyAnalysisItemId) {
    throw new Error('A valid toy analysis item ID is required.');
  }

  if (!Number.isInteger(input.estimatedValueDenars) || input.estimatedValueDenars < 0) {
    throw new Error('Estimated value must be a nonnegative integer.');
  }

  if (!isValidConfidence(input.confidence)) {
    throw new Error('Valuation confidence must be null or between 0 and 1.');
  }

  if (!valuationMethod) {
    throw new Error('A valuation method is required.');
  }

  if (!valuationVersion) {
    throw new Error('A valuation version is required.');
  }

  return {
    toyAnalysisItemId,
    estimatedValueDenars: input.estimatedValueDenars,
    confidence: input.confidence,
    valuationMethod,
    valuationVersion,
  };
}

function parsePersistedToyValuation(value: unknown): ToyValuation {
  if (!isRecord(value)) {
    throw new Error('The persisted toy valuation contains malformed data.');
  }

  const id = readNonblankString(value.id);
  const toyAnalysisItemId = readNonblankString(value.toy_analysis_item_id);
  const estimatedValueDenars = value.estimated_value_denars;
  const confidence = value.confidence;
  const valuationMethod = readNonblankString(value.valuation_method);
  const valuationVersion = readNonblankString(value.valuation_version);
  const createdAt = readTimestamp(value.created_at);

  if (
    !id ||
    !toyAnalysisItemId ||
    !Number.isInteger(estimatedValueDenars) ||
    Number(estimatedValueDenars) < 0 ||
    !isValidConfidence(confidence) ||
    !valuationMethod ||
    !valuationVersion
  ) {
    throw new Error('The persisted toy valuation contains malformed data.');
  }

  return {
    id,
    toyAnalysisItemId,
    estimatedValueDenars: Number(estimatedValueDenars),
    confidence,
    valuationMethod,
    valuationVersion,
    createdAt,
  };
}

function isValidConfidence(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('The persisted toy valuation contains malformed data.');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
