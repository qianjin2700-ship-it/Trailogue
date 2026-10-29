import type { BookPreviewDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import { buildBookLayout, changePageLayout, formatBookDate, inspectBookLayout, makePdfFilename, mergeUserEdits, renderBookHtml, restoreBookLayout, rotatePagePhotos } from '@/features/books/bookLayout';

const photos = new Map<string, Photo>(Array.from({ length: 20 }, (_, index) => {
  const id = `photo-${index + 1}`;
  return [id, { id, tripId: 'trip-1', status: 'ready', url: `https://example.test/${id}.jpg`, originalFilename: `${id}.jpg`, mimeType: 'image/jpeg', fileSize: 1000, width: index % 3 ? 900 : 1600, height: index % 3 ? 1400 : 900, capturedAt: null, createdAt: new Date(0), uploadedAt: new Date(0), caption: null, locationName: null }];
}));
const chapter = (number: number) => ({ chapterId: `chapter-${number}`, title: `Chapter ${number}`, dateLabel: `Aug ${23 + number}`, locationLabel: 'Guishan Island', narrative: `${'A'.repeat(310)}\n\n${'B'.repeat(300)}`, photoIds: Array.from({ length: 5 }, (_, index) => `photo-${(number - 1) * 5 + index + 1}`), captions: {}, locked: false, userEdited: false });
const baseBook: BookPreviewDTO = {
  id: 'book-1', tripId: 'trip-1', storyId: 'story-1', title: 'Sea and light', tripTitle: '桂山岛亲子旅行', subtitle: 'Wind, lighthouse and memories', coverPhotoId: null, status: 'ready', startDate: '2025-08-24T00:00:00.000Z', bookStyle: 'travel_magazine', layout: {},
  story: { title: 'Sea and light', subtitle: '', preface: 'A family journey.', chapters: [chapter(1), chapter(2), chapter(3), chapter(4)], epilogue: 'We carried the light home.', shareSummary: null, meta: { model: 'test', generatedAt: new Date(0).toISOString(), degraded: false, visionAvailable: true, uncertainNotes: [], totalTokens: 0, callCount: 0, languageMode: 'zh-Hans', actualLanguage: 'zh-Hans' } },
  createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
};

test('creates a complete plan with cover fallback and no short blank text pages', () => {
  const document = buildBookLayout(baseBook, photos);
  expect(document.version).toBe(2);
  expect(document.pages[0]?.photoIds).toEqual(['photo-1']);
  expect(document.chapters).toHaveLength(4);
  expect(inspectBookLayout(document)).toEqual([]);
  expect(document.pages.filter((page) => page.photoIds.length === 0 && (page.body?.length ?? 0) < 360)).toEqual([]);
});

test('three book styles produce materially different plans and HTML themes', () => {
  const magazine = buildBookLayout(baseBook, photos);
  const memoir = buildBookLayout({ ...baseBook, bookStyle: 'warm_memoir' }, photos);
  const minimalist = buildBookLayout({ ...baseBook, bookStyle: 'minimalist' }, photos);
  const signatures = [magazine, memoir, minimalist].map((document) => document.pages.map((page) => `${page.kind}:${page.photoIds.length}`).join('|'));
  expect(new Set(signatures).size).toBe(3);
  expect(memoir.pages[0]?.photoIds).toHaveLength(2);
  expect(renderBookHtml(magazine, photos)).toContain('text-transform:uppercase');
  expect(renderBookHtml(memoir, photos)).toContain('border-radius:5mm');
  expect(renderBookHtml(minimalist, photos)).toContain('padding:22mm');
});

test('layout adjustments persist and can be merged into a fresh plan', () => {
  const original = buildBookLayout(baseBook, photos);
  const target = original.pages.find((page) => page.photoIds.length > 1)!;
  const adjusted = rotatePagePhotos(changePageLayout(original, target.id), target.id);
  const restored = restoreBookLayout(adjusted as unknown as Record<string, unknown>, { ...baseBook, layout: adjusted as unknown as Record<string, unknown> }, photos);
  expect(restored?.pages.find((page) => page.id === target.id)?.userEdited).toBe(true);
  expect(mergeUserEdits(buildBookLayout(baseBook, photos), adjusted).pages.find((page) => page.id === target.id)).toEqual(adjusted.pages.find((page) => page.id === target.id));
});

test('date and PDF filename preserve calendar day without timezone conversion', () => {
  expect(formatBookDate('2025-08-24T23:00:00-07:00', 'zh-Hans')).toBe('2025年8月24日');
  expect(formatBookDate('2025-08-24T00:00:00Z', 'en')).toBe('August 24, 2025');
  expect(makePdfFilename('桂山岛亲子旅行', '2025-08-24T00:00:00Z')).toBe('桂山岛亲子旅行_2025-08-24.pdf');
  expect(makePdfFilename('Tokyo: Spring / 2026', '2026-04-01')).toBe('Tokyo_ Spring _ 2026_2026-04-01.pdf');
});
