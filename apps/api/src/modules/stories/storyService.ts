import type { BookPreviewDTO, StoryContentDTO, StoryDTO } from '@trailogue/contracts';
import type {
  BookRecord,
  BookRepository,
  PhotoRepository,
  StoryRecord,
  StoryRepository,
  TripRepository,
  UserRepository,
} from '@trailogue/database';

import { HttpError } from '../../errors/httpError.js';
import type { PhotoObjectStorage } from '../photos/photoService.js';
import type { DeepSeekProvider, StoryPhotoInput } from './deepSeekProvider.js';

interface StoryServiceDependencies {
  trips: Pick<TripRepository, 'findByIdForUser'>;
  users: Pick<UserRepository, 'findById'>;
  photos: Pick<PhotoRepository, 'listReadyForTrip' | 'updateVision'>;
  stories: Pick<
    StoryRepository,
    'createVersion' | 'findLatestForTrip' | 'listVersionsForTrip' | 'findByIdForUser'
  >;
  books: Pick<BookRepository, 'upsertForTrip' | 'findForTrip'>;
  storage: Pick<PhotoObjectStorage, 'createReadUrl'>;
  provider: Pick<DeepSeekProvider, 'model' | 'supportsVision' | 'understandPhotos' | 'generateStory'>;
  readUrlTtlSeconds: number;
}

export class StoryService {
  constructor(private readonly dependencies: StoryServiceDependencies) {}

  async generate(userId: string, tripId: string, feedback?: string | null): Promise<StoryDTO> {
    const trip = await this.dependencies.trips.findByIdForUser(tripId, userId);
    if (!trip) throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
    const user = await this.dependencies.users.findById(userId);
    if (!user?.privacyAgreedAt) {
      throw new HttpError(409, 'CONFLICT', 'Accept the AI photo privacy agreement in Settings first');
    }
    const photos = await this.dependencies.photos.listReadyForTrip(userId, tripId, 50);
    if (photos.length === 0) {
      throw new HttpError(409, 'CONFLICT', 'Add at least one photo before generating a story');
    }
    const photoInputs: StoryPhotoInput[] = await Promise.all(photos.map(async (photo) => ({
      id: photo.id,
      url: await this.dependencies.storage.createReadUrl(
        photo.storageKey,
        this.dependencies.readUrlTtlSeconds,
      ),
      capturedAt: photo.capturedAt?.toISOString() ?? null,
      locationName: photo.locationName,
      caption: photo.caption,
      originalFilename: photo.originalFilename,
    })));
    const visionAvailable = await this.dependencies.provider.supportsVision();
    const vision = visionAvailable
      ? await this.dependencies.provider.understandPhotos(photoInputs)
      : { facts: [], totalTokens: 0 };
    await Promise.all(vision.facts.map((fact) => this.dependencies.photos.updateVision({
      id: fact.photoId,
      userId,
      tripId,
      vision: fact as unknown as Record<string, unknown>,
    })));
    const content = await this.dependencies.provider.generateStory({
      trip: {
        title: trip.title,
        description: trip.description,
        destinationName: trip.destinationName,
        startDate: trip.startDate,
        endDate: trip.endDate,
        storyBackground: trip.storyBackground,
        peopleNotes: trip.peopleNotes,
        highlights: trip.highlights,
        writingStyle: trip.writingStyle,
        customWritingStyle: trip.customWritingStyle,
        avoidExpressions: trip.avoidExpressions,
        contentLength: trip.contentLength,
        arrangement: trip.arrangement,
      },
      photos: photoInputs,
      understandings: vision.facts,
      visionAvailable,
      feedback: feedback ?? null,
    });
    content.meta.totalTokens += vision.totalTokens;
    const record = await this.dependencies.stories.createVersion({
      userId,
      tripId,
      title: content.title,
      content: content as unknown as Record<string, unknown>,
      source: 'ai',
      degraded: content.meta.degraded,
      lockedChapterIds: content.chapters.filter((chapter) => chapter.locked)
        .map((chapter) => chapter.chapterId),
    });
    await this.saveBook(userId, tripId, record, content, trip.coverPhotoId ?? photos[0]?.id ?? null);
    return toStoryDto(record);
  }

