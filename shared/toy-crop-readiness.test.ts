// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { CropUploadRegistry, classifyCropState, ensureCropReady, isLocalCropUri, type CropReadinessDependencies } from './toy-crop-readiness.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('authoritative marker distinguishes expected crops from legacy items', () => {
  assertJson(classifyCropState({ cropExpected: true, imagePath: null }), {
    ready: false,
    reason: 'crop-unavailable',
  });
  assertJson(classifyCropState({ cropExpected: true, imagePath: 'u/a/t.jpg' }), { ready: true });
  assertJson(classifyCropState({ cropExpected: false, imagePath: null }), { ready: true });
});

Deno.test('reload blocks expected crop with null path and no registry entry', async () => {
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'reload' },
    dependencies({ cropExpected: true, imagePath: null }),
    new CropUploadRegistry(),
  ), { ready: false, reason: 'crop-unavailable' });
});

Deno.test('pending upload is awaited before authoritative readiness is read', async () => {
  const registry = new CropUploadRegistry();
  const deferred = createDeferred<boolean>();
  void registry.start('pending', () => deferred.promise);
  let read = false;
  let notified = false;
  const result = ensureCropReady(
    { toyAnalysisItemId: 'pending', onUploadPending: () => { notified = true; } },
    dependencies({ cropExpected: true, imagePath: 'u/a/pending.jpg' }, () => { read = true; }),
    registry,
  );
  await Promise.resolve();
  assertEqual(notified, true);
  assertEqual(read, false);
  deferred.resolve(true);
  assertJson(await result, { ready: true });
});

Deno.test('upload failure and missing local crop remain blocked', async () => {
  const failedRegistry = new CropUploadRegistry();
  await failedRegistry.start('failed', async () => false);
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'failed' },
    dependencies({ cropExpected: true, imagePath: null }),
    failedRegistry,
  ), { ready: false, reason: 'crop-unavailable' });
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'missing' },
    dependencies({ cropExpected: true, imagePath: null }),
    new CropUploadRegistry(),
  ), { ready: false, reason: 'crop-unavailable' });
});

Deno.test('missing auth and repository failures fail closed', async () => {
  const noAuth = dependencies({ cropExpected: true, imagePath: null });
  noAuth.getAuthenticatedUserId = async () => null;
  assertJson(await ensureCropReady({
    toyAnalysisItemId: 'auth',
    analysisId: 'analysis',
    toyImageUri: 'file:///crop.jpg',
  }, noAuth, new CropUploadRegistry()), { ready: false, reason: 'auth-unavailable' });

  const queryFailure = dependencies({ cropExpected: true, imagePath: null });
  queryFailure.readCropState = async () => { throw new Error('query failed'); };
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'query' },
    queryFailure,
    new CropUploadRegistry(),
  ), { ready: false, reason: 'readiness-unavailable' });
});

Deno.test('an already-uploaded object can be registered without a local crop', async () => {
  let reads = 0;
  let recoveryCalls = 0;
  const deps = dependencies({ cropExpected: true, imagePath: null });
  deps.readCropState = async () => {
    reads += 1;
    return reads === 1
      ? { cropExpected: true, imagePath: null }
      : { cropExpected: true, imagePath: 'user/analysis/orphan.jpg' };
  };
  deps.recoverUpload = async () => { recoveryCalls += 1; return true; };
  assertJson(await ensureCropReady({
    toyAnalysisItemId: 'orphan',
    analysisId: 'analysis',
  }, deps, new CropUploadRegistry()), { ready: true });
  assertEqual(recoveryCalls, 1);
});

Deno.test('ready, pending, and failed toys remain isolated', async () => {
  const registry = new CropUploadRegistry();
  const pending = createDeferred<boolean>();
  void registry.start('b', () => pending.promise);
  await registry.start('c', async () => false);
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'a' },
    dependencies({ cropExpected: true, imagePath: 'u/a/a.jpg' }),
    registry,
  ), { ready: true });
  assertJson(await ensureCropReady(
    { toyAnalysisItemId: 'c' },
    dependencies({ cropExpected: true, imagePath: null }),
    registry,
  ), { ready: false, reason: 'crop-unavailable' });
  const pendingResult = ensureCropReady(
    { toyAnalysisItemId: 'b' },
    dependencies({ cropExpected: true, imagePath: 'u/a/b.jpg' }),
    registry,
  );
  pending.resolve(true);
  assertJson(await pendingResult, { ready: true });
});

Deno.test('duplicate retry calls share one operation', async () => {
  const registry = new CropUploadRegistry();
  const deferred = createDeferred<boolean>();
  let calls = 0;
  const operation = () => { calls += 1; return deferred.promise; };
  const first = registry.retry('toy', operation);
  const second = registry.retry('toy', operation);
  assertEqual(calls, 1);
  deferred.resolve(true);
  assertEqual(await first, true);
  assertEqual(await second, true);
});

Deno.test('successful entries are cleaned and failed entries are bounded', async () => {
  const registry = new CropUploadRegistry(2);
  await registry.start('success', async () => true);
  assertEqual(registry.size, 0);
  await registry.start('failure-1', async () => false);
  await registry.start('failure-2', async () => false);
  await registry.start('failure-3', async () => false);
  assertEqual(registry.size, 2);
});

Deno.test('local crop URI recognition excludes remote URLs', () => {
  assertEqual(isLocalCropUri('file:///crop.jpg'), true);
  assertEqual(isLocalCropUri('ph://asset'), true);
  assertEqual(isLocalCropUri('https://example.test/crop.jpg'), false);
});

function dependencies(
  state: { cropExpected: boolean; imagePath: string | null },
  onRead?: () => void,
): CropReadinessDependencies {
  return {
    async readCropState() { onRead?.(); return state; },
    async getAuthenticatedUserId() { return 'user'; },
    async startUpload() { return true; },
    async recoverUpload() { return false; },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${expected}, received ${actual}.`);
}

function assertJson(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}
