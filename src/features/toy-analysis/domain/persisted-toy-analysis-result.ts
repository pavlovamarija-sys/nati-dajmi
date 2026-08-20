import type {
  PlayIdea,
  ToyAnalysisItem,
  ToyAnalysisResult,
  ToyRecommendation,
} from '@/features/toy-analysis/types/toy-analysis';

export function parsePersistedToyAnalysisResult(
  value: unknown,
): ToyAnalysisResult | null {
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
    const toy = parsePersistedToyAnalysisItem(candidate);

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

function parsePersistedToyAnalysisItem(value: unknown): ToyAnalysisItem | null {
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
  const cropExpected = value.cropExpected;
  const imagePath =
    value.imagePath === null
      ? null
      : typeof value.imagePath === 'string' && value.imagePath.trim()
        ? value.imagePath.trim()
        : undefined;

  if (
    !id ||
    !name ||
    !reason ||
    category === undefined ||
    imagePath === undefined ||
    typeof cropExpected !== 'boolean' ||
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

  const playIdeas = parsePersistedPlayIdeas(value.playIdeas, recommendation);

  if (!playIdeas) {
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
    boundingBox: null,
    cropExpected,
    imagePath,
  };
}

function parsePersistedPlayIdeas(
  value: unknown,
  recommendation: ToyRecommendation,
): PlayIdea[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (
    (recommendation === 'KEEP' && value.length !== 0 && value.length !== 2 && value.length !== 3) ||
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