  async update(
    userId: string,
    tripId: string,
    content: StoryContentDTO,
  ): Promise<StoryDTO> {
    const trip = await this.dependencies.trips.findByIdForUser(tripId, userId);
    if (!trip) throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
    validateEditedStory(content);
    const photoIds = new Set(
      (await this.dependencies.photos.listReadyForTrip(userId, tripId, 50)).map((photo) => photo.id),
    );
    for (const chapter of content.chapters) {
      if (chapter.photoIds.some((photoId) => !photoIds.has(photoId))) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Story references a photo outside this trip');
      }
    }
    const edited: StoryContentDTO = {
      ...content,
      chapters: content.chapters.map((chapter) => ({ ...chapter, userEdited: true })),
      meta: { ...content.meta, generatedAt: new Date().toISOString() },
    };
    const record = await this.dependencies.stories.createVersion({
      userId,
      tripId,
      title: edited.title,
      content: edited as unknown as Record<string, unknown>,
      source: 'mixed',
      degraded: edited.meta.degraded,
      lockedChapterIds: edited.chapters.filter((chapter) => chapter.locked)
        .map((chapter) => chapter.chapterId),
    });
    await this.saveBook(userId, tripId, record, edited, null);
    return toStoryDto(record);
  }

  async latest(userId: string, tripId: string): Promise<StoryDTO> {
    await this.requireOwnedTrip(userId, tripId);
    const story = await this.dependencies.stories.findLatestForTrip(userId, tripId);
    if (!story) throw new HttpError(404, 'NOT_FOUND', 'Story not found');
    return toStoryDto(story);
  }

  async versions(userId: string, tripId: string): Promise<StoryDTO[]> {
    await this.requireOwnedTrip(userId, tripId);
    return (await this.dependencies.stories.listVersionsForTrip(userId, tripId)).map(toStoryDto);
  }

  async bookPreview(userId: string, tripId: string): Promise<BookPreviewDTO> {
    const trip = await this.dependencies.trips.findByIdForUser(tripId, userId);
    if (!trip) throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
    const book = await this.dependencies.books.findForTrip(userId, tripId);
    if (!book?.storyId) throw new HttpError(404, 'NOT_FOUND', 'Book preview not found');
    const story = await this.dependencies.stories.findByIdForUser(book.storyId, userId);
    if (!story) throw new HttpError(404, 'NOT_FOUND', 'Book story not found');
    return { ...toBookDto(book, story.content as unknown as StoryContentDTO), coverPhotoId: trip.coverPhotoId };
  }

  private async saveBook(
    userId: string,
    tripId: string,
    story: StoryRecord,
    content: StoryContentDTO,
    coverPhotoId: string | null,
  ): Promise<void> {
    const current = await this.dependencies.books.findForTrip(userId, tripId);
    await this.dependencies.books.upsertForTrip({
      userId,
      tripId,
      storyId: story.id,
      title: content.title,
      subtitle: content.subtitle || null,
      coverPhotoId: current?.coverPhotoId ?? coverPhotoId,
    });
  }

  private async requireOwnedTrip(userId: string, tripId: string): Promise<void> {
    if (!await this.dependencies.trips.findByIdForUser(tripId, userId)) {
      throw new HttpError(404, 'NOT_FOUND', 'Trip not found');
    }
  }
}

function validateEditedStory(content: StoryContentDTO): void {
  if (!content.title.trim() || content.title.length > 200 || content.chapters.length === 0) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Story content is invalid');
  }
  const chapterIds = content.chapters.map((chapter) => chapter.chapterId);
  if (new Set(chapterIds).size !== chapterIds.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Story chapter IDs must be unique');
  }
}

function toStoryDto(story: StoryRecord): StoryDTO {
  return {
    id: story.id,
    tripId: story.tripId,
    version: story.version,
    source: story.source,
    degraded: story.degraded,
    content: story.content as unknown as StoryContentDTO,
    createdAt: story.createdAt.toISOString(),
    updatedAt: story.updatedAt.toISOString(),
  };
}

function toBookDto(book: BookRecord, story: StoryContentDTO): BookPreviewDTO {
  return {
    id: book.id,
    tripId: book.tripId,
    storyId: book.storyId!,
    title: book.title,
    subtitle: book.subtitle,
    coverPhotoId: book.coverPhotoId,
    status: book.status,
    story,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
