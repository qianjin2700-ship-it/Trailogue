import type { PhotoDTO, PhotoMimeType, PhotoStatus } from '@/contracts/photo';

export interface Photo {
  id: string;
  tripId: string;
  status: PhotoStatus;
  url: string;
  originalFilename: string;
  mimeType: PhotoMimeType;
  fileSize: number;
  width: number | null;
  height: number | null;
  capturedAt: Date | null;
  createdAt: Date;
  uploadedAt: Date | null;
}

export function mapPhotoDTO(dto: PhotoDTO): Photo {
  return {
    ...dto,
    capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
    createdAt: new Date(dto.createdAt),
    uploadedAt: dto.uploadedAt ? new Date(dto.uploadedAt) : null,
  };
}
