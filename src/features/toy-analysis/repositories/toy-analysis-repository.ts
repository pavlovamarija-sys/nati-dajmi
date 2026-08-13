import { parsePersistedToyAnalysisResult } from '@/features/toy-analysis/domain/persisted-toy-analysis-result';
import type {
  ToyAnalysisHistoryItem,
  ToyAnalysisResult,
} from '@/features/toy-analysis/types/toy-analysis';
import { supabase } from '@/lib/supabase/client';

const HISTORY_SELECT = `
  id,
  child_age_months,
  created_at,
  toy_analysis_items ( id )
`;

const ANALYSIS_SELECT = `
  id,
  child_age_months,
  status,
  toy_analysis_items (
    id,
    name,
    category,
    recommendation,
    reason,
    confidence,
    play_ideas,
    image_path,
    created_at
  )
`;

export async function getToyAnalysisHistory(): Promise<ToyAnalysisHistoryItem[]> {
  const { data, error } = await supabase
    .from('toy_analyses')
    .select(HISTORY_SELECT)
    .eq('status', 'completed')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Could not load toy analysis history.', { cause: error });
  }

  if (!Array.isArray(data)) {
    throw new Error('Toy analysis history returned malformed data.');
  }

  return data.map(parseHistoryItem);
}

export async function getToyAnalysisById(
  analysisId: string,
): Promise<ToyAnalysisResult | null> {
  const normalizedAnalysisId = analysisId.trim();

  if (!normalizedAnalysisId) {
    throw new Error('A valid toy analysis ID is required.');
  }

  const { data, error } = await supabase
    .from('toy_analyses')
    .select(ANALYSIS_SELECT)
    .eq('id', normalizedAnalysisId)
    .eq('status', 'completed')
    .maybeSingle();

  if (error) {
    throw new Error('Could not load the toy analysis.', { cause: error });
  }

  if (data === null) {
    return null;
  }

  const candidate = mapPersistedAnalysis(data);
  const result = parsePersistedToyAnalysisResult(candidate);

  if (!result) {
    throw new Error('The persisted toy analysis contains malformed data.');
  }

  return addSignedToyImageUrls(result);
}

function parseHistoryItem(value: unknown): ToyAnalysisHistoryItem {
  if (!isRecord(value)) {
    throw new Error('Toy analysis history contains a malformed row.');
  }

  const analysisId = readNonblankString(value.id);
  const childAgeMonths = value.child_age_months;
  const createdAt = readTimestamp(value.created_at);
  const items = value.toy_analysis_items;

  if (
    !analysisId ||
    !Number.isInteger(childAgeMonths) ||
    Number(childAgeMonths) <= 0 ||
    !Array.isArray(items) ||
    !items.every(isValidItemReference)
  ) {
    throw new Error('Toy analysis history contains a malformed row.');
  }

  return {
    analysisId,
    childAgeMonths: Number(childAgeMonths),
    createdAt,
    toyCount: items.length,
  };
}

function mapPersistedAnalysis(value: unknown): unknown {
  if (!isRecord(value)) {
    throw new Error('The persisted toy analysis contains malformed data.');
  }

  const analysisId = readNonblankString(value.id);
  const childAgeMonths = value.child_age_months;
  const items = value.toy_analysis_items;

  if (
    !analysisId ||
    value.status !== 'completed' ||
    !Number.isInteger(childAgeMonths) ||
    Number(childAgeMonths) <= 0 ||
    !Array.isArray(items)
  ) {
    throw new Error('The persisted toy analysis contains malformed data.');
  }

  const mappedItems = items.map(mapPersistedItem);

  mappedItems.sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.itemId.localeCompare(right.itemId),
  );

  return {
    analysisId,
    childAgeMonths: Number(childAgeMonths),
    toys: mappedItems.map(({ item }) => item),
  };
}

function mapPersistedItem(value: unknown): {
  createdAt: string;
  itemId: string;
  item: Record<string, unknown>;
} {
  if (!isRecord(value)) {
    throw new Error('The persisted toy analysis contains a malformed item.');
  }

  const createdAt = readTimestamp(value.created_at);
  const itemId = readNonblankString(value.id);

  if (!itemId) {
    throw new Error('The persisted toy analysis contains a malformed item.');
  }

  return {
    createdAt,
    itemId,
    item: {
      id: itemId,
      name: value.name,
      category: value.category,
      recommendation: value.recommendation,
      reason: value.reason,
      confidence: value.confidence,
      playIdeas: value.play_ideas,
      imagePath: value.image_path,
    },
  };
}

const SIGNED_IMAGE_URL_LIFETIME_SECONDS = 30 * 60;

async function addSignedToyImageUrls(
  result: ToyAnalysisResult,
): Promise<ToyAnalysisResult> {
  const toys = await Promise.all(
    result.toys.map(async (toy) => {
      if (!toy.imagePath) {
        return toy;
      }

      const { data, error } = await supabase.storage
        .from('toy-shelf-images')
        .createSignedUrl(toy.imagePath, SIGNED_IMAGE_URL_LIFETIME_SECONDS);

      if (error || !data?.signedUrl) {
        logSignedUrlFailure(toy.id, error);
        return toy;
      }

      return { ...toy, imageUri: data.signedUrl };
    }),
  );

  return { ...result, toys };
}

function logSignedUrlFailure(toyItemId: string, error: unknown): void {
  if (!__DEV__) {
    return;
  }

  console.warn('[toy-analysis] signed_crop_url_failed', {
    toyItemId,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : undefined,
  });
}

function isValidItemReference(value: unknown): boolean {
  return isRecord(value) && Boolean(readNonblankString(value.id));
}

function readNonblankString(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return value.trim();
}

function readTimestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Number.isNaN(Date.parse(value))
  ) {
    throw new Error('Toy analysis data contains an invalid timestamp.');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
