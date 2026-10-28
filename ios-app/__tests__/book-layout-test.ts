import type { BookPreviewDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { buildBookLayout, makePdfFilename, renderBookHtml } from '@/features/books/bookLayout';

const chapter = {
  chapterId: 'chapter-1', title: 'Sea and light', dateLabel: '2025.08.24', locationLabel: 'Guishan Island',
  narrative: 'A'.repeat(900), photoIds: Array.from({ length: 9 }, (_, index) => `photo-${index + 1}`),
  captions: {}, locked: false, userEdited: false,
};
const book: BookPreviewDTO = {
  id: 'book-1', tripId: 'trip-1', storyId: 'story-1', title: 'Sea and light', tripTitle: '桂山岛亲子旅行',
  subtitle: 'Wind, lighthouse and memories', coverPhotoId: 'photo-1', status: 'ready', startDate: '2025-08-24', bookStyle: 'travel_magazine',
  story: {
    title: 'Sea and light', subtitle: '', preface: 'A family journey.', chapters: [chapter], epilogue: 'We carried the light home.', shareSummary: null,
    meta: { model: 'test', generatedAt: new Date(0).toISOString(), degraded: false, visionAvailable: true, uncertainNotes: [], totalTokens: 0, callCount: 0, languageMode: 'zh-Hans', actualLanguage: 'zh-Hans' },
  }, createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};
const photos = new Map<string, Photo>(Array.from({ length: 9 }, (_, index) => {
  const id = `photo-${index + 1}`;
  return [id, { id, tripId: 'trip-1', status: 'ready', url: `https://example.test/${id}.jpg`, originalFilename: `${id}.jpg`, mimeType: 'image/jpeg', fileSize: 1000, width: index % 2 ? 900 : 1600, height: index % 2 ? 1400 : 900, capturedAt: null, createdAt: new Date(0), uploadedAt: new Date(0), caption: null, locationName: null }];
}));

test('builds varied magazine pages for long stories and mixed photo ratios', () => {
  const document = buildBookLayout(book, photos);
  const kinds = new Set(document.pages.map((page) => page.kind));
  expect(kinds.has('cover')).toBe(true);
  expect(kinds.has('chapter_opener')).toBe(true);
  expect(kinds.has('hero_two')).toBe(true);
  expect(kinds.has('three_collage')).toBe(true);
  expect(kinds.has('two_photo')).toBe(true);
  expect(kinds.has('mixed')).toBe(true);
  const html = renderBookHtml(document, photos);
  expect(html).toContain('PingFang SC');
  expect(html).toContain('Yu Gothic');
  expect(html).toContain('Apple SD Gothic Neo');
  expect(html).toContain('object-fit:cover');
});

test('uses split and full-bleed layouts when aspect and text allow', () => {
  const splitBook = { ...book, story: { ...book.story, chapters: [{ ...chapter, narrative: 'A'.repeat(700), photoIds: ['photo-1', 'photo-2'] }] } };
  expect(buildBookLayout(splitBook, photos).pages.some((page) => page.kind === 'image_left')).toBe(true);
  const fullBook = { ...book, story: { ...book.story, chapters: [{ ...chapter, narrative: 'Short story.', photoIds: ['photo-2', 'photo-3'] }] } };
  expect(buildBookLayout(fullBook, photos).pages.some((page) => page.kind === 'full_bleed')).toBe(true);
});

test('creates a readable unicode PDF filename with safe fallbacks', () => {
  expect(makePdfFilename('桂山岛亲子旅行', '2025-08-24')).toBe('桂山岛亲子旅行_2025-08-24.pdf');
  expect(makePdfFilename('Tokyo: Spring / 2026', '2026-04-01')).toBe('Tokyo_ Spring _ 2026_2026-04-01.pdf');
  expect(makePdfFilename('', null)).toBe('Trailogue.pdf');
});
