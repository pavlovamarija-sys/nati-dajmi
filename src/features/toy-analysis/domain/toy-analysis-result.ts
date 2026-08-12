import type {
  PlayIdea,
  ToyBoundingBox,
  ToyAnalysisItem,
  ToyAnalysisResult,
  ToyRecommendation,
} from '@/features/toy-analysis/types/toy-analysis';

export function parseToyAnalysisResult(value: unknown): ToyAnalysisResult | null {
  if (
    !isRecord(value) ||
    typeof value.analysisId !== 'string' ||
    value.analysisId.trim() === '' ||
    !Number.isInteger(value.childAgeMonths) ||
    Number(value.childAgeMonths) <= 0 ||
    !Array.isArray(value.toys)
  ) {
    return null;
  }

  const toys: ToyAnalysisItem[] = [];

  for (const candidate of value.toys) {
    const toy = parseToyAnalysisItem(candidate);

    if (!toy) {
      return null;
    }

    toys.push(toy);
  }

  return {
    analysisId: value.analysisId.trim(),
    childAgeMonths: Number(value.childAgeMonths),
    toys,
  };
}

function parseToyAnalysisItem(value: unknown): ToyAnalysisItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const reason = typeof value.reason === 'string' ? value.reason.trim() : '';
  const category =
    value.category === null
      ? null
      : typeof value.category === 'string'
        ? value.category.trim()
        : undefined;
  const confidence = value.confidence;
  const recommendation = value.recommendation;

  if (
    !id ||
    !name ||
    !reason ||
    category === undefined ||
    !isToyRecommendation(recommendation) ||
    !(
      confidence === null ||
      (typeof confidence === 'number' &&
        Number.isFinite(confidence) &&
        confidence >= 0 &&
        confidence <= 1)
    )
  ) {
    return null;
  }

  const playIdeas = parsePlayIdeas(value.playIdeas, recommendation);
  const boundingBox = parseBoundingBox(value.boundingBox);

  if (!playIdeas || boundingBox === undefined) {
    return null;
  }

  return {
    id,
    name,
    category,
    recommendation,
    reason,
    confidence,
    playIdeas,
    boundingBox,
  };
}

function parseBoundingBox(value: unknown): ToyBoundingBox | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const keys = Object.keys(value);
  const { x, y, width, height } = value;

  if (
    keys.length !== 4 ||
    !keys.includes('x') ||
    !keys.includes('y') ||
    !keys.includes('width') ||
    !keys.includes('height') ||
    !isNormalizedCoordinate(x) ||
    !isNormalizedCoordinate(y) ||
    !isNormalizedCoordinate(width) ||
    !isNormalizedCoordinate(height) ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 ||
    y + height > 1
  ) {
    return undefined;
  }

  return { x, y, width, height };
}

function isNormalizedCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parsePlayIdeas(
  value: unknown,
  recommendation: ToyRecommendation,
): PlayIdea[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (
    (recommendation === 'KEEP' && (value.length < 2 || value.length > 3)) ||
    (recommendation !== 'KEEP' && value.length !== 0)
  ) {
    return null;
  }

  const playIdeas: PlayIdea[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate)) {
      return null;
    }

    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const description =
      typeof candidate.description === 'string' ? candidate.description.trim() : '';

    if (!title || !description) {
      return null;
    }

    playIdeas.push({ title, description });
  }

  return playIdeas;
}

function isToyRecommendation(value: unknown): value is ToyRecommendation {
  return value === 'KEEP' || value === 'ROTATE' || value === 'PASS_ON';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
