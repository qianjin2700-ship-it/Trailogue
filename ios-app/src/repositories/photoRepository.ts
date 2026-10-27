import type { PhotosApi } from '@/api/photos';
import type { CreatePhotoUploadRequest, PhotoUploadIntentDTO } from '@/contracts/photo';
import { mapPhotoDTO, type Photo } from '@/domain/photo/photo';

export interface PhotoRepository {
  createUploadIntent(
    tripId: string,
    clientUploadId: string,
    input: CreatePhotoUploadRequest,
  ): Promise<PhotoUploadIntentDTO>;
  completeUpload(tripId: string, photoId: string): Promise<Photo>;
  getPhotos(tripId: string): Promise<Photo[]>;
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
  };
}
