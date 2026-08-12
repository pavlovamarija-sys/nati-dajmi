import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ToyShelfImage } from '@/features/toy-analysis/types/toy-analysis';

type PreparedAnalysisImage = {
  base64: string;
  image: ToyShelfImage;
};

export async function prepareCanonicalAnalysisImage(
  sourceImage: ToyShelfImage,
): Promise<PreparedAnalysisImage> {
  const context = ImageManipulator.manipulate(sourceImage.uri);
  const renderedImage = await context.renderAsync();
  const savedImage = await renderedImage.saveAsync({
    base64: true,
    compress: 1,
    format: SaveFormat.JPEG,
  });

  if (
    !savedImage.base64 ||
    !Number.isFinite(savedImage.width) ||
    !Number.isFinite(savedImage.height) ||
    savedImage.width <= 0 ||
    savedImage.height <= 0
  ) {
    throw new Error('Canonical analysis image could not be created.');
  }

  return {
    base64: savedImage.base64,
    image: {
      uri: savedImage.uri,
      width: savedImage.width,
      height: savedImage.height,
      fileName: null,
      mimeType: 'image/jpeg',
    },
  };
}
