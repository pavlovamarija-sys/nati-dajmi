import { File } from 'expo-file-system';

import { supabase } from '@/lib/supabase/client';

const TOY_IMAGE_BUCKET = 'toy-shelf-images';
const ANALYSIS_FUNCTION = 'analyze-toy-shelf';

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

async function persistOneToyCrop(
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

    const imageBytes = await cropFile.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(TOY_IMAGE_BUCKET)
      .upload(imagePath, imageBytes, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: registrationError } = await supabase.functions.invoke(
      ANALYSIS_FUNCTION,
      {
        body: {
          mode: 'register-crop',
          analysisId,
          toyItemId: crop.toyItemId,
          imagePath,
        },
      },
    );

    if (registrationError) {
      await removeUnregisteredObject(imagePath);
      throw registrationError;
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

async function removeUnregisteredObject(imagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(TOY_IMAGE_BUCKET).remove([imagePath]);
  if (error) {
    logDevelopmentEvent('crop_cleanup_failed', {
      errorName: error.name,
      errorMessage: error.message,
    }, 'warn');
  }
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

