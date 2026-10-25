import type { TripDTO, TripStatus } from '@/contracts/trip';

export interface TripSummary {
  id: string;
  title: string;
  status: TripStatus;
  photoCount: number;
  coverUrl: string | null;
  destinationName: string | null;
  updatedAt: Date;
}

export interface Trip extends TripSummary {
  description: string | null;
  createdAt: Date;
  startDate: string | null;
  endDate: string | null;
}

export function mapTripDTO(dto: TripDTO): Trip {
  return {
    id: dto.id,
    title: dto.title,
    status: dto.status,
    photoCount: dto.photoCount,
    coverUrl: null,
    destinationName: dto.destinationName,
    description: dto.description,
    createdAt: new Date(dto.createdAt),
    startDate: dto.startDate,
    endDate: dto.endDate,
    updatedAt: new Date(dto.updatedAt),
  };
}

