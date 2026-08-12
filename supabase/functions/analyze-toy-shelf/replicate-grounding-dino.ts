// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import type {
  NormalizedBoundingBox,
  ToyLocalization,
  ToyLocalizationInput,
  ToyLocalizationQuery,
  ToyObjectLocalizationProvider,
} from './localization.ts';

const REPLICATE_PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const REPLICATE_FILES_URL = 'https://api.replicate.com/v1/files';
const GROUNDING_DINO_VERSION =
  'efd10a8ddc57ea28773327e881ce95e20cc1d734c589f7dd01d2036921ed78aa';
const BOX_THRESHOLD = 0.2;
const TEXT_THRESHOLD = 0.2;
const MAX_POLL_ATTEMPTS = 60;

type ProviderDetection = {
  index: number;
  label: string;
  confidence: number;
  boundingBox: NormalizedBoundingBox;
};

export class ReplicateGroundingDinoProvider implements ToyObjectLocalizationProvider {
  constructor(private readonly apiToken: string) {}

  async localizeToys(input: ToyLocalizationInput): Promise<ToyLocalization[]> {
    if (input.toyQueries.length === 0) {
      return [];
    }

    const uploadedImage = await this.uploadImage(input.imageDataUrl);

    try {
      const prediction = await this.createPrediction(input, uploadedImage.url);
      const completedPrediction = await this.waitForPrediction(prediction);
      const detections = parseProviderDetections(
        completedPrediction,
        input.imageWidth,
        input.imageHeight,
      );

      console.info('[toy-analysis] replicate_prediction_output', {
        predictionId: readString(completedPrediction, 'id'),
        outputKeys: readOutputKeys(completedPrediction),
        detectionCount: detections.length,
      });

      return matchDetectionsToQueries(input.toyQueries, detections);
    } finally {
      await this.deleteUploadedImage(uploadedImage.id);
    }
  }

  private async uploadImage(imageDataUrl: string): Promise<{ id: string; url: string }> {
    const image = parseImageDataUrl(imageDataUrl);
    const formData = new FormData();
    formData.append('content', new Blob([image.buffer], { type: image.mimeType }), 'analysis.jpg');

    const response = await fetch(REPLICATE_FILES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiToken}` },
      body: formData,
    });

    if (!response.ok) {
      throw await providerHttpError('file_upload', response);
    }

    const value: unknown = await response.json();
    const id = readString(value, 'id');
    const url = isRecord(value) && isRecord(value.urls)
      ? readString(value.urls, 'get')
      : null;

    if (!id || !url) {
      throw new Error('Localization provider returned malformed file metadata.');
    }

    return { id, url };
  }

  private async deleteUploadedImage(fileId: string): Promise<void> {
    try {
      const response = await fetch(`${REPLICATE_FILES_URL}/${encodeURIComponent(fileId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });

      if (!response.ok && response.status !== 404) {
        console.warn('[toy-analysis] replicate_prediction_error', {
          stage: 'file_cleanup',
          httpStatus: response.status,
        });
      }
    } catch {
      console.warn('[toy-analysis] replicate_prediction_error', {
        stage: 'file_cleanup',
      });
    }
  }

  private async createPrediction(
    input: ToyLocalizationInput,
    imageUrl: string,
  ): Promise<unknown> {
    const response = await fetch(REPLICATE_PREDICTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({
        version: GROUNDING_DINO_VERSION,
        input: {
          image: imageUrl,
          query: input.toyQueries.map((item) => item.query).join(', '),
          box_threshold: BOX_THRESHOLD,
          text_threshold: TEXT_THRESHOLD,
          show_visualisation: false,
        },
      }),
    });

    if (!response.ok) {
      throw await providerHttpError('prediction_creation', response);
    }

    const prediction: unknown = await response.json();
    console.info('[toy-analysis] replicate_prediction_created', {
      httpStatus: response.status,
      predictionId: readString(prediction, 'id'),
      predictionStatus: readString(prediction, 'status'),
      modelVersion: GROUNDING_DINO_VERSION,
      queryCount: input.toyQueries.length,
    });
    return prediction;
  }

  private async waitForPrediction(initialValue: unknown): Promise<unknown> {
    let prediction = initialValue;

    for (let attempt = 0; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      if (!isRecord(prediction) || typeof prediction.status !== 'string') {
        throw new Error('Localization provider returned malformed prediction metadata.');
      }

      console.info('[toy-analysis] replicate_prediction_status', {
        predictionId: readString(prediction, 'id'),
        predictionStatus: prediction.status,
      });

      if (prediction.status === 'succeeded') {
        return prediction;
      }

      if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(
          `Localization provider prediction ${prediction.status}: ${readProviderError(prediction) ?? 'no provider detail'}`,
        );
      }

      const getUrl = isRecord(prediction.urls) ? prediction.urls.get : undefined;

      if (attempt === MAX_POLL_ATTEMPTS || typeof getUrl !== 'string') {
        throw new Error('Localization provider prediction timed out.');
      }

      await delay(1000);
      const response = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });

      if (!response.ok) {
        throw await providerHttpError('prediction_polling', response);
      }

      prediction = await response.json();
    }

    throw new Error('Localization provider prediction timed out.');
  }
}

