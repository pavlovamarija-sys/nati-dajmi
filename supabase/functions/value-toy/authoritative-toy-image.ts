export const TOY_IMAGE_BUCKET = 'toy-shelf-images';
export const MAX_AUTHORITATIVE_TOY_IMAGE_BYTES = 10 * 1024 * 1024;
export const AUTHORITATIVE_TOY_IMAGE_MIME_TYPE = 'image/jpeg';

export type AuthoritativeToyImage = {
  mimeType: typeof AUTHORITATIVE_TOY_IMAGE_MIME_TYPE;
  bytes: Uint8Array;
};

export type AuthoritativeToyImageResult =
  | { available: true; image: AuthoritativeToyImage }
  | {
      available: false;
      reason: 'missing-path' | 'download-failed' | 'invalid-payload';
    };

export function expectedAuthoritativeToyImagePath(
  userId: string,
  analysisId: string,
  toyAnalysisItemId: string,
): string | null {
  if (
    !isSafePathComponent(userId) ||
    !isSafePathComponent(analysisId) ||
    !isSafePathComponent(toyAnalysisItemId)
  ) {
    return null;
  }

  return `${userId}/${analysisId}/${toyAnalysisItemId}.jpg`;
}

export function isExpectedAuthoritativeToyImagePath(
  imagePath: string,
  userId: string,
  analysisId: string,
  toyAnalysisItemId: string,
): boolean {
  const expectedPath = expectedAuthoritativeToyImagePath(
    userId,
    analysisId,
    toyAnalysisItemId,
  );

  return expectedPath !== null && imagePath === expectedPath;
}

export function validateAuthoritativeToyImage(
  mimeType: string,
  bytes: Uint8Array,
): AuthoritativeToyImage | null {
  if (
    mimeType.trim().toLowerCase() !== AUTHORITATIVE_TOY_IMAGE_MIME_TYPE ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_AUTHORITATIVE_TOY_IMAGE_BYTES ||
    !hasJpegSignature(bytes)
  ) {
    return null;
  }

  return {
    mimeType: AUTHORITATIVE_TOY_IMAGE_MIME_TYPE,
    bytes,
  };
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
}

function isSafePathComponent(value: string): boolean {
  return Boolean(value.trim()) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('..');
}
