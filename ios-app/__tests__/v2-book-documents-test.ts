import { createV2DocumentsFromBook } from '@/features/v2/bookDocuments';

const book = {
  id: 'book-1', tripId: 'trip-1', storyId: 'story-1', title: 'A trip', tripTitle: 'A trip',
  subtitle: null, coverPhotoId: 'photo-1', status: 'ready' as const, startDate: '2026-10-03',
  bookStyle: 'travel_magazine' as const, layout: {}, createdAt: '', updatedAt: '',
  story: {
    title: 'A trip', subtitle: '', preface: '', epilogue: '', shareSummary: null,
    chapters: [{
      chapterId: 'c1', title: 'Arrival', dateLabel: null, locationLabel: 'Bay',
      narrative: 'We arrived.', photoIds: ['photo-1'], captions: {}, locked: false, userEdited: false,
    }],
    meta: {
      model: 'test', generatedAt: '', degraded: false, visionAvailable: true,
      uncertainNotes: [], totalTokens: 1, callCount: 1, actualLanguage: 'en' as const,
    },
  },
};

const photo = {
  id: 'photo-1', tripId: 'trip-1', status: 'ready' as const,
  url: 'https://example.test/photo.jpg', originalFilename: 'photo.jpg',
  mimeType: 'image/jpeg' as const, fileSize: 10, width: 1600, height: 900,
  capturedAt: null, createdAt: new Date(0), uploadedAt: new Date(0),
  caption: null, locationName: null,
};

test('one V1 DTO adapter produces both V2 documents with the same content and photo', () => {
  const documents = createV2DocumentsFromBook(book, [photo]);
  expect(documents.story.title).toBe('A trip');
  expect(documents.magazine.title).toBe('A trip');
  expect(documents.story.stats.photoCount).toBe(1);
  expect(documents.magazine.trip.photoCount).toBe(1);
  expect(documents.magazine.pages[0]?.photos[0]?.id).toBe('photo-1');
});
