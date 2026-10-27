import { randomUUID } from 'node:crypto';

import type {
  CreatePhotoUploadRequest,
  PhotoDTO,
  PhotoMimeType,
  PhotoUploadIntentDTO,
} from '@trailogue/contracts';
import type { PhotoRecord, PhotoRepository, TripRepository } from '@trailogue/database';

import { HttpError } from '../../errors/httpError.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const satisfies readonly PhotoMimeType[];

export interface PhotoObjectHead {
  size: number;
  contentType: string | null;
  etag: string | null;
}

export interface PhotoObjectStorage {
  createUploadUrl(input: {
    key: string;
    contentType: PhotoMimeType;
    expiresInSeconds: number;
  }): Promise<string>;
  headObject(key: string): Promise<PhotoObjectHead | null>;
  createReadUrl(key: string, expiresInSeconds: number): Promise<string>;
}

interface PhotoServiceDependencies {
  photos: Pick<
    PhotoRepository,
    'createUploadIntent' | 'findByIdForUserAndTrip' | 'markFailed' | 'markReady' | 'listReadyForTrip'
  >;
  trips: Pick<TripRepository, 'findByIdForUser'>;
  storage: PhotoObjectStorage;
  maxBytes: number;
  uploadUrlTtlSeconds: number;
  readUrlTtlSeconds: number;
  now?: () => Date;
}

