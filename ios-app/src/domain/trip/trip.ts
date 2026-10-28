import type { TripDTO, TripStatus } from '@/contracts/trip';

export interface TripSummary {
  id: string;
  title: string;
  status: TripStatus;
  photoCount: number;
  coverPhotoId: string | null;
  coverUrl: string | null;
  destinationName: string | null;
  updatedAt: Date;
}

export interface Trip extends TripSummary {
  description: string | null;
  createdAt: Date;
  startDate: string | null;
  endDate: string | null;
  storyBackground: string | null;
  peopleNotes: string | null;
  highlights: string | null;
  writingStyle: string;
  customWritingStyle: string | null;
  avoidExpressions: string | null;
  contentLength: string;
  arrangement: string;
}

export function mapTripDTO(dto: TripDTO): Trip {
  return {
    id: dto.id,
    title: dto.title,
    status: dto.status,
    photoCount: dto.photoCount,
    coverPhotoId: dto.coverPhotoId,
    coverUrl: null,
    destinationName: dto.destinationName,
    description: dto.description,
    createdAt: new Date(dto.createdAt),
    startDate: dto.startDate,
    endDate: dto.endDate,
    storyBackground: dto.storyBackground,
    peopleNotes: dto.peopleNotes,
    highlights: dto.highlights,
    writingStyle: dto.writingStyle,
    customWritingStyle: dto.customWritingStyle,
    avoidExpressions: dto.avoidExpressions,
    contentLength: dto.contentLength,
    arrangement: dto.arrangement,
    updatedAt: new Date(dto.updatedAt),
  };
}

