import {
  PARENT_REPORTED_TOY_ISSUES,
  TOY_CONDITION_CONFIRMATION_TYPES,
  TOY_VALUATION_CONDITIONS,
  getEffectiveToyCondition,
  isParentReportedToyIssue,
  isToyConditionConfirmationType,
  isToyValuationCondition,
  type ParentReportedToyIssue,
  type ToyConditionConfirmationType,
  type ToyValuationCondition,
} from '@/features/toy-analysis/domain/toy-valuation-policy';

export const TOY_CONDITIONS = TOY_VALUATION_CONDITIONS;
export type ToyCondition = ToyValuationCondition;

export {
  PARENT_REPORTED_TOY_ISSUES,
  TOY_CONDITION_CONFIRMATION_TYPES,
  getEffectiveToyCondition,
  isParentReportedToyIssue,
  isToyConditionConfirmationType,
  isToyValuationCondition,
  type ParentReportedToyIssue,
  type ToyConditionConfirmationType,
};

export type ToyValuationBase = {
  id: string;
  toyAnalysisItemId: string;
  estimatedValueDenars: number;
  confidence: number | null;
  valuationMethod: string;
  valuationVersion: string;
  createdAt: string;
};

export type ToyValuation = ToyValuationBase & {
  generation: 'v1';
};

export type AiToyConditionProvenance = {
  baseSecondHandValueDenars: number;
  baseValueConfidence: number | null;
  aiCondition: ToyCondition;
  aiConditionConfidence: number | null;
  aiConditionNotes: readonly string[];
};

export type ParentToyConditionConfirmation = {
  confirmedCondition: ToyCondition | null;
  conditionConfirmationType: ToyConditionConfirmationType | null;
  conditionConfirmedAt: string | null;
  parentReportedIssues: readonly ParentReportedToyIssue[];
  parentConditionNote: string | null;
};

export type ImageAwareToyValuationDetails =
  AiToyConditionProvenance &
  ParentToyConditionConfirmation & {
    conditionAdjustmentBasisPoints: number;
    estimatedValueDenars: number;
    confidence: number | null;
  };

export type ImageAwareToyValuation =
  ToyValuationBase &
  ImageAwareToyValuationDetails & {
    generation: 'v2';
    updatedAt: string;
  };

export type PersistedToyValuation = ToyValuation | ImageAwareToyValuation;
