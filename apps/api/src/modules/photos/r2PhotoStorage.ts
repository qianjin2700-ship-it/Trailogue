import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PhotoMimeType } from '@trailogue/contracts';

import type { PhotoObjectHead, PhotoObjectStorage } from './photoService.js';

export class R2PhotoStorage implements PhotoObjectStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    input: { endpoint: string; accessKeyId: string; secretAccessKey: string },
  ) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: input.endpoint,
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
    });
  }

  createUploadUrl(input: {
    key: string;
    contentType: PhotoMimeType;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: input.key, ContentType: input.contentType }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async headObject(key: string): Promise<PhotoObjectHead | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  createReadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return record.name === 'NotFound' ||
    record.name === 'NoSuchKey' ||
    record.$metadata?.httpStatusCode === 404;
}
