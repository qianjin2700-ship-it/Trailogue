import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShareLinkRecord, StoryRecord, TripRecord } from '@trailogue/database';

import { ShareService, renderSharedStoryHtml } from '../src/modules/shares/shareService.js';

const now = new Date('2026-10-27T00:00:00.000Z');
const trip: TripRecord = {
  id: '20000000-0000-4000-8000-000000000002',
  userId: '10000000-0000-4000-8000-000000000001',
  title: 'Private trip', description: null, destinationName: null, status: 'draft',
  coverPhotoId: null, photoCount: 0, startDate: null, endDate: null,
  storyBackground: null, peopleNotes: null, highlights: null,
  writingStyle: 'warm_documentary', customWritingStyle: null, avoidExpressions: null,
  contentLength: 'medium', arrangement: 'timeline',
  createdAt: now, updatedAt: now,
};
const story: StoryRecord = {
  id: '30000000-0000-4000-8000-000000000003', userId: trip.userId, tripId: trip.id,
  title: 'Story', storyType: 'travel_story', source: 'ai', version: 1, degraded: false,
  lockedChapterIds: [], createdAt: now, updatedAt: now,
  content: {
    title: 'Story', subtitle: '', preface: 'Preface', chapters: [], epilogue: 'End',
    shareSummary: null,
    meta: { model: 'deepseek-flash', generatedAt: now.toISOString(), degraded: false,
      visionAvailable: true, uncertainNotes: [], totalTokens: 1, callCount: 2 },
  },
};

test('share links store only a hash and resolve owner-scoped story content', async () => {
  let stored: ShareLinkRecord | null = null;
  let visits = 0;
  const service = new ShareService(
    {
      create: async (input) => {
        stored = {
          id: '40000000-0000-4000-8000-000000000004', ...input,
          revokedAt: null, visitCount: 0, createdAt: now, updatedAt: now,
        };
        return stored;
      },
      findActiveByTokenHash: async (hash) => stored?.tokenHash === hash ? stored : null,
      revokeForUser: async () => true,
      incrementVisit: async () => { visits += 1; },
    },
    { findByIdForUser: async (id, userId) => id === trip.id && userId === trip.userId ? trip : null },
    {
      findLatestForTrip: async () => story,
      findByIdForUser: async (id, userId) => id === story.id && userId === story.userId ? story : null,
    },
    { listReadyForTrip: async () => [] },
    { createReadUrl: async () => { throw new Error('No photos'); } },
    'https://trailogue.example',
    600,
  );

  const link = await service.create(trip.userId, trip.id);
  const token = link.url.split('/').at(-1)!;
  const storedLink = stored as ShareLinkRecord | null;
  assert.ok(storedLink);
  assert.notEqual(storedLink.tokenHash, token);
  assert.equal(storedLink.tokenHash.length, 64);
  assert.equal((await service.resolve(token)).story.title, 'Story');
  assert.equal(visits, 1);
});

test('the private share page stays a plain photo-and-text reading page', () => {
  const html = renderSharedStoryHtml({
    tripTitle: trip.title,
    story: {
      title: 'Story', subtitle: 'Sub', preface: 'Preface',
      chapters: [{
        chapterId: 'chapter-1', title: 'The lighthouse', dateLabel: 'August 24, 2025',
        locationLabel: 'Guishan Island', narrative: 'The path reached the sea.',
        photoIds: ['photo-1'], captions: { 'photo-1': 'Sea light' },
        locked: false, userEdited: false,
      }],
      epilogue: 'End', shareSummary: null, meta: story.content.meta as never,
    },
    photos: [{ id: 'photo-1', url: 'https://signed.example/photo-1.jpg' }],
  });

  // 基础图文版：文字在前、照片按章节顺序穿插，不使用画册分页/网格布局。
  assert.ok(html.includes('<h2>The lighthouse</h2>'));
  assert.ok(html.includes('<figure><img src="https://signed.example/photo-1.jpg"'));
  assert.ok(html.includes('<figcaption>Sea light</figcaption>'));
  assert.ok(!html.includes('class="page'));
  assert.ok(!/grid-template|@page/.test(html));
});
