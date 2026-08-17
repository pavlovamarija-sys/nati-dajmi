export type ValueToyRequest = {
  toyAnalysisItemId: string;
};

export type ValueToyRequestValidation =
  | { ok: true; value: ValueToyRequest }
  | { ok: false; error: string };

export function validateValueToyRequest(value: unknown): ValueToyRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (!hasExactKeys(value, ['toyAnalysisItemId'])) {
    return { ok: false, error: 'Request body contains unsupported fields.' };
  }

  const toyAnalysisItemId = readNonblankString(value.toyAnalysisItemId);

  if (!toyAnalysisItemId) {
    return { ok: false, error: 'toyAnalysisItemId is required.' };
  }

  return {
    ok: true,
    value: { toyAnalysisItemId },
  };
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
