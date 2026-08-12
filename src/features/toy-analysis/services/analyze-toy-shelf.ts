import { File } from 'expo-file-system';

import { parseToyAnalysisResult } from '@/features/toy-analysis/domain/toy-analysis-result';
import {
  addLocalToyCrops,
  createLocalToyCandidateImages,
} from '@/features/toy-analysis/services/crop-toy-images';
import {
  detectToyCandidates,
  isLocalDetectorConfigured,
} from '@/features/toy-analysis/services/detect-toy-candidates';
import { prepareCanonicalAnalysisImage } from '@/features/toy-analysis/services/prepare-analysis-image';
import type {
  SupportedImageMimeType,
  LocalToyCandidateImage,
  ToyAnalysisResult,
  ToyShelfImage,
} from '@/features/toy-analysis/types/toy-analysis';
import { supabase } from '@/lib/supabase/client';

const FUNCTION_NAME = 'analyze-toy-shelf';

export async function analyzeToyShelf(
  image: ToyShelfImage,
  childAgeMonths: number,
): Promise<ToyAnalysisResult> {
  let stage = 'analysis_started';
  logDevelopmentEvent('analysis_started');

  try {
    if (!Number.isInteger(childAgeMonths) || childAgeMonths <= 0) {
      throw new ToyAnalysisServiceError('invalid-age');
    }

    stage = 'image_uri_received';
    logDevelopmentEvent('image_uri_received', {
      received: typeof image.uri === 'string' && image.uri.length > 0,
    });

    let imageFile: File;

    try {
      imageFile = new File(image.uri);
    } catch (error) {
      throw new ToyAnalysisServiceError('image-read-failed', { cause: error });
    }

    stage = 'mime_type_resolved';
    const mimeType = resolveMimeType(image, imageFile);
    logDevelopmentEvent('mime_type_resolved', {
      supported: mimeType !== null,
      mimeType: mimeType ?? undefined,
    });

    if (!mimeType) {
      throw new ToyAnalysisServiceError('unsupported-image-type');
    }

    stage = 'file_exists_or_readable';
    logDevelopmentEvent('file_exists_or_readable', { exists: imageFile.exists });

    if (!imageFile.exists) {
      throw new ToyAnalysisServiceError('image-read-failed');
    }

    stage = 'canonical_image_preparation';
    let canonicalImage: Awaited<ReturnType<typeof prepareCanonicalAnalysisImage>>;

    try {
      canonicalImage = await prepareCanonicalAnalysisImage(image);
    } catch (error) {
      throw new ToyAnalysisServiceError('image-read-failed', { cause: error });
    }

    stage = 'base64_read_success';
    logDevelopmentEvent('base64_read_success', {
      characterLength: canonicalImage.base64.length,
      canonicalWidth: canonicalImage.image.width,
      canonicalHeight: canonicalImage.image.height,
    });

    if (isLocalDetectorConfigured()) {
      return await analyzeWithLocalDetector(canonicalImage.image, childAgeMonths);
    }

    stage = 'function_invoke_started';
    logDevelopmentEvent('function_invoke_started');
    const { data, error, response } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: {
        imageBase64: canonicalImage.base64,
        mimeType: 'image/jpeg',
        childAgeMonths,
        imageWidth: canonicalImage.image.width,
        imageHeight: canonicalImage.image.height,
      },
    });

    stage = 'function_invoke_returned';
    logDevelopmentEvent('function_invoke_returned', {
      dataExists: data !== null && data !== undefined,
      responseStatus: response?.status,
      error: error ? getSafeErrorMetadata(error) : undefined,
    });

    if (error) {
      throw new ToyAnalysisServiceError('function-failed', { cause: error });
    }

    stage = 'response_validation_started';
    logDevelopmentEvent('response_validation_started');
    const result = parseToyAnalysisResult(data);

    if (!result || result.childAgeMonths !== childAgeMonths) {
      throw new ToyAnalysisServiceError('invalid-response');
    }

    logDevelopmentEvent('response_validation_success');
    return await addLocalToyCrops(result, canonicalImage.image);
  } catch (error) {
    logDevelopmentEvent('analysis_failed', {
      stage,
      error: getSafeErrorMetadata(error),
    }, 'warn');
    throw error;
  }
}

