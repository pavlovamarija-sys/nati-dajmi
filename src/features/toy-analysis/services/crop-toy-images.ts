import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type {
  DetectedToyCandidate,
  LocalToyCandidateImage,
  ToyAnalysisItem,
  ToyAnalysisResult,
  ToyBoundingBox,
  ToyShelfImage,
} from '@/features/toy-analysis/types/toy-analysis';

export const TOY_CROP_PADDING_RATIO = 0.075;
const CROP_COMPRESSION = 0.92;
const SEMANTIC_MAX_SIDE = 512;
const SEMANTIC_COMPRESSION = 0.88;

export async function createLocalToyCandidateImages(
  candidates: DetectedToyCandidate[],
  sourceImage: ToyShelfImage,
): Promise<LocalToyCandidateImage[]> {
  if (!hasValidDimensions(sourceImage)) {
    throw new Error('Canonical image dimensions are invalid.');
  }

  const created = await Promise.all(
    candidates.map((candidate) => createLocalToyCandidateImage(candidate, sourceImage)),
  );

  return created.filter((candidate): candidate is LocalToyCandidateImage => candidate !== null);
}

async function createLocalToyCandidateImage(
  candidate: DetectedToyCandidate,
  sourceImage: ToyShelfImage,
): Promise<LocalToyCandidateImage | null> {
  try {
    const pixelCrop = normalizedBoxToPixels(
      candidate.boundingBox,
      sourceImage.width,
      sourceImage.height,
    );
    const crop = addPaddingAndClamp(
      pixelCrop,
      sourceImage.width,
      sourceImage.height,
      TOY_CROP_PADDING_RATIO,
    );
    const cropContext = ImageManipulator.manipulate(sourceImage.uri);
    cropContext.crop(crop);
    const cropRendered = await cropContext.renderAsync();
    const highQualityCrop = await cropRendered.saveAsync({
      compress: CROP_COMPRESSION,
      format: SaveFormat.JPEG,
    });

    const semanticContext = ImageManipulator.manipulate(highQualityCrop.uri);
    const longestSide = Math.max(highQualityCrop.width, highQualityCrop.height);
    if (longestSide > SEMANTIC_MAX_SIDE) {
      const scale = SEMANTIC_MAX_SIDE / longestSide;
      semanticContext.resize({
        width: Math.max(1, Math.round(highQualityCrop.width * scale)),
        height: Math.max(1, Math.round(highQualityCrop.height * scale)),
      });
    }
    const semanticRendered = await semanticContext.renderAsync();
    const semanticImage = await semanticRendered.saveAsync({
      base64: true,
      compress: SEMANTIC_COMPRESSION,
      format: SaveFormat.JPEG,
    });

    if (!semanticImage.base64) {
      throw new Error('Semantic candidate image could not be encoded.');
    }

    if (__DEV__) {
      console.info('[toy-analysis] local_candidate_crop_created', {
        candidateId: candidate.candidateId,
        cropWidth: highQualityCrop.width,
        cropHeight: highQualityCrop.height,
        semanticWidth: semanticImage.width,
        semanticHeight: semanticImage.height,
      });
    }

    return {
      ...candidate,
      imageUri: highQualityCrop.uri,
      semanticImageBase64: semanticImage.base64,
    };
  } catch (error) {
    logCropFailure('local_candidate_crop_failed', candidate.candidateId, error);
    return null;
  }
}

export async function addLocalToyCrops(
  result: ToyAnalysisResult,
  sourceImage: ToyShelfImage,
): Promise<ToyAnalysisResult> {
  if (!hasValidDimensions(sourceImage)) {
    logCropFailure('invalid_source_dimensions');
    return result;
  }

  const toys = await Promise.all(
    result.toys.map((toy) => addLocalToyCrop(toy, sourceImage)),
  );

  return { ...result, toys };
}

async function addLocalToyCrop(
  toy: ToyAnalysisItem,
  sourceImage: ToyShelfImage,
): Promise<ToyAnalysisItem> {
  if (!toy.boundingBox) {
    return toy;
  }

  try {
    const pixelCrop = normalizedBoxToPixels(
      toy.boundingBox,
      sourceImage.width,
      sourceImage.height,
    );
    const crop = addPaddingAndClamp(
      pixelCrop,
      sourceImage.width,
      sourceImage.height,
      TOY_CROP_PADDING_RATIO,
    );

    logCropGeometry(toy, sourceImage, pixelCrop, crop);

    const context = ImageManipulator.manipulate(sourceImage.uri);
    context.crop(crop);
    const renderedImage = await context.renderAsync();
    const savedImage = await renderedImage.saveAsync({
      compress: CROP_COMPRESSION,
      format: SaveFormat.JPEG,
    });

    return { ...toy, imageUri: savedImage.uri };
  } catch (error) {
    logCropFailure('toy_crop_failed', toy.id, error);
    return toy;
  }
}

function normalizedBoxToPixels(
  box: ToyBoundingBox,
  imageWidth: number,
  imageHeight: number,
): { originX: number; originY: number; width: number; height: number } {
  return {
    originX: box.x * imageWidth,
    originY: box.y * imageHeight,
    width: box.width * imageWidth,
    height: box.height * imageHeight,
  };
}

function addPaddingAndClamp(
  crop: { originX: number; originY: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  paddingRatio: number,
): { originX: number; originY: number; width: number; height: number } {
  const horizontalPadding = crop.width * paddingRatio;
  const verticalPadding = crop.height * paddingRatio;

  const originX = Math.max(0, Math.floor(crop.originX - horizontalPadding));
  const originY = Math.max(0, Math.floor(crop.originY - verticalPadding));
  const right = Math.min(
    imageWidth,
    Math.ceil(crop.originX + crop.width + horizontalPadding),
  );
  const bottom = Math.min(
    imageHeight,
    Math.ceil(crop.originY + crop.height + verticalPadding),
  );

  return {
    originX,
    originY,
    width: Math.max(1, right - originX),
    height: Math.max(1, bottom - originY),
  };
}

function logCropGeometry(
  toy: ToyAnalysisItem,
  sourceImage: ToyShelfImage,
  pixelCrop: { originX: number; originY: number; width: number; height: number },
  paddedCrop: { originX: number; originY: number; width: number; height: number },
): void {
  if (!__DEV__) {
    return;
  }

  console.info('[toy-analysis] toy_crop_debug', {
    name: toy.name,
    normalized: toy.boundingBox,
    imageSize: { width: sourceImage.width, height: sourceImage.height },
    pixelCrop,
    paddedCrop,
  });
}

function hasValidDimensions(image: ToyShelfImage): boolean {
  return (
    Number.isFinite(image.width) &&
    Number.isFinite(image.height) &&
    image.width > 0 &&
    image.height > 0
  );
}

function logCropFailure(event: string, toyId?: string, error?: unknown): void {
  if (!__DEV__) {
    return;
  }

  console.warn(`[toy-analysis] ${event}`, {
    toyId,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : undefined,
  });
}