export class PhotoService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: PhotoServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async createUploadIntent(
    userId: string,
    tripId: string,
    input: CreatePhotoUploadRequest,
    idempotencyKey: string,
  ): Promise<PhotoUploadIntentDTO> {
    await this.requireOwnedTrip(userId, tripId);
    this.validateUpload(input, idempotencyKey);

    const mimeType = input.mimeType as PhotoMimeType;
    const now = this.now();
    const photoId = randomUUID();
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const created = await this.dependencies.photos.createUploadIntent({
      id: photoId,
      userId,
      tripId,
      clientUploadId: input.clientUploadId,
      storageKey: `users/${userId}/trips/${tripId}/photos/${photoId}/original.${extension}`,
      originalFilename: sanitizeFilename(input.originalFilename, extension),
      mimeType,
      fileSize: input.fileSize,
      width: input.width,
      height: input.height,
      uploadExpiresAt: new Date(now.getTime() + this.dependencies.uploadUrlTtlSeconds * 1_000),
    });

    if (!matchesUploadIntent(created, input, userId, tripId)) {
      throw new HttpError(409, 'CONFLICT', 'Idempotency key was already used for another upload');
    }
    if (created.status !== 'pending' || !created.uploadExpiresAt) {
      throw new HttpError(409, 'CONFLICT', 'Photo upload is no longer pending');
    }

    const uploadUrl = await this.dependencies.storage.createUploadUrl({
      key: created.storageKey,
      contentType: mimeType,
      expiresInSeconds: this.dependencies.uploadUrlTtlSeconds,
    });
    return {
      photoId: created.id,
      uploadUrl,
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      expiresAt: created.uploadExpiresAt.toISOString(),
      maxBytes: this.dependencies.maxBytes,
      allowedMimeTypes: [...ALLOWED_MIME_TYPES],
    };
  }

  async completeUpload(userId: string, tripId: string, photoId: string): Promise<PhotoDTO> {
    await this.requireOwnedTrip(userId, tripId);
    const photo = await this.dependencies.photos.findByIdForUserAndTrip(photoId, userId, tripId);
    if (!photo) throw new HttpError(404, 'NOT_FOUND', 'Photo not found');
    if (photo.status === 'ready') return this.toPhotoDto(photo);
    if (photo.status !== 'pending') {
      throw new HttpError(409, 'CONFLICT', 'Photo upload cannot be completed');
    }
    if (photo.uploadExpiresAt && photo.uploadExpiresAt.getTime() < this.now().getTime()) {
      throw new HttpError(409, 'CONFLICT', 'Photo upload URL has expired');
    }

    const object = await this.dependencies.storage.headObject(photo.storageKey);
    if (!object) {
      throw new HttpError(409, 'CONFLICT', 'Uploaded photo object was not found');
    }
    const normalizedContentType = object.contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? null;
    if (
      object.size !== photo.fileSize ||
      object.size <= 0 ||
      object.size > this.dependencies.maxBytes ||
      normalizedContentType !== photo.mimeType
    ) {
      await this.dependencies.photos.markFailed({
        id: photo.id,
        userId,
        tripId,
        failureCode: 'OBJECT_METADATA_MISMATCH',
        updatedAt: this.now(),
      });
      throw new HttpError(409, 'CONFLICT', 'Uploaded photo metadata does not match the upload intent');
    }

    const ready = await this.dependencies.photos.markReady({
      id: photo.id,
      userId,
      tripId,
      etag: object.etag,
      uploadedAt: this.now(),
    });
    if (!ready) {
      const latest = await this.dependencies.photos.findByIdForUserAndTrip(photoId, userId, tripId);
      if (latest?.status === 'ready') return this.toPhotoDto(latest);
      throw new HttpError(409, 'CONFLICT', 'Photo upload could not be completed');
    }
    return this.toPhotoDto(ready);
  }

  async listPhotos(userId: string, tripId: string): Promise<PhotoDTO[]> {
    await this.requireOwnedTrip(userId, tripId);
    const photos = await this.dependencies.photos.listReadyForTrip(userId, tripId, 100);
    return Promise.all(photos.map((photo) => this.toPhotoDto(photo)));
  }

  private async requireOwnedTrip(userId: string, tripId: string): Promise<void> {
    const trip = await this.dependencies.trips.findByIdForUser(tripId, userId);
    if (!trip) throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
  }

  private validateUpload(input: CreatePhotoUploadRequest, idempotencyKey: string): void {
    if (idempotencyKey !== input.clientUploadId) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency key must match clientUploadId');
    }
    if (!ALLOWED_MIME_TYPES.includes(input.mimeType as PhotoMimeType)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Photo type is not supported');
    }
    if (input.fileSize <= 0 || input.fileSize > this.dependencies.maxBytes) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Photo size is outside the allowed range');
    }
    if (input.width <= 0 || input.height <= 0) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Photo dimensions are invalid');
    }
  }

  private async toPhotoDto(photo: PhotoRecord): Promise<PhotoDTO> {
    const url = await this.dependencies.storage.createReadUrl(
      photo.storageKey,
      this.dependencies.readUrlTtlSeconds,
    );
    return {
      id: photo.id,
      tripId: photo.tripId,
      status: photo.status,
      url,
      originalFilename: photo.originalFilename,
      mimeType: photo.mimeType as PhotoMimeType,
      fileSize: photo.fileSize,
      width: photo.width,
      height: photo.height,
      capturedAt: photo.capturedAt?.toISOString() ?? null,
      createdAt: photo.createdAt.toISOString(),
      uploadedAt: photo.uploadedAt?.toISOString() ?? null,
    };
  }
}

function matchesUploadIntent(
  photo: PhotoRecord,
  input: CreatePhotoUploadRequest,
  userId: string,
  tripId: string,
): boolean {
  return photo.userId === userId &&
    photo.tripId === tripId &&
    photo.clientUploadId === input.clientUploadId &&
    photo.mimeType === input.mimeType &&
    photo.originalFilename === sanitizeFilename(
      input.originalFilename,
      input.mimeType === 'image/png' ? 'png' : 'jpg',
    ) &&
    photo.fileSize === input.fileSize &&
    photo.width === input.width &&
    photo.height === input.height;
}

function sanitizeFilename(filename: string, fallbackExtension: string): string {
  const trimmed = filename.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 255);
  return safe || `photo.${fallbackExtension}`;
}
