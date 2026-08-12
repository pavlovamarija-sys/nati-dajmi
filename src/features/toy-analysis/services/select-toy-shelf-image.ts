import * as ImagePicker from 'expo-image-picker';

import type {
  ImageSelectionResult,
  ToyShelfImage,
} from '@/features/toy-analysis/types/toy-analysis';

const pickerOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 1,
};

function toToyShelfImage(asset: ImagePicker.ImagePickerAsset): ToyShelfImage {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
  };
}

export async function takeToyShelfPhoto(): Promise<ImageSelectionResult> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return { status: 'permission-denied' };
    }

    const result = await ImagePicker.launchCameraAsync({
      ...pickerOptions,
      cameraType: ImagePicker.CameraType.back,
    });

    if (result.canceled) {
      return { status: 'cancelled' };
    }

    return { status: 'selected', image: toToyShelfImage(result.assets[0]) };
  } catch {
    return { status: 'error' };
  }
}

export async function chooseToyShelfPhoto(): Promise<ImageSelectionResult> {
  try {
    // The system photo picker does not require broad library access for images.
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (result.canceled) {
      return { status: 'cancelled' };
    }

    return { status: 'selected', image: toToyShelfImage(result.assets[0]) };
  } catch {
    return { status: 'error' };
  }
}