export function parseProviderDetections(
  prediction: unknown,
  imageWidth: number,
  imageHeight: number,
): ProviderDetection[] {
  if (
    !isRecord(prediction) ||
    prediction.status !== 'succeeded' ||
    !isRecord(prediction.output) ||
    !Array.isArray(prediction.output.detections) ||
    !isPositiveFinite(imageWidth) ||
    !isPositiveFinite(imageHeight)
  ) {
    throw new Error('Localization provider returned malformed output.');
  }

  const detections: ProviderDetection[] = [];
  const returnedDetectionCount = prediction.output.detections.length;

  prediction.output.detections.forEach((value, index) => {
    if (!isRecord(value) || !Array.isArray(value.bbox) || value.bbox.length !== 4) {
      return;
    }

    const [left, top, right, bottom] = value.bbox;
    const confidence = value.confidence;
    const label = typeof value.label === 'string' ? normalizeText(value.label) : '';

    if (
      !label ||
      !isFiniteNumber(left) ||
      !isFiniteNumber(top) ||
      !isFiniteNumber(right) ||
      !isFiniteNumber(bottom) ||
      !isFiniteNumber(confidence) ||
      confidence < 0 ||
      confidence > 1 ||
      left < 0 ||
      top < 0 ||
      right <= left ||
      bottom <= top ||
      right > imageWidth ||
      bottom > imageHeight
    ) {
      return;
    }

    const boundingBox = {
      x: left / imageWidth,
      y: top / imageHeight,
      width: (right - left) / imageWidth,
      height: (bottom - top) / imageHeight,
    };

    if (!isValidNormalizedBoundingBox(boundingBox)) {
      return;
    }

    detections.push({ index, label, confidence, boundingBox });
  });

  console.info('[toy-analysis] replicate_prediction_output', {
    returnedDetectionCount,
    acceptedDetectionCount: detections.length,
    rejectedDetectionCount: returnedDetectionCount - detections.length,
  });

  return detections;
}

export function matchDetectionsToQueries(
  queries: ToyLocalizationQuery[],
  detections: ProviderDetection[],
): ToyLocalization[] {
  const candidates = queries.flatMap((query) =>
    detections
      .map((detection) => ({
        query,
        detection,
        score: labelSimilarity(query.query, detection.label) * detection.confidence,
      }))
      .filter((candidate) => candidate.score > 0),
  );

  candidates.sort(
    (left, right) =>
      right.score - left.score || right.detection.confidence - left.detection.confidence,
  );

  const matchedToyIds = new Set<string>();
  const usedDetectionIndexes = new Set<number>();
  const localizations: ToyLocalization[] = [];

  for (const candidate of candidates) {
    if (
      matchedToyIds.has(candidate.query.toyId) ||
      usedDetectionIndexes.has(candidate.detection.index)
    ) {
      continue;
    }

    matchedToyIds.add(candidate.query.toyId);
    usedDetectionIndexes.add(candidate.detection.index);
    localizations.push({
      toyId: candidate.query.toyId,
      query: candidate.query.query,
      confidence: candidate.detection.confidence,
      boundingBox: candidate.detection.boundingBox,
    });
  }

  return localizations;
}

function labelSimilarity(query: string, label: string): number {
  const queryTokens = tokenize(query);
  const labelTokens = tokenize(label);

  if (queryTokens.size === 0 || labelTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of labelTokens) {
    if (queryTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / labelTokens.size;
}

function tokenize(value: string): Set<string> {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isValidNormalizedBoundingBox(value: NormalizedBoundingBox): boolean {
  return (
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= 1 &&
    value.y + value.height <= 1
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseImageDataUrl(value: string): { mimeType: string; buffer: ArrayBuffer } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);

  if (!match) {
    throw new Error('Localization image input is not a supported data URL.');
  }

  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { mimeType: match[1], buffer: bytes.buffer as ArrayBuffer };
}

async function providerHttpError(stage: string, response: Response): Promise<Error> {
  const providerMessage = await readSafeProviderMessage(response);
  const message = [
    `Localization provider ${stage} returned HTTP ${response.status}.`,
    classifyHttpStatus(response.status),
    providerMessage,
  ].filter(Boolean).join(' ');

  console.warn('[toy-analysis] replicate_prediction_error', {
    stage,
    httpStatus: response.status,
    category: classifyHttpStatus(response.status),
    providerMessage,
  });

  return new Error(message);
}

async function readSafeProviderMessage(response: Response): Promise<string | null> {
  try {
    const value: unknown = await response.json();

    if (!isRecord(value)) {
      return null;
    }

    for (const key of ['detail', 'error', 'title']) {
      const message = value[key];

      if (typeof message === 'string' && message.trim()) {
        return message.trim().slice(0, 300);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function classifyHttpStatus(status: number): string {
  if (status === 401 || status === 403) return 'authentication_failure';
  if (status === 402) return 'billing_failure';
  if (status === 404) return 'model_or_version_not_found';
  if (status === 413) return 'image_payload_too_large';
  if (status === 422 || status === 400) return 'invalid_request';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'provider_failure' : 'request_failure';
}

function readProviderError(value: Record<string, unknown>): string | null {
  return typeof value.error === 'string' && value.error.trim()
    ? value.error.trim().slice(0, 300)
    : null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const candidate = value[key];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function readOutputKeys(value: unknown): string[] {
  return isRecord(value) && isRecord(value.output) ? Object.keys(value.output) : [];
}
