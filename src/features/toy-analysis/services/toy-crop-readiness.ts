import { supabase } from '@/lib/supabase/client';
import { getToyAnalysisItemCropState } from '@/features/toy-analysis/repositories/toy-analysis-repository';
import {
  persistOneToyCrop,
  recoverExistingToyCrop,
  type ToyCropUpload,
} from '@/features/toy-analysis/services/upload-toy-crops';
import {
  CropUploadRegistry,
  classifyCropState,
  ensureCropReady,
  isLocalCropUri,
  type CropReadinessResult,
  type CropUploadStatus,
  type EnsureCropReadyInput,
} from '../../../../shared/toy-crop-readiness';

export type ActiveCropUploadStatus = CropUploadStatus;
export type { CropReadinessResult, EnsureCropReadyInput };
export { classifyCropState as classifyAuthoritativeCropState, isLocalCropUri };

const activeUploads = new CropUploadRegistry();

export function getActiveToyCropStatus(toyItemId: string): ActiveCropUploadStatus | null {
  return activeUploads.getStatus(toyItemId);
}

export function awaitActiveToyCropUpload(toyItemId: string): Promise<boolean> {
  return activeUploads.awaitUpload(toyItemId);
}

export function startToyCropUpload(
  authenticatedUserId: string,
  analysisId: string,
  crop: ToyCropUpload,
  persistCrop: typeof persistOneToyCrop = persistOneToyCrop,
): Promise<boolean> {
  return activeUploads.start(crop.toyItemId, async () => {
    const result = await persistCrop(authenticatedUserId, analysisId, crop);
    return result.persisted;
  });
}

export function startBatchToyCropUploads(
  authenticatedUserId: string,
  analysisId: string,
  crops: readonly ToyCropUpload[],
): void {
  for (const crop of crops) void startToyCropUpload(authenticatedUserId, analysisId, crop);
}

export function retryToyCropUpload(
  authenticatedUserId: string,
  analysisId: string,
  crop: ToyCropUpload,
  persistCrop: typeof persistOneToyCrop = persistOneToyCrop,
): Promise<boolean> {
  return activeUploads.retry(crop.toyItemId, async () => {
    const result = await persistCrop(authenticatedUserId, analysisId, crop);
    return result.persisted;
  });
}

export function clearToyCropUploadStatus(toyItemId: string): void {
  activeUploads.clear(toyItemId);
}

export function resetAllActiveToyCropUploads(): void {
  activeUploads.reset();
}

export function getTrackedToyCropUploadCount(): number {
  return activeUploads.size;
}

export function ensureCropReadyForValuation(input: EnsureCropReadyInput): Promise<CropReadinessResult> {
  return ensureCropReady(input, {
    readCropState: getToyAnalysisItemCropState,
    async getAuthenticatedUserId() {
      const { data, error } = await supabase.auth.getUser();
      return !error && data.user?.id ? data.user.id : null;
    },
    startUpload(userId, analysisId, toyItemId, imageUri) {
      return startToyCropUpload(userId, analysisId, { toyItemId, imageUri });
    },
    recoverUpload: recoverExistingToyCrop,
  }, activeUploads);
}
