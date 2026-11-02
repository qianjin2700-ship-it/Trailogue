import {
  DeleteObjectCommand,
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
  private readonly keyPrefix: string;

  constructor(
    private readonly bucket: string,
    input: { endpoint: string; accessKeyId: string; secretAccessKey: string; keyPrefix?: string },
  ) {
    this.keyPrefix = normalizeKeyPrefix(input.keyPrefix);
    this.client = new S3Client({
      region: 'auto',
      endpoint: input.endpoint,
      credentials: {
        accessKeyId: input.accessKeyId,
        secretAccessKey: input.secretAccessKey,
      },
    });
  }

  /** 数据库里保存的是不带前缀的对象键，前缀只在存储层拼接，便于多环境共用 bucket。 */
  private objectKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  createUploadUrl(input: {
    key: string;
    contentType: PhotoMimeType;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.objectKey(input.key),
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async headObject(key: string): Promise<PhotoObjectHead | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      );
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
      new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }
}

/**
 * 归一化对象键前缀：去掉首尾多余斜杠，非空时补一个结尾斜杠。
 * `production` → `production/`；`` / `/` → ``（保持原有行为）。
 */
export function normalizeKeyPrefix(value: string | undefined): string {
  const trimmed = (value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

function isMissingObject(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const record = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return record.name === 'NotFound' ||
    record.name === 'NoSuchKey' ||
    record.$metadata?.httpStatusCode === 404;
}
