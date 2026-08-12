import type {
  DetectedToyCandidate,
  ToyBoundingBox,
  ToyShelfImage,
} from '@/features/toy-analysis/types/toy-analysis';
import { developmentConfig } from '@/lib/config/env';

const DETECTOR_TIMEOUT_MS = 45_000;

type DetectorResponse = {
  imageWidth: number;
  imageHeight: number;
  candidates: DetectedToyCandidate[];
};

export function isLocalDetectorConfigured(): boolean {
  return developmentConfig.localDetectorUrl !== null;
}

export async function detectToyCandidates(
  canonicalImage: ToyShelfImage,
): Promise<DetectedToyCandidate[]> {
  const baseUrl = developmentConfig.localDetectorUrl;

  if (!baseUrl) {
    throw new Error('Local detector URL is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DETECTOR_TIMEOUT_MS);
  const formData = new FormData();
  formData.append('image', {
    uri: canonicalImage.uri,
    name: 'canonical-toy-shelf.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);

  try {
    const response = await fetch(`${baseUrl}/detect-toys`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Local detector returned HTTP ${response.status}.`);
    }

    const parsed = parseDetectorResponse(await response.json());
    if (
      parsed.imageWidth !== canonicalImage.width ||
      parsed.imageHeight !== canonicalImage.height
    ) {
      throw new Error('Local detector image dimensions do not match the canonical image.');
    }

    return parsed.candidates;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseDetectorResponse(value: unknown): DetectorResponse {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.imageWidth) ||
    !isPositiveInteger(value.imageHeight) ||
    !Array.isArray(value.candidates)
  ) {
    throw new Error('Local detector returned malformed data.');
  }

  const candidateIds = new Set<string>();
  const candidates = value.candidates.map((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error('Local detector returned an invalid candidate.');
    }

    const candidateId = typeof candidate.candidateId === 'string'
      ? candidate.candidateId.trim()
      : '';
    const confidence = candidate.confidence;
    const boundingBox = parseBoundingBox(candidate.boundingBox);

    if (
      !candidateId ||
      candidateIds.has(candidateId) ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      !boundingBox
    ) {
      throw new Error('Local detector returned an invalid candidate.');
    }

    candidateIds.add(candidateId);
    return { candidateId, confidence, boundingBox };
  });

  return {
    imageWidth: value.imageWidth,
    imageHeight: value.imageHeight,
    candidates,
  };
}

function parseBoundingBox(value: unknown): ToyBoundingBox | null {
  if (!isRecord(value)) {
    return null;
  }

  const { x, y, width, height } = value;
  if (
    !isNormalizedNumber(x) ||
    !isNormalizedNumber(y) ||
    !isNormalizedNumber(width) ||
    !isNormalizedNumber(height) ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 + Number.EPSILON ||
    y + height > 1 + Number.EPSILON
  ) {
    return null;
  }

  return { x, y, width, height };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNormalizedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
