import type { CreativeRequirementsDTO, TripDTO } from '@trailogue/contracts';
import type { TripStatus } from '@trailogue/domain';
import { defaultCreativeRequirements } from '@/features/stories/creativeRequirements';

export interface TripSummary {
  id: string;
  title: string;
  status: TripStatus;
  photoCount: number;
  coverPhotoId: string | null;
  coverUrl: string | null;
  destinationName: string | null;
  startDate: string | null;
  endDate: string | null;
  updatedAt: Date;
}

export interface Trip extends TripSummary {
  description: string | null;
  createdAt: Date;
  storyBackground: string | null;
  peopleNotes: string | null;
  highlights: string | null;
  writingStyle: string;
  customWritingStyle: string | null;
  avoidExpressions: string | null;
  contentLength: string;
  arrangement: string;
  creativeRequirements: CreativeRequirementsDTO;
}

export function mapTripDTO(dto: TripDTO): Trip {
  return {
    id: dto.id,
    title: dto.title,
    status: dto.status,
    photoCount: dto.photoCount,
    coverPhotoId: dto.coverPhotoId,
    coverUrl: dto.coverPhotoUrl ?? null,
    destinationName: dto.destinationName,
    startDate: dto.startDate,
    endDate: dto.endDate,
    description: dto.description,
    createdAt: new Date(dto.createdAt),
    storyBackground: dto.storyBackground,
    peopleNotes: dto.peopleNotes,
    highlights: dto.highlights,
    writingStyle: dto.writingStyle,
    customWritingStyle: dto.customWritingStyle,
    avoidExpressions: dto.avoidExpressions,
    contentLength: dto.contentLength,
    arrangement: dto.arrangement,
    creativeRequirements: { ...defaultCreativeRequirements(), ...dto.creativeRequirements },
    updatedAt: new Date(dto.updatedAt),
  };
}

