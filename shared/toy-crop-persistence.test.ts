// @ts-ignore Deno requires explicit TypeScript extensions for local modules.
import { persistDeterministicToyCrop } from './toy-crop-persistence.ts';

declare const Deno: {
  test(name: string, test: () => void | Promise<void>): void;
};

Deno.test('retains an uploaded object when registration fails', async () => {
  let objectExists = false;
  let uploadCount = 0;
  const result = await persistDeterministicToyCrop({
    async objectExists() { return objectExists; },
    async upload() { uploadCount += 1; objectExists = true; return true; },
    async register() { return false; },
  });

  assertEqual(result, 'registration-failed');
  assertEqual(objectExists, true);
  assertEqual(uploadCount, 1);
});

Deno.test('same-session retry reuses the retained object without another upload', async () => {
  let objectExists = false;
  let uploadCount = 0;
  let registrationCount = 0;
  const operations = {
    async objectExists() { return objectExists; },
    async upload() { uploadCount += 1; objectExists = true; return true; },
    async register() { registrationCount += 1; return registrationCount > 1; },
  };

  assertEqual(await persistDeterministicToyCrop(operations), 'registration-failed');
  assertEqual(await persistDeterministicToyCrop(operations), 'persisted');
  assertEqual(uploadCount, 1);
  assertEqual(registrationCount, 2);
});

Deno.test('restart recovery registers an existing object without a local upload', async () => {
  let uploadCount = 0;
  let registrationCount = 0;
  const result = await persistDeterministicToyCrop({
    async objectExists() { return true; },
    async upload() { uploadCount += 1; return false; },
    async register() { registrationCount += 1; return true; },
  });

  assertEqual(result, 'persisted');
  assertEqual(uploadCount, 0);
  assertEqual(registrationCount, 1);
});

Deno.test('no existing object and no available upload stays blocked', async () => {
  let registrationCount = 0;
  const result = await persistDeterministicToyCrop({
    async objectExists() { return false; },
    async upload() { return false; },
    async register() { registrationCount += 1; return true; },
  });

  assertEqual(result, 'upload-failed');
  assertEqual(registrationCount, 0);
});

Deno.test('normal upload and registration remains successful', async () => {
  let objectExists = false;
  const result = await persistDeterministicToyCrop({
    async objectExists() { return objectExists; },
    async upload() { objectExists = true; return true; },
    async register() { return true; },
  });
  assertEqual(result, 'persisted');
});

function assertEqual(actual: unknown, expected: unknown): void {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}.`);
  }
}
