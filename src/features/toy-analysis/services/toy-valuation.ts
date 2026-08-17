import { supabase } from '@/lib/supabase/client';
import {
  getToyValuation,
  upsertToyValuation,
} from '@/features/toy-analysis/repositories/toy-valuation-repository';
import {
  TOY_CONDITIONS,
  isParentReportedToyIssue,
  isToyConditionConfirmationType,
  type ImageAwareToyValuation,
  type ImageAwareToyValuationDetails,
  type ParentReportedToyIssue,
  type PersistedToyValuation,
  type ToyCondition,
} from '@/features/toy-analysis/types/toy-valuation';

const VALUE_TOY_FUNCTION_NAME = 'value-toy';
const CONFIRM_TOY_CONDITION_FUNCTION_NAME = 'confirm-toy-condition';
const VALUATION_ERROR_MESSAGE = 'Could not estimate the toy value.';
const INVALID_VALUATION_RESPONSE_MESSAGE = 'The toy valuation response was invalid.';
const CONFIRMATION_ERROR_MESSAGE = 'Could not confirm the toy condition.';
const INVALID_CONFIRMATION_RESPONSE_MESSAGE = 'The toy condition response was invalid.';

export type ToyValuationInput = {
  toyAnalysisItemId: string;
};

export type ToyValuationRequest = ToyValuationInput;

export type ToyValuationMetadata = {
  valuationMethod: string;
  valuationVersion: string;
};

export type ToyValuationTransportDetails = {
  baseSecondHandValueDenars: number;
  baseValueConfidence: number | null;
  condition: ToyCondition;
  conditionConfidence: number | null;
  conditionNotes: readonly string[];
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
  confidence: number | null;
};

export type ToyValuationResult = ToyValuationTransportDetails & {
  metadata: ToyValuationMetadata;
};

export type ToyValuationSource = 'existing' | 'created';

export type GetOrCreateToyValuationResult = {
  valuation: PersistedToyValuation;
  source: ToyValuationSource;
};

export type ConfirmToyConditionInput = {
  toyAnalysisItemId: string;
  confirmedCondition: ToyCondition;
  parentReportedIssues: readonly ParentReportedToyIssue[];
  parentConditionNote: string | null;
};

export interface ToyValuationService {
  valueToy(input: ToyValuationInput): Promise<ToyValuationResult>;
}

export type ToyValuationProvider = (
  input: ToyValuationInput,
) => Promise<ToyValuationResult>;

export const valueToy: ToyValuationProvider = async (input) => {
  const request = validateAndMapInput(input);
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;

  try {
    invocation = await supabase.functions.invoke(VALUE_TOY_FUNCTION_NAME, {
      body: request,
    });
  } catch {
    throw new Error(VALUATION_ERROR_MESSAGE);
  }

  const { data, error } = invocation;

  if (error) {
    throw new Error(VALUATION_ERROR_MESSAGE);
  }

  return parseToyValuationResult(data);
};

export async function confirmToyCondition(
  input: ConfirmToyConditionInput,
): Promise<ImageAwareToyValuation> {
  const request = validateConfirmToyConditionInput(input);
  let invocation: Awaited<ReturnType<typeof supabase.functions.invoke>>;

  try {
    invocation = await supabase.functions.invoke(
      CONFIRM_TOY_CONDITION_FUNCTION_NAME,
      { body: request },
    );
  } catch {
    throw new Error(CONFIRMATION_ERROR_MESSAGE);
  }

  if (invocation.error) {
    throw new Error(CONFIRMATION_ERROR_MESSAGE);
  }

  return parseConfirmedToyValuation(invocation.data);
}

export async function getOrCreateToyValuation(
  toyAnalysisItemId: string,
): Promise<GetOrCreateToyValuationResult> {
  const normalizedItemId = readNonblankString(toyAnalysisItemId);

  if (!normalizedItemId) {
    throw new Error(VALUATION_ERROR_MESSAGE);
  }

  const existingValuation = await getToyValuation(normalizedItemId);

  if (existingValuation) {
    return {
      valuation: existingValuation,
      source: 'existing',
    };
  }

  const transportResult = await valueToy({
    toyAnalysisItemId: normalizedItemId,
  });
  const domainResult = mapToyValuationResultToDomain(transportResult);

  const persistedValuation = await upsertToyValuation({
    toyAnalysisItemId: normalizedItemId,
    baseSecondHandValueDenars: domainResult.baseSecondHandValueDenars,
    baseValueConfidence: domainResult.baseValueConfidence,
    aiCondition: domainResult.aiCondition,
    aiConditionConfidence: domainResult.aiConditionConfidence,
    aiConditionNotes: domainResult.aiConditionNotes,
    conditionAdjustmentBasisPoints:
      domainResult.conditionAdjustmentBasisPoints,
    estimatedValueDenars: domainResult.estimatedValueDenars,
    confidence: domainResult.confidence,
    valuationMethod: transportResult.metadata.valuationMethod,
    valuationVersion: transportResult.metadata.valuationVersion,
  });

  return {
    valuation: persistedValuation,
    source: 'created',
  };
}

