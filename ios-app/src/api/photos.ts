import type {
  CreatePhotoUploadRequest,
  CreatePhotoUploadResponse,
  CompletePhotoUploadResponse,
  PhotoDTO,
  PhotoListResponse,
  PhotoUploadIntentDTO,
} from '@/contracts/photo';

import type { ApiClient } from './client';

export interface PhotosApi {
  createUploadIntent(
    tripId: string,
    input: CreatePhotoUploadRequest,
    idempotencyKey: string,
  ): Promise<PhotoUploadIntentDTO>;
  completeUpload(tripId: string, photoId: string): Promise<PhotoDTO>;
  getPhotos(tripId: string): Promise<PhotoDTO[]>;
}

export function createPhotosApi(client: ApiClient): PhotosApi {
  return {
    async createUploadIntent(tripId, input, idempotencyKey) {
      const response = await client.request<CreatePhotoUploadResponse>(
        `/v1/trips/${encodeURIComponent(tripId)}/photos/uploads`,
        { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } },
      );
      return response.data;
    },
    async completeUpload(tripId, photoId) {
      const response = await client.request<CompletePhotoUploadResponse>(
        `/v1/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}/complete`,
        { method: 'POST' },
      );
      return response.data;
    },
    async getPhotos(tripId) {
      const response = await client.request<PhotoListResponse>(
        `/v1/trips/${encodeURIComponent(tripId)}/photos`,
      );
      return response.data;
    },
  };
}
