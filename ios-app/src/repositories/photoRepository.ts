import type { PhotosApi } from '@/api/photos';
import type { CreatePhotoUploadRequest, PhotoUploadIntentDTO, UpdatePhotoRequest } from '@/contracts/photo';
import { mapPhotoDTO, type Photo } from '@/domain/photo/photo';

export interface PhotoRepository {
  createUploadIntent(
    tripId: string,
    clientUploadId: string,
    input: CreatePhotoUploadRequest,
  ): Promise<PhotoUploadIntentDTO>;
  completeUpload(tripId: string, photoId: string): Promise<Photo>;
  getPhotos(tripId: string): Promise<Photo[]>;
  deletePhoto(tripId: string, photoId: string): Promise<void>;
  reorderPhotos(tripId: string, photoIds: string[]): Promise<void>;
  updatePhoto(tripId: string, photoId: string, input: UpdatePhotoRequest): Promise<Photo>;
}

export function createPhotoRepository(api: PhotosApi): PhotoRepository {
  return {
    createUploadIntent(tripId, clientUploadId, input) {
      return api.createUploadIntent(tripId, input, clientUploadId);
    },
    async completeUpload(tripId, photoId) {
      return mapPhotoDTO(await api.completeUpload(tripId, photoId));
    },
    async getPhotos(tripId) {
      return Promise.all((await api.getPhotos(tripId)).map(mapPhotoDTO));
    },
    deletePhoto(tripId, photoId) {
      return api.deletePhoto(tripId, photoId);
    },
    reorderPhotos(tripId, photoIds) {
      return api.reorderPhotos(tripId, photoIds);
    },
    async updatePhoto(tripId, photoId, input) {
      return mapPhotoDTO(await api.updatePhoto(tripId, photoId, input));
    },
  };
}
