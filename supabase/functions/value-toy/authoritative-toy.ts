export type AuthoritativeToy = {
  toyAnalysisItemId: string;
  analysisId: string;
  name: string;
  category: string | null;
  imagePath: string | null;
};

const ROW_KEYS = ['id', 'analysis_id', 'name', 'category', 'image_path'] as const;

export function parseAuthoritativeToy(value: unknown): AuthoritativeToy | null {
  if (!isRecord(value) || !hasExactKeys(value, ROW_KEYS)) {
    return null;
  }

  const toyAnalysisItemId = readNonblankString(value.id);
  const analysisId = readNonblankString(value.analysis_id);
  const name = readNonblankString(value.name);
  const category = value.category;
  const imagePath = value.image_path;

  if (
    !toyAnalysisItemId ||
    !analysisId ||
    !name ||
    !(category === null || typeof category === 'string') ||
    !(imagePath === null || Boolean(readNonblankString(imagePath)))
  ) {
    return null;
  }

  return {
    toyAnalysisItemId,
    analysisId,
    name,
    category: typeof category === 'string' ? category.trim() : null,
    imagePath: imagePath === null ? null : readNonblankString(imagePath),
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
