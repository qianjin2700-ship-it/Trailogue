import type { TripDTO, TripListItemDTO, TripStatus } from '@/contracts/trip';

export interface TripSummary {
  id: string;
  title: string;
  status: TripStatus;
  photoCount: number;
  coverUrl: string | null;
  updatedAt: Date;
}

export interface Trip extends TripSummary {
  theme: string;
  background: string;
  createdAt: Date;
}

export function mapTripListItemDTO(dto: TripListItemDTO): TripSummary {
  return {
    id: dto.album_id,
    title: dto.name,
    status: dto.status,
    photoCount: dto.photo_count,
    coverUrl: dto.cover_thumb_url,
    updatedAt: new Date(dto.updated_at),
  };
}

export function mapTripDTO(dto: TripDTO): Trip {
  return {
    id: dto._id,
    title: dto.name,
    status: dto.status,
    photoCount: dto.photo_count,
    coverUrl: dto.cover_file_id,
    theme: dto.theme,
    background: dto.background,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
  };
}

