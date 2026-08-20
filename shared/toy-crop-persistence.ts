export type ToyCropPersistenceOutcome =
  | 'persisted'
  | 'upload-failed'
  | 'registration-failed';

export type ToyCropPersistenceOperations = {
  objectExists(): Promise<boolean>;
  upload(): Promise<boolean>;
  register(): Promise<boolean>;
};

export async function persistDeterministicToyCrop(
  operations: ToyCropPersistenceOperations,
): Promise<ToyCropPersistenceOutcome> {
  if (!await operations.objectExists()) {
    const uploaded = await operations.upload();
    if (!uploaded && !await operations.objectExists()) {
      return 'upload-failed';
    }
  }

  return await operations.register()
    ? 'persisted'
    : 'registration-failed';
}
