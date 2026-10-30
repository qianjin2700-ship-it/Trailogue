import type { BookPreviewDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import {
  buildBookLayout,
  changePageLayout,
  cycleBookLayout,
  cyclePhotoFocus,
  formatBookDate,
  inspectBookLayout,
  makePdfFilename,
  mergeUserEdits,
  renderBookHtml,
  renderBookPreviewHtml,
  restoreBookLayout,
  rotatePagePhotos,
  togglePhotoFit,
} from '@/features/books/bookLayout';
import {
  classifyAspect,
  coverVisibleFraction,
  effectiveDimensions,
  placementFor,
} from '@/features/books/photoGeometry';

const photos = new Map<string, Photo>(
  Array.from({ length: 20 }, (_, index) => {
    const id = `photo-${index + 1}`;
    return [
      id,
      {
        id,
        tripId: 'trip-1',
        status: 'ready',
        url: `https://example.test/${id}.jpg`,
        originalFilename: `${id}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 1000,
        width: index % 3 ? 900 : 1600,
        height: index % 3 ? 1400 : 900,
        capturedAt: null,
        createdAt: new Date(0),
        uploadedAt: new Date(0),
        caption: null,
        locationName: null,
      },
    ];
  })
);
const chapter = (number: number) => ({
  chapterId: `chapter-${number}`,
  title: `Chapter ${number}`,
  dateLabel: `Aug ${23 + number}`,
  locationLabel: 'Guishan Island',
  narrative: `${'A'.repeat(310)}\n\n${'B'.repeat(300)}`,
  photoIds: Array.from({ length: 5 }, (_, index) => `photo-${(number - 1) * 5 + index + 1}`),
  captions: {},
  locked: false,
  userEdited: false,
});
const baseBook: BookPreviewDTO = {
  id: 'book-1',
  tripId: 'trip-1',
  storyId: 'story-1',
  title: 'Sea and light',
  tripTitle: '桂山岛亲子旅行',
  subtitle: 'Wind, lighthouse and memories',
  coverPhotoId: null,
  status: 'ready',
  startDate: '2025-08-24T00:00:00.000Z',
  bookStyle: 'travel_magazine',
  layout: {},
  story: {
    title: 'Sea and light',
    subtitle: '',
    preface: 'A family journey.',
    chapters: [chapter(1), chapter(2), chapter(3), chapter(4)],
    epilogue: 'We carried the light home.',
    shareSummary: null,
    meta: {
      model: 'test',
      generatedAt: new Date(0).toISOString(),
      degraded: false,
      visionAvailable: true,
      uncertainNotes: [],
      totalTokens: 0,
      callCount: 0,
      languageMode: 'zh-Hans',
      actualLanguage: 'zh-Hans',
    },
  },
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

test('creates a complete plan with cover fallback and no short blank text pages', () => {
  const document = buildBookLayout(baseBook, photos);
  expect(document.version).toBe(5);
  expect(document.pages[0]?.photoIds).toEqual(['photo-1']);
  expect(document.chapters).toHaveLength(4);
  expect(inspectBookLayout(document)).toEqual([]);
  expect(
    document.pages.filter((page) => page.photoIds.length === 0 && (page.body?.length ?? 0) < 360)
  ).toEqual([]);
});

test('three book styles produce materially different plans and HTML themes', () => {
  const magazine = buildBookLayout(baseBook, photos);
  const memoir = buildBookLayout({ ...baseBook, bookStyle: 'warm_memoir' }, photos);
  const minimalist = buildBookLayout({ ...baseBook, bookStyle: 'minimalist' }, photos);
  const signatures = [magazine, memoir, minimalist].map((document) =>
    document.pages.map((page) => `${page.kind}:${page.photoIds.length}`).join('|')
  );
  expect(new Set(signatures).size).toBe(3);
  expect(memoir.pages[0]?.photoIds).toHaveLength(1);
  expect(magazine.pages[0]?.variant).toBe('cover_magazine');
  expect(memoir.pages[0]?.variant).toBe('cover_memoir');
  expect(minimalist.pages[0]?.variant).toBe('cover_minimal');
  expect(renderBookHtml(magazine, photos)).toContain('editorial blocks and asymmetric rhythm');
  expect(renderBookHtml(memoir, photos)).toContain('photo-led keepsake pages');
  expect(renderBookHtml(minimalist, photos)).toContain('slim information rail');
  expect(minimalist.pages.some((page) => page.variant === 'text_rail')).toBe(true);
  expect(minimalist.pages.length).toBeGreaterThanOrEqual(8);
  expect(minimalist.pages.length).toBeLessThanOrEqual(12);
  const singlePhotoMinimalist = buildBookLayout({
    ...baseBook,
    bookStyle: 'minimalist',
    story: { ...baseBook.story, chapters: [{ ...chapter(1), photoIds: ['photo-2'] }] },
  }, photos);
  expect(renderBookHtml(singlePhotoMinimalist, photos)).toMatch(
    /page gallery [^\"]+ text_rail count-1/,
  );
  expect(renderBookHtml(singlePhotoMinimalist, photos)).toContain('width:130mm');
  expect(memoir.pages.filter((page) => page.kind !== 'cover').every(
    (page) => !page.body || page.body.length <= 191,
  )).toBe(true);
});

test('layout adjustments persist and can be merged into a fresh plan', () => {
  const original = buildBookLayout(baseBook, photos);
  const target = original.pages.find((page) => page.photoIds.length > 1)!;
  const adjusted = rotatePagePhotos(
    changePageLayout(original, target.id, photos),
    target.id,
    photos
  );
  const restored = restoreBookLayout(
    adjusted as unknown as Record<string, unknown>,
    { ...baseBook, layout: adjusted as unknown as Record<string, unknown> },
    photos
  );
  expect(restored?.pages.find((page) => page.id === target.id)?.userEdited).toBe(true);
  expect(
    mergeUserEdits(buildBookLayout(baseBook, photos), adjusted).pages.find(
      (page) => page.id === target.id
    )
  ).toEqual(adjusted.pages.find((page) => page.id === target.id));
});

test('Try another design produces a visible, persistent layout change', () => {
  const original = buildBookLayout(baseBook, photos);
  const changed = cycleBookLayout(original, photos);
  const originalKinds = original.pages.map((page) => page.kind);
  const changedKinds = changed.pages.map((page) => page.kind);
  expect(changed.pages[0]).toEqual(original.pages[0]);
  expect(changedKinds).not.toEqual(originalKinds);
  expect(changed.pages.filter((page) => page.kind !== 'cover').some((page) => page.userEdited)).toBe(
    true
  );
  expect(changed.pages.flatMap((page) => page.photoIds).sort()).toEqual(
    original.pages.flatMap((page) => page.photoIds).sort()
  );
});

test('App preview and PDF render the same pages and photo placements', () => {
  const document = buildBookLayout({ ...baseBook, bookStyle: 'minimalist' }, photos);
  const pdf = renderBookHtml(document, photos);
  const preview = renderBookPreviewHtml(document, photos);
  const pageCount = (preview.match(/<section class="page /g) ?? []).length;
  expect(pageCount).toBe(document.pages.length);
  expect(preview).toContain('<meta name="viewport" content="width=860');
  expect(preview).toContain('ReactNativeWebView');
  expect(preview).toContain('photo-load-error');
  expect(preview).toContain('Photo unavailable');
  expect(preview).toContain('data-photo-id="photo-1"');
  expect(pdf).toContain('data-photo-id="photo-1"');
  expect(preview).toContain(document.pages[1]!.title!);
  expect(pdf).toContain(document.pages[1]!.title!);
});

test('classifies display geometry after EXIF rotation and never stretches an image', () => {
  expect(effectiveDimensions(4032, 3024, 6)).toEqual({ width: 3024, height: 4032 });
  expect(classifyAspect(2)).toBe('ultrawide');
  expect(classifyAspect(1.5)).toBe('landscape');
  expect(classifyAspect(1)).toBe('square');
  expect(classifyAspect(0.7)).toBe('portrait');
  expect(classifyAspect(0.5)).toBe('tall');
  expect(coverVisibleFraction(1.5, 1.5)).toBe(1);
});

test('uses conservative contain fallback when a portrait would lose a person-sized region', () => {
  const placement = placementFor({ width: 900, height: 1600 }, 1.6);
  expect(placement.fit).toBe('contain');
  expect(placement.visibleFraction).toBe(1);
  expect(placement.safety).toBe('conservative');
});

test('PDF uses the exact per-photo fit and focus values stored in the layout', () => {
  const original = buildBookLayout(baseBook, photos);
  const target = original.pages.find((page) => page.photoIds.length > 0 && page.kind !== 'cover')!;
  const photoId = target.photoIds[0]!;
  const edited = cyclePhotoFocus(togglePhotoFit(original, target.id, photoId), target.id, photoId);
  const placement = edited.pages.find((page) => page.id === target.id)!.placements[photoId]!;
  const html = renderBookHtml(edited, photos);
  expect(placement.userEdited).toBe(true);
  expect(html).toContain(`object-fit:${placement.fit}`);
  expect(html).toContain(
    `object-position:${placement.positionX * 100}% ${placement.positionY * 100}%`
  );
});

test('migrates V2 plans without discarding user layout edits', () => {
  const current = buildBookLayout(baseBook, photos);
  const legacy = {
    ...current,
    version: 2,
    pages: current.pages.map(({ placements: _placements, ...page }) => ({
      ...page,
      imageFit: 'contain',
    })),
  };
  const restored = restoreBookLayout(
    legacy as unknown as Record<string, unknown>,
    baseBook,
    photos
  );
  expect(restored?.version).toBe(5);
  expect(restored?.pages.every((page) => page.photoIds.every((id) => page.placements[id]))).toBe(
    true
  );
});

test('replans V3 automatic pages for the reference design while retaining manual edits', () => {
  const current = buildBookLayout(baseBook, photos);
  const editable = current.pages.find((page) => page.kind !== 'cover' && page.photoIds.length > 0)!;
  const legacy = {
    ...current,
    version: 3,
    pages: current.pages.map((page) =>
      page.id === editable.id ? { ...page, userEdited: true, title: 'Keep this edit' } : page
    ),
  };
  const restored = restoreBookLayout(
    legacy as unknown as Record<string, unknown>,
    baseBook,
    photos
  );
  expect(restored?.version).toBe(5);
  expect(restored?.pages[0]?.variant).toBe('cover_magazine');
  expect(restored?.pages.find((page) => page.id === editable.id)?.title).toBe('Keep this edit');
});

test('date and PDF filename preserve calendar day without timezone conversion', () => {
  expect(formatBookDate('2025-08-24T23:00:00-07:00', 'zh-Hans')).toBe('2025年8月24日');
  expect(formatBookDate('2025-08-24T00:00:00Z', 'en')).toBe('August 24, 2025');
  expect(makePdfFilename('桂山岛亲子旅行', '2025-08-24T00:00:00Z')).toBe(
    '桂山岛亲子旅行_2025-08-24.pdf'
  );
  expect(makePdfFilename('Tokyo: Spring / 2026', '2026-04-01')).toBe(
    'Tokyo_ Spring _ 2026_2026-04-01.pdf'
  );
});
