import {
  isParentReportedToyIssue,
  isToyConditionConfirmationType,
  isToyValuationCondition,
  type ImageAwareToyValuation,
  type ParentReportedToyIssue,
  type PersistedToyValuation,
  type ToyCondition,
  type ToyValuation,
} from '@/features/toy-analysis/types/toy-valuation';
import { supabase } from '@/lib/supabase/client';

const VALUATION_SELECT = `
  id,
  toy_analysis_item_id,
  estimated_value_denars,
  confidence,
  valuation_method,
  valuation_version,
  created_at,
  base_second_hand_value_denars,
  base_value_confidence,
  ai_condition,
  ai_condition_confidence,
  ai_condition_notes,
  confirmed_condition,
  condition_confirmation_type,
  condition_confirmed_at,
  parent_reported_issues,
  parent_condition_note,
  condition_adjustment_basis_points,
  updated_at
`;

export type UpsertToyValuationInput = {
  toyAnalysisItemId: string;
  baseSecondHandValueDenars: number;
  baseValueConfidence: number | null;
  aiCondition: ToyCondition;
  aiConditionConfidence: number | null;
  aiConditionNotes: readonly string[];
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
  confidence: number | null;
  valuationMethod: string;
  valuationVersion: string;
};

export async function upsertToyValuation(
  input: UpsertToyValuationInput,
): Promise<ImageAwareToyValuation> {
  const validated = validateUpsertInput(input);
  const { data, error } = await supabase
    .from('toy_analysis_item_valuations')
    .upsert(
      {
        toy_analysis_item_id: validated.toyAnalysisItemId,
        base_second_hand_value_denars: validated.baseSecondHandValueDenars,
        base_value_confidence: validated.baseValueConfidence,
        ai_condition: validated.aiCondition,
        ai_condition_confidence: validated.aiConditionConfidence,
        ai_condition_notes: validated.aiConditionNotes,
        confirmed_condition: null,
        condition_confirmation_type: null,
        condition_confirmed_at: null,
        parent_reported_issues: [],
        parent_condition_note: null,
        condition_adjustment_basis_points:
          validated.conditionAdjustmentBasisPoints,
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
    throw new Error('Could not save the toy valuation.');
  }

  const persisted = parsePersistedToyValuation(data);

  if (persisted.generation !== 'v2') {
    throw new Error('Could not save the toy valuation.');
  }

  return persisted;
}

export async function getToyValuation(
  toyAnalysisItemId: string,
): Promise<PersistedToyValuation | null> {
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
    throw new Error('Could not load the toy valuation.');
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

  if (
    !Number.isInteger(input.baseSecondHandValueDenars) ||
    input.baseSecondHandValueDenars < 0
  ) {
    throw new Error('Base second-hand value must be a nonnegative integer.');
  }

  if (!isValidConfidence(input.baseValueConfidence)) {
    throw new Error('Base-value confidence must be null or between 0 and 1.');
  }

  if (!isToyValuationCondition(input.aiCondition)) {
    throw new Error('AI-assessed condition is invalid.');
  }

  if (!isValidConfidence(input.aiConditionConfidence)) {
    throw new Error('AI condition confidence must be null or between 0 and 1.');
  }

  if (!isNonblankStringArray(input.aiConditionNotes)) {
    throw new Error('AI condition notes are invalid.');
  }

  if (
    !Number.isInteger(input.conditionAdjustmentBasisPoints) ||
    input.conditionAdjustmentBasisPoints < -10000 ||
    input.conditionAdjustmentBasisPoints > 10000
  ) {
    throw new Error('Condition adjustment is invalid.');
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
    baseSecondHandValueDenars: input.baseSecondHandValueDenars,
    baseValueConfidence: input.baseValueConfidence,
    aiCondition: input.aiCondition,
    aiConditionConfidence: input.aiConditionConfidence,
    aiConditionNotes: input.aiConditionNotes.map((note) => note.trim()),
    conditionAdjustmentBasisPoints: input.conditionAdjustmentBasisPoints,
    estimatedValueDenars: input.estimatedValueDenars,
    confidence: input.confidence,
    valuationMethod,
    valuationVersion,
  };
}

function parsePersistedToyValuation(value: unknown): PersistedToyValuation {
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

  const base = {
    id,
    toyAnalysisItemId,
    estimatedValueDenars: Number(estimatedValueDenars),
    confidence,
    valuationMethod,
    valuationVersion,
    createdAt,
  };

  if (hasOnlyNullV2Fields(value)) {
    return {
      ...base,
      generation: 'v1',
    };
  }

  return parseImageAwareToyValuation(value, base);
}

function parseImageAwareToyValuation(
  value: Record<string, unknown>,
  base: Omit<ToyValuation, 'generation'>,
): ImageAwareToyValuation {
  const baseSecondHandValueDenars = value.base_second_hand_value_denars;
  const baseValueConfidence = value.base_value_confidence;
  const aiCondition = value.ai_condition;
  const aiConditionConfidence = value.ai_condition_confidence;
  const aiConditionNotes = value.ai_condition_notes;
  const confirmedCondition = value.confirmed_condition;
  const conditionConfirmationType = value.condition_confirmation_type;
  const conditionConfirmedAt = readNullableTimestamp(value.condition_confirmed_at);
  const parentReportedIssues = value.parent_reported_issues;
  const parentConditionNote = readNullableNonblankString(value.parent_condition_note);
  const conditionAdjustmentBasisPoints = value.condition_adjustment_basis_points;
  const updatedAt = readTimestamp(value.updated_at);

  const confirmationIsEmpty = confirmedCondition === null &&
    conditionConfirmationType === null &&
    conditionConfirmedAt === null;
  const confirmationIsComplete = isToyValuationCondition(confirmedCondition) &&
    isToyConditionConfirmationType(conditionConfirmationType) &&
    conditionConfirmedAt !== null;

  if (
    !Number.isInteger(baseSecondHandValueDenars) ||
    Number(baseSecondHandValueDenars) < 0 ||
    !isValidConfidence(baseValueConfidence) ||
    !isToyValuationCondition(aiCondition) ||
    !isValidConfidence(aiConditionConfidence) ||
    !isNonblankStringArray(aiConditionNotes) ||
    !(confirmationIsEmpty || confirmationIsComplete) ||
    (
      conditionConfirmationType === 'ACCEPTED_AI' &&
      confirmedCondition !== aiCondition
    ) ||
    !isParentReportedIssueArray(parentReportedIssues) ||
    parentConditionNote === undefined ||
    !Number.isInteger(conditionAdjustmentBasisPoints) ||
    Number(conditionAdjustmentBasisPoints) < -10000 ||
    Number(conditionAdjustmentBasisPoints) > 10000
  ) {
    throw new Error('The persisted toy valuation contains malformed data.');
  }

  return {
    ...base,
    generation: 'v2',
    baseSecondHandValueDenars: Number(baseSecondHandValueDenars),
    baseValueConfidence,
    aiCondition,
    aiConditionConfidence,
    aiConditionNotes: aiConditionNotes.map((note) => note.trim()),
    confirmedCondition: confirmationIsComplete ? confirmedCondition : null,
    conditionConfirmationType:
      confirmationIsComplete ? conditionConfirmationType : null,
    conditionConfirmedAt: confirmationIsComplete ? conditionConfirmedAt : null,
    parentReportedIssues,
    parentConditionNote,
    conditionAdjustmentBasisPoints: Number(conditionAdjustmentBasisPoints),
    updatedAt,
  };
}

const V2_FIELD_NAMES = [
  'base_second_hand_value_denars',
  'base_value_confidence',
  'ai_condition',
  'ai_condition_confidence',
  'ai_condition_notes',
  'confirmed_condition',
  'condition_confirmation_type',
  'condition_confirmed_at',
  'parent_reported_issues',
  'parent_condition_note',
  'condition_adjustment_basis_points',
] as const;

function hasOnlyNullV2Fields(value: Record<string, unknown>): boolean {
  return V2_FIELD_NAMES.every((fieldName) => value[fieldName] === null);
}

function isNonblankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => Boolean(readNonblankString(item)));
}

function isParentReportedIssueArray(
  value: unknown,
): value is ParentReportedToyIssue[] {
  return Array.isArray(value) && value.every(isParentReportedToyIssue);
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

function readNullableNonblankString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readNonblankString(value) ?? undefined;
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

function readNullableTimestamp(value: unknown): string | null {
  return value === null ? null : readTimestamp(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
