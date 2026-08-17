// @ts-ignore Deno requires explicit TypeScript extensions for shared local modules.
import { isParentReportedToyIssue, isToyValuationCondition, type ParentReportedToyIssue, type ToyValuationCondition } from '../../../shared/toy-valuation-policy.ts';

export type ConfirmToyConditionRequest = {
  toyAnalysisItemId: string;
  confirmedCondition: ToyValuationCondition;
  parentReportedIssues: ParentReportedToyIssue[];
  parentConditionNote: string | null;
};

export type ConfirmToyConditionRequestValidation =
  | { ok: true; value: ConfirmToyConditionRequest }
  | { ok: false; error: string };

const REQUEST_KEYS = [
  'toyAnalysisItemId',
  'confirmedCondition',
  'parentReportedIssues',
  'parentConditionNote',
] as const;

export function validateConfirmToyConditionRequest(
  value: unknown,
): ConfirmToyConditionRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (!hasExactKeys(value, REQUEST_KEYS)) {
    return { ok: false, error: 'Request body contains unsupported fields.' };
  }

  const toyAnalysisItemId = readNonblankString(value.toyAnalysisItemId);
  if (!toyAnalysisItemId) {
    return { ok: false, error: 'toyAnalysisItemId is required.' };
  }

  if (!isToyValuationCondition(value.confirmedCondition)) {
    return { ok: false, error: 'confirmedCondition is invalid.' };
  }

  if (
    !Array.isArray(value.parentReportedIssues) ||
    !value.parentReportedIssues.every(isParentReportedToyIssue)
  ) {
    return { ok: false, error: 'parentReportedIssues is invalid.' };
  }

  if (new Set(value.parentReportedIssues).size !== value.parentReportedIssues.length) {
    return { ok: false, error: 'parentReportedIssues contains duplicates.' };
  }

  const parentConditionNote = value.parentConditionNote === null
    ? null
    : readNonblankString(value.parentConditionNote);
  if (value.parentConditionNote !== null && !parentConditionNote) {
    return { ok: false, error: 'parentConditionNote must be null or nonblank.' };
  }

  return {
    ok: true,
    value: {
      toyAnalysisItemId,
      confirmedCondition: value.confirmedCondition,
      parentReportedIssues: [...value.parentReportedIssues],
      parentConditionNote,
    },
  };
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
