import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase/client';
import { persistDeterministicToyCrop } from '../../../../shared/toy-crop-persistence';

const TOY_IMAGE_BUCKET = 'toy-shelf-images';
const ANALYSIS_FUNCTION = 'analyze-toy-shelf';
export const TOY_CROP_UPLOAD_OPTIONS = {
  contentType: 'image/jpeg',
  upsert: false,
} as const;

export type ToyCropUpload = {
  toyItemId: string;
  imageUri: string;
};

export type ToyCropPersistenceResult = {
  persistedToyItemIds: string[];
  failedToyItemIds: string[];
};

export async function persistToyCropImages(
  authenticatedUserId: string,
  analysisId: string,
  crops: ToyCropUpload[],
): Promise<ToyCropPersistenceResult> {
  const results = await Promise.all(
    crops.map((crop) => persistOneToyCrop(authenticatedUserId, analysisId, crop)),
  );

  return results.reduce<ToyCropPersistenceResult>(
    (summary, result) => {
      summary[result.persisted ? 'persistedToyItemIds' : 'failedToyItemIds'].push(
        result.toyItemId,
      );
      return summary;
    },
    { persistedToyItemIds: [], failedToyItemIds: [] },
  );
}

export function buildToyCropObjectPath(
  authenticatedUserId: string,
  analysisId: string,
  toyItemId: string,
): string {
  for (const component of [authenticatedUserId, analysisId, toyItemId]) {
    if (!component.trim() || component.includes('/') || component.includes('\\') || component.includes('..')) {
      throw new Error('Toy crop path component is invalid.');
    }
  }

  return `${authenticatedUserId}/${analysisId}/${toyItemId}.jpg`;
}

export async function persistOneToyCrop(
  authenticatedUserId: string,
  analysisId: string,
  crop: ToyCropUpload,
): Promise<{ toyItemId: string; persisted: boolean }> {
  let imagePath: string | null = null;

  try {
    imagePath = buildToyCropObjectPath(
      authenticatedUserId,
      analysisId,
      crop.toyItemId,
    );
    const cropFile = new File(crop.imageUri);
    if (!cropFile.exists) {
      throw new Error('Local high-quality crop is unavailable.');
    }

    const outcome = await persistDeterministicToyCrop({
      objectExists: () => toyCropObjectExists(imagePath!),
      async upload() {
        const imageBytes = await cropFile.arrayBuffer();
        const { error } = await supabase.storage
          .from(TOY_IMAGE_BUCKET)
          .upload(imagePath!, imageBytes, TOY_CROP_UPLOAD_OPTIONS);
        return error === null;
      },
      async register() {
        return (await registerCropPath(analysisId, crop.toyItemId, imagePath!)) === null;
      },
    });

    if (outcome !== 'persisted') {
      throw new Error(
        outcome === 'registration-failed'
          ? 'Toy crop registration failed.'
          : 'Toy crop upload failed.',
      );
    }

    logDevelopmentEvent('crop_persistence_completed', {
      analysisId,
      toyItemId: crop.toyItemId,
    });
    return { toyItemId: crop.toyItemId, persisted: true };
  } catch (error) {
    logDevelopmentEvent(
      'crop_persistence_failed',
      {
        analysisId,
        toyItemId: crop.toyItemId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      },
      'warn',
    );
    return { toyItemId: crop.toyItemId, persisted: false };
  }
}

export async function recoverExistingToyCrop(
  authenticatedUserId: string,
  analysisId: string,
  toyItemId: string,
): Promise<boolean> {
  try {
    const imagePath = buildToyCropObjectPath(authenticatedUserId, analysisId, toyItemId);
    return await persistDeterministicToyCrop({
      objectExists: () => toyCropObjectExists(imagePath),
      async upload() { return false; },
      async register() {
        return (await registerCropPath(analysisId, toyItemId, imagePath)) === null;
      },
    }) === 'persisted';
  } catch {
    return false;
  }
}

async function registerCropPath(
  analysisId: string,
  toyItemId: string,
  imagePath: string,
): Promise<unknown | null> {
  const { error } = await supabase.functions.invoke(ANALYSIS_FUNCTION, {
    body: { mode: 'register-crop', analysisId, toyItemId, imagePath },
  });
  return error ?? null;
}

async function toyCropObjectExists(imagePath: string): Promise<boolean> {
  const separatorIndex = imagePath.lastIndexOf('/');
  const folder = separatorIndex > 0 ? imagePath.slice(0, separatorIndex) : '';
  const fileName = separatorIndex > 0 ? imagePath.slice(separatorIndex + 1) : '';
  if (!folder || !fileName) {
    return false;
  }

  const { data, error } = await supabase.storage
    .from(TOY_IMAGE_BUCKET)
    .list(folder, { limit: 1, search: fileName });
  if (error) {
    throw error;
  }
  return data?.some((object) => object.name === fileName) ?? false;
}

function logDevelopmentEvent(
  event: string,
  metadata: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  if (__DEV__) {
    console[level](`[toy-analysis] ${event}`, metadata);
  }
}
