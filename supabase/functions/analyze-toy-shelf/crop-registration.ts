export const TOY_IMAGE_BUCKET = 'toy-shelf-images';

export type CropRegistrationInput = {
  analysisId: string;
  toyItemId: string;
  imagePath: string;
};

export function expectedCropImagePath(
  userId: string,
  analysisId: string,
  toyItemId: string,
): string {
  return `${userId}/${analysisId}/${toyItemId}.jpg`;
}

export function isValidCropRegistrationPath(
  userId: string,
  input: CropRegistrationInput,
): boolean {
  if (
    !userId ||
    !input.analysisId ||
    !input.toyItemId ||
    !input.imagePath ||
    input.imagePath.includes('..') ||
    input.imagePath.includes('\\')
  ) {
    return false;
  }

  return input.imagePath === expectedCropImagePath(
    userId,
    input.analysisId,
    input.toyItemId,
  );
}

