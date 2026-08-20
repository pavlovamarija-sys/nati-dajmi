export type CropState = {
  cropExpected: boolean;
  imagePath: string | null;
};

export type CropReadinessResult =
  | { ready: true }
  | { ready: false; reason: 'crop-unavailable' | 'auth-unavailable' | 'readiness-unavailable' };

export type CropUploadStatus = 'uploading' | 'failed';

type UploadEntry = {
  promise: Promise<boolean>;
  status: CropUploadStatus;
};

export class CropUploadRegistry {
  private readonly entries = new Map<string, UploadEntry>();

  constructor(private readonly maxRetainedFailures = 50) {}

  getStatus(toyItemId: string): CropUploadStatus | null {
    return this.entries.get(toyItemId)?.status ?? null;
  }

  get size(): number {
    return this.entries.size;
  }

  async awaitUpload(toyItemId: string): Promise<boolean> {
    return this.entries.get(toyItemId)?.promise ?? false;
  }

  start(toyItemId: string, operation: () => Promise<boolean>): Promise<boolean> {
    const existing = this.entries.get(toyItemId);
    if (existing?.status === 'uploading') {
      return existing.promise;
    }

    let promise: Promise<boolean>;
    promise = operation()
      .then((persisted) => {
        if (this.entries.get(toyItemId)?.promise === promise) {
          persisted ? this.entries.delete(toyItemId) : this.retainFailure(toyItemId, promise);
        }
        return persisted;
      })
      .catch(() => {
        if (this.entries.get(toyItemId)?.promise === promise) {
          this.retainFailure(toyItemId, promise);
        }
        return false;
      });
    this.entries.set(toyItemId, { promise, status: 'uploading' });
    return promise;
  }

  retry(toyItemId: string, operation: () => Promise<boolean>): Promise<boolean> {
    const existing = this.entries.get(toyItemId);
    if (existing?.status === 'uploading') {
      return existing.promise;
    }
    this.entries.delete(toyItemId);
    return this.start(toyItemId, operation);
  }

  clear(toyItemId: string): void {
    this.entries.delete(toyItemId);
  }

  reset(): void {
    this.entries.clear();
  }

  private retainFailure(toyItemId: string, promise: Promise<boolean>): void {
    this.entries.delete(toyItemId);
    this.entries.set(toyItemId, { promise, status: 'failed' });
    while (this.entries.size > this.maxRetainedFailures) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}

export function classifyCropState(state: CropState): CropReadinessResult {
  if (!state.cropExpected || state.imagePath) return { ready: true };
  return { ready: false, reason: 'crop-unavailable' };
}

export function isLocalCropUri(uri: string | undefined): boolean {
  if (!uri || typeof uri !== 'string') return false;
  const normalized = uri.trim().toLowerCase();
  return !normalized.startsWith('http://') && !normalized.startsWith('https://');
}

export type EnsureCropReadyInput = {
  toyAnalysisItemId: string;
  analysisId?: string;
  toyImageUri?: string;
  onUploadPending?: () => void;
};

export type CropReadinessDependencies = {
  readCropState(toyItemId: string): Promise<CropState | null>;
  getAuthenticatedUserId(): Promise<string | null>;
  startUpload(userId: string, analysisId: string, toyItemId: string, imageUri: string): Promise<boolean>;
  recoverUpload(userId: string, analysisId: string, toyItemId: string): Promise<boolean>;
};

export async function ensureCropReady(
  input: EnsureCropReadyInput,
  dependencies: CropReadinessDependencies,
  registry: CropUploadRegistry,
): Promise<CropReadinessResult> {
  const activeStatus = registry.getStatus(input.toyAnalysisItemId);
  if (activeStatus === 'uploading') {
    input.onUploadPending?.();
    if (!await registry.awaitUpload(input.toyAnalysisItemId)) {
      return { ready: false, reason: 'crop-unavailable' };
    }
  }

  const authoritative = await readState(input.toyAnalysisItemId, dependencies);
  if (!authoritative.ok || authoritative.state === null) {
    return { ready: false, reason: 'readiness-unavailable' };
  }
  const current = classifyCropState(authoritative.state);
  if (current.ready || !authoritative.state.cropExpected) return current;
  if (activeStatus === 'failed') return { ready: false, reason: 'crop-unavailable' };
  if (!input.analysisId) return current;

  let userId: string | null;
  try {
    userId = await dependencies.getAuthenticatedUserId();
  } catch {
    return { ready: false, reason: 'auth-unavailable' };
  }
  if (!userId) return { ready: false, reason: 'auth-unavailable' };

  input.onUploadPending?.();
  const persisted = isLocalCropUri(input.toyImageUri)
    ? await dependencies.startUpload(
        userId,
        input.analysisId,
        input.toyAnalysisItemId,
        input.toyImageUri!,
      )
    : await dependencies.recoverUpload(
        userId,
        input.analysisId,
        input.toyAnalysisItemId,
      );
  if (!persisted) return { ready: false, reason: 'crop-unavailable' };

  const refreshed = await readState(input.toyAnalysisItemId, dependencies);
  if (!refreshed.ok || refreshed.state === null) {
    return { ready: false, reason: 'readiness-unavailable' };
  }
  return classifyCropState(refreshed.state);
}

async function readState(toyItemId: string, dependencies: CropReadinessDependencies) {
  try {
    return { ok: true as const, state: await dependencies.readCropState(toyItemId) };
  } catch {
    return { ok: false as const };
  }
}
