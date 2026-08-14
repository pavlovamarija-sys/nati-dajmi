export type ValueToyRequest = {
  toyAnalysisItemId: string;
  name: string;
  category: string | null;
  imagePath?: string | null;
};

export type ValueToyRequestValidation =
  | { ok: true; value: ValueToyRequest }
  | { ok: false; error: string };

export function validateValueToyRequest(value: unknown): ValueToyRequestValidation {
  if (!isRecord(value)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const toyAnalysisItemId = readNonblankString(value.toyAnalysisItemId);
  const name = readNonblankString(value.name);

  if (!toyAnalysisItemId) {
    return { ok: false, error: 'toyAnalysisItemId is required.' };
  }

  if (!name) {
    return { ok: false, error: 'name is required.' };
  }

  if (!(value.category === null || typeof value.category === 'string')) {
    return { ok: false, error: 'category must be a string or null.' };
  }

  const category = typeof value.category === 'string'
    ? value.category.trim()
    : null;

  const hasImagePath = 'imagePath' in value;
  const imagePath = value.imagePath;

  if (hasImagePath && imagePath !== null) {
    if (typeof imagePath !== 'string' || !imagePath.trim()) {
      return { ok: false, error: 'imagePath must be a nonblank string or null.' };
    }
  }

  return {
    ok: true,
    value: {
      toyAnalysisItemId,
      name,
      category,
      ...(hasImagePath
        ? { imagePath: imagePath === null ? null : (imagePath as string).trim() }
        : {}),
    },
  };
}

function readNonblankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