export function mapToyValuationResultToDomain(
  result: ToyValuationResult,
): ImageAwareToyValuationDetails {
  return {
    baseSecondHandValueDenars: result.baseSecondHandValueDenars,
    baseValueConfidence: result.baseValueConfidence,
    aiCondition: result.condition,
    aiConditionConfidence: result.conditionConfidence,
    aiConditionNotes: result.conditionNotes,
    confirmedCondition: null,
    conditionConfirmationType: null,
    conditionConfirmedAt: null,
    parentReportedIssues: [],
    parentConditionNote: null,
    conditionAdjustmentBasisPoints: result.conditionAdjustmentBasisPoints,
    estimatedValueDenars: result.estimatedValueDenars,
    confidence: result.confidence,
  };
}

function validateConfirmToyConditionInput(
  input: ConfirmToyConditionInput,
): ConfirmToyConditionInput {
  if (!isRecord(input) || !hasExactKeys(input, [
    'toyAnalysisItemId',
    'confirmedCondition',
    'parentReportedIssues',
    'parentConditionNote',
  ])) {
    throw new Error(CONFIRMATION_ERROR_MESSAGE);
  }

  const toyAnalysisItemId = readNonblankString(input.toyAnalysisItemId);
  if (
    !toyAnalysisItemId ||
    !isToyCondition(input.confirmedCondition) ||
    !Array.isArray(input.parentReportedIssues) ||
    !input.parentReportedIssues.every(isParentReportedToyIssue) ||
    new Set(input.parentReportedIssues).size !== input.parentReportedIssues.length
  ) {
    throw new Error(CONFIRMATION_ERROR_MESSAGE);
  }

  const parentConditionNote = input.parentConditionNote === null
    ? null
    : readNonblankString(input.parentConditionNote);
  if (input.parentConditionNote !== null && !parentConditionNote) {
    throw new Error(CONFIRMATION_ERROR_MESSAGE);
  }

  return {
    toyAnalysisItemId,
    confirmedCondition: input.confirmedCondition,
    parentReportedIssues: [...input.parentReportedIssues],
    parentConditionNote,
  };
}

function parseConfirmedToyValuation(value: unknown): ImageAwareToyValuation {
  if (!isRecord(value) || !hasExactKeys(value, [
    'generation',
    'id',
    'toyAnalysisItemId',
    'baseSecondHandValueDenars',
    'baseValueConfidence',
    'aiCondition',
    'aiConditionConfidence',
    'aiConditionNotes',
    'confirmedCondition',
    'conditionConfirmationType',
    'conditionConfirmedAt',
    'parentReportedIssues',
    'parentConditionNote',
    'conditionAdjustmentBasisPoints',
    'estimatedValueDenars',
    'confidence',
    'valuationMethod',
    'valuationVersion',
    'createdAt',
    'updatedAt',
  ])) {
    throw new Error(INVALID_CONFIRMATION_RESPONSE_MESSAGE);
  }

  const id = readNonblankString(value.id);
  const toyAnalysisItemId = readNonblankString(value.toyAnalysisItemId);
  const valuationMethod = readNonblankString(value.valuationMethod);
  const valuationVersion = readNonblankString(value.valuationVersion);
  const conditionConfirmedAt = readTimestamp(value.conditionConfirmedAt);
  const createdAt = readTimestamp(value.createdAt);
  const updatedAt = readTimestamp(value.updatedAt);
  const parentConditionNote = value.parentConditionNote === null
    ? null
    : readNonblankString(value.parentConditionNote);

  if (
    value.generation !== 'v2' ||
    !id ||
    !toyAnalysisItemId ||
    !isNonnegativeInteger(value.baseSecondHandValueDenars) ||
    !isValidConfidence(value.baseValueConfidence) ||
    !isToyCondition(value.aiCondition) ||
    !isValidConfidence(value.aiConditionConfidence) ||
    !isNonblankStringArray(value.aiConditionNotes) ||
    !isToyCondition(value.confirmedCondition) ||
    !isToyConditionConfirmationType(value.conditionConfirmationType) ||
    !conditionConfirmedAt ||
    !isParentReportedIssueArray(value.parentReportedIssues) ||
    (value.parentConditionNote !== null && !parentConditionNote) ||
    !Number.isInteger(value.conditionAdjustmentBasisPoints) ||
    Number(value.conditionAdjustmentBasisPoints) < -10000 ||
    Number(value.conditionAdjustmentBasisPoints) > 10000 ||
    !isNonnegativeInteger(value.estimatedValueDenars) ||
    !isValidConfidence(value.confidence) ||
    !valuationMethod ||
    !valuationVersion ||
    !createdAt ||
    !updatedAt ||
    (
      value.conditionConfirmationType === 'ACCEPTED_AI' &&
      value.confirmedCondition !== value.aiCondition
    )
  ) {
    throw new Error(INVALID_CONFIRMATION_RESPONSE_MESSAGE);
  }

  return {
    generation: 'v2',
    id,
    toyAnalysisItemId,
    baseSecondHandValueDenars: Number(value.baseSecondHandValueDenars),
    baseValueConfidence: value.baseValueConfidence,
    aiCondition: value.aiCondition,
    aiConditionConfidence: value.aiConditionConfidence,
    aiConditionNotes: value.aiConditionNotes.map((note) => note.trim()),
    confirmedCondition: value.confirmedCondition,
    conditionConfirmationType: value.conditionConfirmationType,
    conditionConfirmedAt,
    parentReportedIssues: [...value.parentReportedIssues],
    parentConditionNote,
    conditionAdjustmentBasisPoints: Number(value.conditionAdjustmentBasisPoints),
    estimatedValueDenars: Number(value.estimatedValueDenars),
    confidence: value.confidence,
    valuationMethod,
    valuationVersion,
    createdAt,
    updatedAt,
  };
}

