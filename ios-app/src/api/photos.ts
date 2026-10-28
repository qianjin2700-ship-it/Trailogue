import type {
  CreatePhotoUploadRequest,
  CreatePhotoUploadResponse,
  CompletePhotoUploadResponse,
  PhotoDTO,
  PhotoListResponse,
  PhotoUploadIntentDTO,
  UpdatePhotoRequest,
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
  deletePhoto(tripId: string, photoId: string): Promise<void>;
  reorderPhotos(tripId: string, photoIds: string[]): Promise<void>;
  updatePhoto(tripId: string, photoId: string, input: UpdatePhotoRequest): Promise<PhotoDTO>;
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
    async deletePhoto(tripId, photoId) {
      await client.request(
        `/v1/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}`,
        { method: 'DELETE' },
      );
    },
    async reorderPhotos(tripId, photoIds) {
      await client.request(`/v1/trips/${encodeURIComponent(tripId)}/photos/order`, {
        method: 'PUT', body: { photoIds },
      });
    },
    async updatePhoto(tripId, photoId, input) {
      return (await client.request<CompletePhotoUploadResponse>(
        `/v1/trips/${encodeURIComponent(tripId)}/photos/${encodeURIComponent(photoId)}`,
        { method: 'PATCH', body: input },
      )).data;
    },
  };
}