async function analyzeWithLocalDetector(
  canonicalImage: ToyShelfImage,
  childAgeMonths: number,
): Promise<ToyAnalysisResult> {
  const detectorStartedAt = Date.now();
  logDevelopmentEvent('local_detector_started', {
    imageWidth: canonicalImage.width,
    imageHeight: canonicalImage.height,
  });

  const candidates = await detectToyCandidates(canonicalImage);
  logDevelopmentEvent('local_detector_completed', {
    candidateCount: candidates.length,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    latencyMs: Date.now() - detectorStartedAt,
  });
  if (candidates.length === 0) {
    throw new ToyAnalysisServiceError('no-toys-detected');
  }

  const candidateImages = await createLocalToyCandidateImages(candidates, canonicalImage);
  if (candidateImages.length === 0) {
    throw new ToyAnalysisServiceError('candidate-crop-failed');
  }

  const semanticStartedAt = Date.now();
  logDevelopmentEvent('semantic_batch_started', {
    candidateCount: candidateImages.length,
    candidateIds: candidateImages.map((candidate) => candidate.candidateId),
  });
  const { data, error, response } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: {
      mode: 'detected-candidates',
      childAgeMonths,
      candidateImages: candidateImages.map((candidate) => ({
        candidateId: candidate.candidateId,
        imageBase64: candidate.semanticImageBase64,
        mimeType: 'image/jpeg',
      })),
    },
  });
  logDevelopmentEvent('semantic_batch_completed', {
    candidateCount: candidateImages.length,
    latencyMs: Date.now() - semanticStartedAt,
    responseStatus: response?.status,
    dataExists: data !== null && data !== undefined,
    usage: readSafeUsage(data),
    error: error ? getSafeErrorMetadata(error) : undefined,
  });
  if (error) {
    throw new ToyAnalysisServiceError('function-failed', { cause: error });
  }

  const result = parseLocalSemanticResult(data, candidateImages);
  if (!result || result.childAgeMonths !== childAgeMonths) {
    throw new ToyAnalysisServiceError('invalid-response');
  }
  return result;
}

function parseLocalSemanticResult(
  value: unknown,
  candidateImages: LocalToyCandidateImage[],
): ToyAnalysisResult | null {
  if (!isRecord(value) || !Array.isArray(value.toys)) {
    return null;
  }

  const candidatesById = new Map(
    candidateImages.map((candidate) => [candidate.candidateId, candidate]),
  );
  const candidateIdByToyId = new Map<string, string>();
  const seenCandidateIds = new Set<string>();
  const toys = value.toys.map((rawToy) => {
    if (!isRecord(rawToy)) {
      throw new ToyAnalysisServiceError('invalid-response');
    }
    const toyId = typeof rawToy.id === 'string' ? rawToy.id.trim() : '';
    const candidateId = typeof rawToy.candidateId === 'string'
      ? rawToy.candidateId.trim()
      : '';
    const candidate = candidatesById.get(candidateId);
    if (!toyId || !candidate || seenCandidateIds.has(candidateId)) {
      throw new ToyAnalysisServiceError('invalid-response');
    }
    seenCandidateIds.add(candidateId);
    candidateIdByToyId.set(toyId, candidateId);
    return { ...rawToy, boundingBox: candidate.boundingBox };
  });

  const parsed = parseToyAnalysisResult({ ...value, toys });
  if (!parsed) {
    return null;
  }

  return {
    ...parsed,
    toys: parsed.toys.map((toy) => {
      const candidateId = candidateIdByToyId.get(toy.id);
      const candidate = candidateId ? candidatesById.get(candidateId) : undefined;
      return candidate ? { ...toy, imageUri: candidate.imageUri } : toy;
    }),
  };
}

function readSafeUsage(value: unknown): Record<string, number | null> | undefined {
  if (!isRecord(value) || !isRecord(value.usage)) {
    return undefined;
  }
  return {
    inputTokens: typeof value.usage.inputTokens === 'number' ? value.usage.inputTokens : null,
    outputTokens: typeof value.usage.outputTokens === 'number' ? value.usage.outputTokens : null,
    totalTokens: typeof value.usage.totalTokens === 'number' ? value.usage.totalTokens : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveMimeType(
  image: ToyShelfImage,
  imageFile: File,
): SupportedImageMimeType | null {
  const declaredType = normalizeMimeType(image.mimeType) ?? normalizeMimeType(imageFile.type);

  if (declaredType) {
    return declaredType;
  }

  const fileName = image.fileName ?? imageFile.name ?? image.uri;
  const pathWithoutQuery = fileName.split(/[?#]/, 1)[0].toLowerCase();

  if (pathWithoutQuery.endsWith('.jpg') || pathWithoutQuery.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (pathWithoutQuery.endsWith('.png')) {
    return 'image/png';
  }

  if (pathWithoutQuery.endsWith('.webp')) {
    return 'image/webp';
  }

  return null;
}

function normalizeMimeType(value: string | null | undefined): SupportedImageMimeType | null {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'image/jpeg';
  }

  if (normalized === 'image/png' || normalized === 'image/webp') {
    return normalized;
  }

  return null;
}

function logDevelopmentEvent(
  event: string,
  metadata?: Record<string, unknown>,
  level: 'info' | 'warn' = 'info',
): void {
  if (!__DEV__) {
    return;
  }

  console[level](`[toy-analysis] ${event}`, metadata ?? {});
}

function getSafeErrorMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: 'Unknown error' };
  }

  const errorWithContext = error as Error & {
    context?: unknown;
    status?: unknown;
  };
  const contextStatus =
    typeof Response !== 'undefined' && errorWithContext.context instanceof Response
      ? errorWithContext.context.status
      : undefined;

  return {
    name: error.name,
    message: error.message,
    status: typeof errorWithContext.status === 'number' ? errorWithContext.status : undefined,
    contextStatus,
  };
}

class ToyAnalysisServiceError extends Error {
  constructor(readonly code: string, options?: ErrorOptions) {
    super('Toy shelf analysis failed.', options);
    this.name = 'ToyAnalysisServiceError';
  }
}
