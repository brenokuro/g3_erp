import { del, get, head, type GetBlobResult } from '@vercel/blob';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export function isBlobUploadConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isValidBlobPathname(objectPath: string): boolean {
  return (
    /^orders\/\d+\/[0-9a-f-]+$/.test(objectPath) ||
    /^orders\/\d+\/[0-9a-f-]+-[^/]+$/.test(objectPath)
  );
}

export async function getObjectMetadata(objectPath: string) {
  try {
    return await head(objectPath);
  } catch (error) {
    if (isBlobNotFoundError(error)) {
      throw new ObjectNotFoundError();
    }
    throw error;
  }
}

export async function downloadObject(
  objectPath: string,
): Promise<GetBlobResult> {
  const result = await get(objectPath, { access: 'private' });
  if (!result) {
    throw new ObjectNotFoundError();
  }
  return result;
}

export async function deleteObject(objectPath: string): Promise<void> {
  await del(objectPath);
}

function isBlobNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: unknown }).name;
  return name === 'BlobNotFoundError';
}
