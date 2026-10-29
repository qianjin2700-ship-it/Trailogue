import assert from 'node:assert/strict';
import test from 'node:test';

import type { StoryContentDTO } from '@trailogue/contracts';
import type { BookRecord, StoryRecord } from '@trailogue/database';

import { HttpError } from '../src/errors/httpError.js';
import { StoryService } from '../src/modules/stories/storyService.js';

const userId = '71000000-0000-4000-8000-000000000007';
const tripId = '72000000-0000-4000-8000-000000000007';
const photoId = '73000000-0000-4000-8000-000000000007';
const storyId = '74000000-0000-4000-8000-000000000007';

const trip = {
  id: tripId, userId, title: 'Kyoto', description: null, destinationName: 'Kyoto',
  status: 'draft', coverPhotoId: photoId, photoCount: 1,
  startDate: '2026-11-01', endDate: '2026-11-05',
  storyBackground: 'First visit', peopleNotes: null, highlights: 'Gardens',
  writingStyle: 'warm_documentary', customWritingStyle: null, avoidExpressions: null,
  contentLength: 'medium', arrangement: 'timeline',
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
} as const;

const photo = {
  id: photoId, userId, tripId, storageKey: `users/${userId}/photo.jpg`, thumbnailKey: null,
  originalFilename: 'photo.jpg', mimeType: 'image/jpeg', width: 1200, height: 900,
  fileSize: 1000, capturedAt: new Date('2026-11-01T12:00:00.000Z'), sortOrder: 0,
  status: 'ready', clientUploadId: null, uploadExpiresAt: null,
  uploadedAt: new Date('2026-11-01T12:00:00.000Z'), etag: null, failureCode: null,
  caption: 'A garden', locationName: 'Kyoto', userConfirmed: true, vision: null,
  createdAt: new Date('2026-11-01T12:00:00.000Z'),
  updatedAt: new Date('2026-11-01T12:00:00.000Z'),
} as const;

const content: StoryContentDTO = {
  title: 'Kyoto', subtitle: 'A quiet week', preface: 'Preface',
  chapters: [{
    chapterId: 'ch1', title: 'Gardens', dateLabel: 'Nov 1', locationLabel: 'Kyoto',
    narrative: 'A garden appears in the photograph.', photoIds: [photoId],
    captions: { [photoId]: 'A garden' }, locked: false, userEdited: false,
  }],
  epilogue: 'Epilogue', shareSummary: 'Summary',
  meta: {
    model: 'deepseek-flash', generatedAt: '2026-11-05T00:00:00.000Z', degraded: false,
    visionAvailable: true, uncertainNotes: [], totalTokens: 100, callCount: 2,
  },
};

test('story generation requires explicit AI photo privacy consent', async () => {
  const service = createService({ privacyAgreedAt: null });
  await assert.rejects(
    () => service.generate(userId, tripId),
    (error: unknown) => error instanceof HttpError && error.statusCode === 409,
  );
});

test('story generation persists vision facts, a new version, and a book with the selected cover', async () => {
  const events: string[] = [];
  let savedCover: string | null | undefined;
  const service = createService({
    onVision: () => events.push('vision'),
    onStory: () => events.push('story'),
    onBook: (cover) => { events.push('book'); savedCover = cover; },
  });

  const result = await service.generate(userId, tripId, 'Keep it concise');

  assert.equal(result.content.title, 'Kyoto');
  assert.deepEqual(events, ['vision', 'story', 'book']);
  assert.equal(savedCover, photoId);
});

test('story generation reports a distinct AI service failure after settings validation succeeds', async () => {
  const service = createService({ failStoryProvider: true });
  await assert.rejects(
    () => service.generate(userId, tripId),
    (error: unknown) => error instanceof HttpError &&
      error.statusCode === 502 && error.code === 'AI_SERVICE_ERROR',
  );
});

test('book preview always reflects the trip cover selected after generation', async () => {
  const service = createService({ bookCoverPhotoId: null });
  const result = await service.bookPreview(userId, tripId);
  assert.equal(result.coverPhotoId, photoId);
});

test('restoring an earlier story creates a new restored version without overwriting history', async () => {
  let versionType: string | undefined;
  const service = createService({ onVersionType: (value) => { versionType = value; } });
  const result = await service.restore(userId, tripId, storyId);
  assert.equal(versionType, 'restored');
  assert.equal(result.content.title, content.title);
});

function createService(options: {
  privacyAgreedAt?: Date | null;
  bookCoverPhotoId?: string | null;
  onVision?: () => void;
  onStory?: () => void;
  onBook?: (cover: string | null | undefined) => void;
  onVersionType?: (value: string | undefined) => void;
  failStoryProvider?: boolean;
} = {}) {
  const storyRecord: StoryRecord = {
    id: storyId, userId, tripId, title: content.title,
    content: content as unknown as Record<string, unknown>, storyType: 'travel_story',
    source: 'ai', version: 1, degraded: false, lockedChapterIds: [],
    generationLanguageMode: 'auto', actualLanguage: 'en', versionType: 'generated', creativeSnapshot: {},
    createdAt: new Date('2026-11-05T00:00:00.000Z'),
    updatedAt: new Date('2026-11-05T00:00:00.000Z'),
  };
  const bookRecord: BookRecord = {
    id: '75000000-0000-4000-8000-000000000007', userId, tripId, storyId,
    title: content.title, subtitle: content.subtitle,
    coverPhotoId: options.bookCoverPhotoId ?? null, status: 'ready', pdfStorageKey: null,
    createdAt: new Date('2026-11-05T00:00:00.000Z'),
    updatedAt: new Date('2026-11-05T00:00:00.000Z'),
  };
  return new StoryService({
    trips: { findByIdForUser: async (id, owner) => id === tripId && owner === userId ? trip : null },
    users: { findById: async () => ({
      id: userId, displayName: null, avatarUrl: null, email: null,
      privacyAgreedAt: options.privacyAgreedAt === undefined
        ? new Date('2026-10-01T00:00:00.000Z') : options.privacyAgreedAt,
      retentionDays: 90, createdAt: new Date(), updatedAt: new Date(),
    }) },
    photos: {
      listReadyForTrip: async () => [photo],
      updateVision: async () => { options.onVision?.(); return true; },
    },
    stories: {
      createVersion: async (input) => {
        options.onStory?.(); options.onVersionType?.(input.versionType);
        return { ...storyRecord, versionType: input.versionType ?? 'generated' };
      },
      findLatestForTrip: async () => storyRecord,
      listVersionsForTrip: async () => [storyRecord],
      findByIdForUser: async () => storyRecord,
    },
    books: {
      upsertForTrip: async (input) => {
        options.onBook?.(input.coverPhotoId);
        return { ...bookRecord, coverPhotoId: input.coverPhotoId ?? null };
      },
      findForTrip: async () => bookRecord,
      updateLayoutForTrip: async () => bookRecord,
    },
    storage: { createReadUrl: async () => 'https://signed.example/photo.jpg' },
    provider: {
      model: 'deepseek-flash', supportsVision: async () => true,
      understandPhotos: async () => ({
        facts: [{ photoId, visibleFacts: ['garden'], inferredLocation: null, confidence: 0.9 }],
        totalTokens: 10,
      }),
      generateStory: async () => {
        if (options.failStoryProvider) throw new Error('provider detail must stay private');
        return structuredClone(content);
      },
    },
    readUrlTtlSeconds: 600,
  });
}
