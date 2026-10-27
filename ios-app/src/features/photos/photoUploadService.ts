import type { PhotoMimeType } from '@/contracts/photo';
import type { Photo } from '@/domain/photo/photo';
import type { PhotoRepository } from '@/repositories/photoRepository';

export interface PreparedPhoto {
  clientUploadId: string;
  uri: string;
  originalFilename: string;
  mimeType: PhotoMimeType;
  fileSize: number;
  width: number;
  height: number;
}

export interface PhotoTransfer {
  upload(
    input: {
      uri: string;
      url: string;
      method: 'PUT';
      headers: Record<string, string>;
      mimeType: PhotoMimeType;
    },
    onProgress: (progress: number) => void,
  ): Promise<void>;
}

export interface PhotoUploadService {
  upload(
    tripId: string,
    photo: PreparedPhoto,
    onProgress: (progress: number) => void,
  ): Promise<Photo>;
}

export function createPhotoUploadService(input: {
  repository: PhotoRepository;
  transfer: PhotoTransfer;
}): PhotoUploadService {
  return {
    async upload(tripId, photo, onProgress) {
      const intent = await input.repository.createUploadIntent(
        tripId,
        photo.clientUploadId,
        {
          clientUploadId: photo.clientUploadId,
          originalFilename: photo.originalFilename,
          mimeType: photo.mimeType,
          fileSize: photo.fileSize,
          width: photo.width,
          height: photo.height,
        },
      );
      if (photo.fileSize > intent.maxBytes || !intent.allowedMimeTypes.includes(photo.mimeType)) {
        throw new Error('Prepared photo is outside the server upload policy');
      }
      await input.transfer.upload({
        uri: photo.uri,
        url: intent.uploadUrl,
        method: intent.method,
        headers: intent.headers,
        mimeType: photo.mimeType,
      }, onProgress);
      return input.repository.completeUpload(tripId, intent.photoId);
    },
  };
}
