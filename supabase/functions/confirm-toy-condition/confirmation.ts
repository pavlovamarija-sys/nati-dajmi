// @ts-ignore Deno requires explicit TypeScript extensions for shared local modules.
import { calculateToyValuation, isParentReportedToyIssue, isToyConditionConfirmationType, isToyValuationCondition, type ParentReportedToyIssue, type ToyConditionConfirmationType, type ToyValuationCondition } from '../../../shared/toy-valuation-policy.ts';
// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type { ConfirmToyConditionRequest } from './validation.ts';

export type PersistedV2ToyValuation = {
  id: string;
  toyAnalysisItemId: string;
  baseSecondHandValueDenars: number;
  baseValueConfidence: number | null;
  aiCondition: ToyValuationCondition;
  aiConditionConfidence: number | null;
  aiConditionNotes: string[];
  confirmedCondition: ToyValuationCondition | null;
  conditionConfirmationType: ToyConditionConfirmationType | null;
  conditionConfirmedAt: string | null;
  parentReportedIssues: ParentReportedToyIssue[];
  parentConditionNote: string | null;
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
  confidence: number | null;
  valuationMethod: string;
  valuationVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type PersistedValuationClassification =
  | { generation: 'v1' }
  | { generation: 'v2'; valuation: PersistedV2ToyValuation }
  | { generation: 'invalid' };

export type ToyConditionConfirmationUpdate = {
  confirmedCondition: ToyValuationCondition;
  conditionConfirmationType: ToyConditionConfirmationType;
  conditionConfirmedAt: string;
  parentReportedIssues: ParentReportedToyIssue[];
  parentConditionNote: string | null;
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
  confidence: number | null;
};

const V2_FIELDS = [
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

export function classifyPersistedValuationRow(
  value: unknown,
): PersistedValuationClassification {
  if (!isRecord(value)) {
    return { generation: 'invalid' };
  }

  if (V2_FIELDS.every((field) => value[field] === null)) {
    return { generation: 'v1' };
  }

  const id = readNonblankString(value.id);
  const toyAnalysisItemId = readNonblankString(value.toy_analysis_item_id);
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
  const estimatedValueDenars = value.estimated_value_denars;
  const confidence = value.confidence;
  const valuationMethod = readNonblankString(value.valuation_method);
  const valuationVersion = readNonblankString(value.valuation_version);
  const createdAt = readTimestamp(value.created_at);
  const updatedAt = readTimestamp(value.updated_at);
  const confirmationIsEmpty = confirmedCondition === null &&
    conditionConfirmationType === null && conditionConfirmedAt === null;
  const confirmationIsComplete = isToyValuationCondition(confirmedCondition) &&
    isToyConditionConfirmationType(conditionConfirmationType) &&
    conditionConfirmedAt !== null;

  if (
    !id ||
    !toyAnalysisItemId ||
    !Number.isInteger(baseSecondHandValueDenars) ||
    Number(baseSecondHandValueDenars) < 0 ||
    !isValidConfidence(baseValueConfidence) ||
    !isToyValuationCondition(aiCondition) ||
    !isValidConfidence(aiConditionConfidence) ||
    !isNonblankStringArray(aiConditionNotes) ||
    !(confirmationIsEmpty || confirmationIsComplete) ||
    (conditionConfirmationType === 'ACCEPTED_AI' && confirmedCondition !== aiCondition) ||
    !isParentIssueArray(parentReportedIssues) ||
    parentConditionNote === undefined ||
    !Number.isInteger(conditionAdjustmentBasisPoints) ||
    Number(conditionAdjustmentBasisPoints) < -10000 ||
    Number(conditionAdjustmentBasisPoints) > 10000 ||
    !Number.isInteger(estimatedValueDenars) ||
    Number(estimatedValueDenars) < 0 ||
    !isValidConfidence(confidence) ||
    !valuationMethod ||
    !valuationVersion ||
    !createdAt ||
    !updatedAt
  ) {
    return { generation: 'invalid' };
  }

  return {
    generation: 'v2',
    valuation: {
      id,
      toyAnalysisItemId,
      baseSecondHandValueDenars: Number(baseSecondHandValueDenars),
      baseValueConfidence,
      aiCondition,
      aiConditionConfidence,
      aiConditionNotes: aiConditionNotes.map((note) => note.trim()),
      confirmedCondition: confirmationIsComplete ? confirmedCondition : null,
      conditionConfirmationType: confirmationIsComplete
        ? conditionConfirmationType
        : null,
      conditionConfirmedAt: confirmationIsComplete ? conditionConfirmedAt! : null,
      parentReportedIssues,
      parentConditionNote,
      conditionAdjustmentBasisPoints: Number(conditionAdjustmentBasisPoints),
      estimatedValueDenars: Number(estimatedValueDenars),
      confidence,
      valuationMethod,
      valuationVersion,
      createdAt,
      updatedAt,
    },
  };
}

export function buildToyConditionConfirmationUpdate(
  valuation: PersistedV2ToyValuation,
  request: ConfirmToyConditionRequest,
  confirmedAt: string,
): ToyConditionConfirmationUpdate {
  const timestamp = readTimestamp(confirmedAt);
  if (!timestamp) {
    throw new Error('Confirmation timestamp is invalid.');
  }

  const calculation = calculateToyValuation(
    valuation.baseSecondHandValueDenars,
    request.confirmedCondition,
  );

  return {
    confirmedCondition: request.confirmedCondition,
    conditionConfirmationType: request.confirmedCondition === valuation.aiCondition
      ? 'ACCEPTED_AI'
      : 'CORRECTED',
    conditionConfirmedAt: timestamp,
    parentReportedIssues: [...request.parentReportedIssues],
    parentConditionNote: request.parentConditionNote,
    ...calculation,
    confidence: valuation.baseValueConfidence,
  };
}

export function serializePersistedV2Valuation(
  valuation: PersistedV2ToyValuation,
): Record<string, unknown> {
  return {
    generation: 'v2',
    id: valuation.id,
    toyAnalysisItemId: valuation.toyAnalysisItemId,
    baseSecondHandValueDenars: valuation.baseSecondHandValueDenars,
    baseValueConfidence: valuation.baseValueConfidence,
    aiCondition: valuation.aiCondition,
    aiConditionConfidence: valuation.aiConditionConfidence,
    aiConditionNotes: valuation.aiConditionNotes,
    confirmedCondition: valuation.confirmedCondition,
    conditionConfirmationType: valuation.conditionConfirmationType,
    conditionConfirmedAt: valuation.conditionConfirmedAt,
    parentReportedIssues: valuation.parentReportedIssues,
    parentConditionNote: valuation.parentConditionNote,
    conditionAdjustmentBasisPoints: valuation.conditionAdjustmentBasisPoints,
    estimatedValueDenars: valuation.estimatedValueDenars,
    confidence: valuation.confidence,
    valuationMethod: valuation.valuationMethod,
    valuationVersion: valuation.valuationVersion,
    createdAt: valuation.createdAt,
    updatedAt: valuation.updatedAt,
  };
}

function isValidConfidence(value: unknown): value is number | null {
  return value === null || (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function isNonblankStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.every((item) => Boolean(readNonblankString(item)));
}

function isParentIssueArray(value: unknown): value is ParentReportedToyIssue[] {
  return Array.isArray(value) && value.every(isParentReportedToyIssue) &&
    new Set(value).size === value.length;
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNullableNonblankString(value: unknown): string | null | undefined {
  return value === null ? null : readNonblankString(value) ?? undefined;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function readNullableTimestamp(value: unknown): string | null | undefined {
  return value === null ? null : readTimestamp(value) ?? undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