function validateAndMapInput(input: ToyValuationInput): ToyValuationRequest {
  const toyAnalysisItemId = readNonblankString(input.toyAnalysisItemId);

  if (!toyAnalysisItemId) {
    throw new Error(VALUATION_ERROR_MESSAGE);
  }

  return { toyAnalysisItemId };
}

function parseToyValuationResult(value: unknown): ToyValuationResult {
  if (!isRecord(value) || !hasExactKeys(value, [
    'baseSecondHandValueDenars',
    'baseValueConfidence',
    'condition',
    'conditionConfidence',
    'conditionNotes',
    'conditionAdjustmentBasisPoints',
    'estimatedValueDenars',
    'confidence',
    'metadata',
  ])) {
    throw new Error(INVALID_VALUATION_RESPONSE_MESSAGE);
  }

  if (
    !isNonnegativeInteger(value.baseSecondHandValueDenars) ||
    !isValidConfidence(value.baseValueConfidence) ||
    !isToyCondition(value.condition) ||
    !isValidConfidence(value.conditionConfidence) ||
    !Array.isArray(value.conditionNotes) ||
    !value.conditionNotes.every((note) => Boolean(readNonblankString(note))) ||
    !Number.isInteger(value.conditionAdjustmentBasisPoints) ||
    Number(value.conditionAdjustmentBasisPoints) < -10000 ||
    Number(value.conditionAdjustmentBasisPoints) > 10000 ||
    !isNonnegativeInteger(value.estimatedValueDenars) ||
    !isValidConfidence(value.confidence) ||
    !isRecord(value.metadata) ||
    !hasExactKeys(value.metadata, ['valuationMethod', 'valuationVersion'])
  ) {
    throw new Error(INVALID_VALUATION_RESPONSE_MESSAGE);
  }

  const valuationMethod = readNonblankString(value.metadata.valuationMethod);
  const valuationVersion = readNonblankString(value.metadata.valuationVersion);

  if (!valuationMethod || !valuationVersion) {
    throw new Error(INVALID_VALUATION_RESPONSE_MESSAGE);
  }

  return {
    baseSecondHandValueDenars: Number(value.baseSecondHandValueDenars),
    baseValueConfidence: value.baseValueConfidence,
    condition: value.condition,
    conditionConfidence: value.conditionConfidence,
    conditionNotes: value.conditionNotes.map((note) => readNonblankString(note)!),
    conditionAdjustmentBasisPoints: Number(value.conditionAdjustmentBasisPoints),
    estimatedValueDenars: Number(value.estimatedValueDenars),
    confidence: value.confidence,
    metadata: {
      valuationMethod,
      valuationVersion,
    },
  };
}

function isNonnegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isToyCondition(value: unknown): value is ToyCondition {
  return typeof value === 'string' &&
    (TOY_CONDITIONS as readonly string[]).includes(value);
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

function isParentReportedIssueArray(
  value: unknown,
): value is ParentReportedToyIssue[] {
  return Array.isArray(value) &&
    value.every(isParentReportedToyIssue) &&
    new Set(value).size === value.length;
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readTimestamp(value: unknown): string | null {
  return typeof value === 'string' &&
      value.trim() &&
      !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
