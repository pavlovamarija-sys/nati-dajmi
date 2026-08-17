export const TOY_VALUATION_CONDITIONS = [
  'EXCELLENT',
  'GOOD',
  'FAIR',
  'POOR',
  'UNKNOWN',
] as const;

export type ToyValuationCondition = typeof TOY_VALUATION_CONDITIONS[number];

export const TOY_CONDITION_CONFIRMATION_TYPES = [
  'ACCEPTED_AI',
  'CORRECTED',
] as const;

export type ToyConditionConfirmationType =
  typeof TOY_CONDITION_CONFIRMATION_TYPES[number];

export const PARENT_REPORTED_TOY_ISSUES = [
  'MISSING_PART',
  'BROKEN_PART',
  'DOES_NOT_WORK',
  'HEAVY_WEAR',
  'OTHER',
] as const;

export type ParentReportedToyIssue =
  typeof PARENT_REPORTED_TOY_ISSUES[number];

export const TOY_VALUATION_POLICY_ID = 'condition-adjusted-second-hand-value';
export const TOY_VALUATION_POLICY_VERSION = 'v1';

const BASIS_POINTS_PER_WHOLE = 10_000;
const LOWER_VALUE_THRESHOLD_DENARS = 500;
const LOWER_VALUE_ROUNDING_INCREMENT_DENARS = 50;
const STANDARD_ROUNDING_INCREMENT_DENARS = 100;

export const TOY_CONDITION_ADJUSTMENT_BASIS_POINTS: Readonly<
  Record<ToyValuationCondition, number>
> = Object.freeze({
  EXCELLENT: 1000,
  GOOD: 0,
  FAIR: -2500,
  POOR: -5000,
  UNKNOWN: 0,
});

export type ToyValuationCalculation = {
  conditionAdjustmentBasisPoints: number;
  estimatedValueDenars: number;
};

export function calculateToyValuation(
  baseSecondHandValueDenars: number,
  condition: ToyValuationCondition,
): ToyValuationCalculation {
  assertNonnegativeInteger(baseSecondHandValueDenars, 'Base second-hand value');
  assertToyCondition(condition);

  const conditionAdjustmentBasisPoints =
    TOY_CONDITION_ADJUSTMENT_BASIS_POINTS[condition];
  const adjustedValue = baseSecondHandValueDenars *
    (1 + conditionAdjustmentBasisPoints / BASIS_POINTS_PER_WHOLE);

  return {
    conditionAdjustmentBasisPoints,
    estimatedValueDenars: roundToPracticalDenarValue(adjustedValue),
  };
}

export function getEffectiveToyCondition(
  aiCondition: ToyValuationCondition,
  confirmedCondition: ToyValuationCondition | null,
): ToyValuationCondition {
  assertToyCondition(aiCondition);

  if (confirmedCondition !== null) {
    assertToyCondition(confirmedCondition);
  }

  return confirmedCondition ?? aiCondition;
}

export function isToyValuationCondition(
  value: unknown,
): value is ToyValuationCondition {
  return typeof value === 'string' &&
    (TOY_VALUATION_CONDITIONS as readonly string[]).includes(value);
}

export function isToyConditionConfirmationType(
  value: unknown,
): value is ToyConditionConfirmationType {
  return typeof value === 'string' &&
    (TOY_CONDITION_CONFIRMATION_TYPES as readonly string[]).includes(value);
}

export function isParentReportedToyIssue(
  value: unknown,
): value is ParentReportedToyIssue {
  return typeof value === 'string' &&
    (PARENT_REPORTED_TOY_ISSUES as readonly string[]).includes(value);
}

export function calculateOverallValuationConfidence(
  baseValueConfidence: number | null,
  condition: ToyValuationCondition,
  conditionConfidence: number | null,
): number | null {
  assertConfidence(baseValueConfidence, 'Base-value confidence');
  assertToyCondition(condition);
  assertConfidence(conditionConfidence, 'Condition confidence');

  if (baseValueConfidence === null) {
    return null;
  }

  // Condition evidence can only preserve or reduce confidence in the base estimate;
  // it can never compensate for a weak base-value estimate.
  if (condition === 'UNKNOWN') {
    return roundConfidence(baseValueConfidence * 0.65);
  }

  if (conditionConfidence === null) {
    return roundConfidence(baseValueConfidence * 0.75);
  }

  return roundConfidence(
    baseValueConfidence * (0.75 + 0.25 * conditionConfidence),
  );
}

function roundToPracticalDenarValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Adjusted valuation must be a finite nonnegative number.');
  }

  if (value === 0) {
    return 0;
  }

  const increment = value < LOWER_VALUE_THRESHOLD_DENARS
    ? LOWER_VALUE_ROUNDING_INCREMENT_DENARS
    : STANDARD_ROUNDING_INCREMENT_DENARS;
  const rounded = Math.round(value / increment) * increment;

  return Math.max(increment, rounded);
}

function roundConfidence(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 1000) / 1000;
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer.`);
  }
}

function assertToyCondition(
  value: unknown,
): asserts value is ToyValuationCondition {
  if (!isToyValuationCondition(value)) {
    throw new Error('Toy condition is invalid.');
  }
}

function assertConfidence(value: number | null, label: string): void {
  if (
    value !== null &&
    (!Number.isFinite(value) || value < 0 || value > 1)
  ) {
    throw new Error(`${label} must be null or between 0 and 1.`);
  }
}
