import type { BookPreviewDTO, StoryChapterDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';
import {
  classifyAspect,
  coverVisibleFraction,
  isPhotoPlacement,
  photoAspect,
  placementFor,
  type PhotoPlacement,
} from './photoGeometry';

export type BookLayoutKind =
  | 'cover'
  | 'chapter_opener'
  | 'full_bleed'
  | 'image_left'
  | 'image_right'
  | 'two_photo'
  | 'three_collage'
  | 'four_grid'
  | 'hero_two'
  | 'mixed'
  | 'outro';
export type BookLayoutVariant =
  | 'default'
  | 'pair_columns'
  | 'pair_rows'
  | 'portrait_lead'
  | 'landscape_lead'
  | 'cover_magazine'
  | 'cover_memoir'
  | 'cover_minimal'
  | 'story_card'
  | 'text_rail';
export interface BookPage {
  id: string;
  kind: BookLayoutKind;
  variant?: BookLayoutVariant;
  chapterId?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  photoIds: string[];
  captions: Record<string, string>;
  placements: Record<string, PhotoPlacement>;
  imageFit?: 'cover' | 'contain';
  userEdited?: boolean;
}
export interface BookChapterPlan {
  chapterId: string;
  title: string;
  pageIds: string[];
  photoIds: string[];
}
export interface BookLayoutDocument {
  version: 5;
  storyId: string;
  style: BookPreviewDTO['bookStyle'];
  language: string;
  title: string;
  coverPhotoId: string | null;
  chapters: BookChapterPlan[];
  pages: BookPage[];
}
interface LayoutCandidate {
  kind: BookLayoutKind;
  variant: BookLayoutVariant;
  slotAspects: number[];
  areaScore: number;
  styleScore: number;
}
const KINDS: BookLayoutKind[] = [
  'cover',
  'chapter_opener',
  'full_bleed',
  'image_left',
  'image_right',
  'two_photo',
  'three_collage',
  'four_grid',
  'hero_two',
  'mixed',
  'outro',
];

export function buildBookLayout(
  book: BookPreviewDTO,
  photos: Map<string, Photo>
): BookLayoutDocument {
  const language = book.story.meta.actualLanguage ?? 'en';
  const allPhotoIds = [...photos.keys()];
  const referencedIds = unique(
    book.story.chapters.flatMap((chapter) => chapter.photoIds).filter((id) => photos.has(id))
  );
  const coverPhotoId =
    validPhotoId(book.coverPhotoId, photos) ?? referencedIds[0] ?? allPhotoIds[0] ?? null;
  const title = book.tripTitle?.trim() || book.title.trim() || 'Trailogue';
  const pages: BookPage[] = [
    finalizePage(
      {
        id: 'cover',
        kind: 'cover',
        variant: coverVariant(book.bookStyle),
        eyebrow: formatBookDate(book.startDate, language),
        title,
        body: book.subtitle ?? undefined,
        photoIds: coverPhotos(book.bookStyle, coverPhotoId, referencedIds, allPhotoIds),
        captions: {},
        placements: {},
      },
      photos,
      book.bookStyle
    ),
  ];
  const chapters: BookChapterPlan[] = [];
  const used = new Set(pages[0]!.photoIds);
  book.story.chapters.forEach((chapter, index) => {
    const ids = unique(chapter.photoIds.filter((id) => photos.has(id)));
    const planned = planChapter(chapter, index, ids, book.bookStyle, photos);
    pages.push(...planned);
    planned.flatMap((page) => page.photoIds).forEach((id) => used.add(id));
    chapters.push({
      chapterId: chapter.chapterId,
      title: chapter.title,
      pageIds: planned.map((page) => page.id),
      photoIds: ids,
    });
  });
  const unassigned = unique([...referencedIds, ...allPhotoIds]).filter((id) => !used.has(id));
  pages.push(...planGallery('unassigned', unassigned, book.bookStyle, {}, pages.length, photos));
  const closingPhotoIds = unique([...unassigned.slice(-2), ...referencedIds.slice(-2)]).slice(
    0,
    book.bookStyle === 'minimalist' ? 1 : 2
  );
  const closingBody = bookExcerpt(joinCopy(book.story.preface, book.story.epilogue), book.bookStyle);
  if (closingBody)
    pages.push(
      finalizePage(
        {
          id: 'outro',
          kind: 'outro',
          variant: 'default',
          title: localizedLabel(language),
          body: closingBody,
          photoIds: closingPhotoIds,
          captions: {},
          placements: {},
        },
        photos,
        book.bookStyle
      )
    );
  return {
    version: 5,
    storyId: book.storyId,
    style: book.bookStyle,
    language,
    title,
    coverPhotoId,
    chapters,
    pages,
  };
}

function planChapter(
  chapter: StoryChapterDTO,
  chapterIndex: number,
  ids: string[],
  style: BookPreviewDTO['bookStyle'],
  photos: Map<string, Photo>
): BookPage[] {
  const pages: BookPage[] = [];
  const bookCopy = bookExcerpt(chapter.narrative, style);
  const captions = chapter.captions ?? {};
  let cursor = 0;
  const openerCount =
    style === 'travel_magazine'
      ? Math.min(ids.length, 1)
      : style === 'warm_memoir'
        ? Math.min(ids.length, ids.length >= 4 ? 2 : 1)
        : Math.min(ids.length, ids.length >= 3 ? 2 : 1);
  const openerIds = ids.slice(cursor, (cursor += openerCount));
  const selected =
    style === 'travel_magazine'
      ? { kind: 'chapter_opener' as const, variant: 'default' as const }
      : selectLayout(style, openerIds, photos, chapterIndex, true);
  const openerVariant: BookLayoutVariant =
    style === 'minimalist'
      ? 'text_rail'
      : style === 'warm_memoir'
        ? 'story_card'
        : selected.variant;
  pages.push(
    finalizePage(
      {
        id: `${chapter.chapterId}-opener`,
        chapterId: chapter.chapterId,
        kind: openerIds.length ? selected.kind : 'mixed',
        variant: openerIds.length ? openerVariant : 'default',
        eyebrow: chapterMeta(chapter),
        title: chapter.title,
        body: bookCopy,
        photoIds: openerIds,
        captions,
        placements: {},
      },
      photos,
      style
    )
  );
  const gallery = planGallery(
    chapter.chapterId,
    ids.slice(cursor),
    style,
    captions,
    chapterIndex,
    photos
  );
  gallery.forEach((page, index) => {
    if (style === 'minimalist') {
      page.variant = 'text_rail';
      page.eyebrow = chapterMeta(chapter);
      page.title = index === 0 ? chapter.title : undefined;
      page.body = undefined;
    } else if (style === 'warm_memoir') {
      page.variant = index === 0 ? 'story_card' : page.variant;
      page.eyebrow = index === 0 ? chapterMeta(chapter) : undefined;
      page.title = index === 0 ? chapter.title : undefined;
      page.body = undefined;
    }
  });
  pages.push(...gallery);
  return pages.filter((page) => page.photoIds.length > 0 || Boolean(page.body?.trim()));
}

function planGallery(
  prefix: string,
  ids: string[],
  style: BookPreviewDTO['bookStyle'],
  captions: Record<string, string>,
  seed: number,
  photos: Map<string, Photo>
): BookPage[] {
  const pages: BookPage[] = [];
  let offset = 0;
  let index = 0;
  while (offset < ids.length) {
    const left = ids.length - offset;
    let take = style === 'travel_magazine'
      ? Math.min(left, left === 5 ? 3 : 4)
      : style === 'warm_memoir'
        ? Math.min(left, left === 4 ? 2 : 3)
        : Math.min(left, 3);
    if (style === 'minimalist' && left === 4) take = 2;
    const slice = ids.slice(offset, offset + take);
    const selected = selectLayout(style, slice, photos, seed + index, false);
    pages.push(
      finalizePage(
        {
          id: `${prefix}-gallery-${index}`,
          chapterId: prefix === 'unassigned' ? undefined : prefix,
          kind: selected.kind,
          variant: selected.variant,
          photoIds: slice,
          captions,
          placements: {},
        },
        photos,
        style
      )
    );
    offset += take;
    index += 1;
  }
  return pages;
}

function selectLayout(
  style: BookPreviewDTO['bookStyle'],
  ids: string[],
  photos: Map<string, Photo>,
  seed: number,
  opener: boolean
): Pick<LayoutCandidate, 'kind' | 'variant'> {
  if (!ids.length) return { kind: 'mixed', variant: 'default' };
  return layoutCandidates(style, ids.length, seed, opener)
    .map((candidate) => ({
      candidate,
      score:
        layoutScore(candidate, ids, photos, style) +
        (ids.length === 2 && candidate.kind === (seed % 2 ? 'two_photo' : 'hero_two') ? 1.2 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.kind.localeCompare(b.candidate.kind))[0]!
    .candidate;
}

function layoutCandidates(
  style: BookPreviewDTO['bookStyle'],
  count: number,
  seed: number,
  opener: boolean
): LayoutCandidate[] {
  if (count === 1) {
    const side = seed % 2 ? 'image_right' : 'image_left';
    return [
      {
        kind: opener && style === 'travel_magazine' ? 'chapter_opener' : 'full_bleed',
        variant: 'default',
        slotAspects: [0.773],
        areaScore: 1,
        styleScore: style === 'minimalist' ? 1 : 0.72,
      },
      {
        kind: side,
        variant: 'default',
        slotAspects: [0.62],
        areaScore: 0.7,
        styleScore: style === 'warm_memoir' ? 1 : 0.78,
      },
      {
        kind: 'mixed',
        variant: 'default',
        slotAspects: [1.15],
        areaScore: 0.68,
        styleScore: style === 'minimalist' ? 0.85 : 0.7,
      },
    ];
  }
  if (count === 2)
    return [
      {
        kind: 'two_photo',
        variant: 'pair_columns',
        slotAspects: [0.82, 0.82],
        areaScore: 0.88,
        styleScore: style === 'warm_memoir' ? 1 : 0.84,
      },
      {
        kind: 'two_photo',
        variant: 'pair_rows',
        slotAspects: [1.62, 1.62],
        areaScore: 0.92,
        styleScore: style === 'minimalist' ? 1 : 0.8,
      },
      {
        kind: 'hero_two',
        variant: 'landscape_lead',
        slotAspects: [1.5, 1.5],
        areaScore: 0.9,
        styleScore: style === 'travel_magazine' ? 1 : 0.82,
      },
    ];
  if (count === 3)
    return [
      {
        kind: 'three_collage',
        variant: 'portrait_lead',
        slotAspects: [0.78, 1.18, 1.18],
        areaScore: 0.88,
        styleScore: style === 'warm_memoir' ? 1 : 0.86,
      },
      {
        kind: 'hero_two',
        variant: 'landscape_lead',
        slotAspects: [1.55, 0.82, 0.82],
        areaScore: 0.94,
        styleScore: style === 'travel_magazine' ? 1 : 0.88,
      },
      {
        kind: 'three_collage',
        variant: 'landscape_lead',
        slotAspects: [1.55, 1.55, 1.55],
        areaScore: 0.91,
        styleScore: style === 'minimalist' ? 1 : 0.83,
      },
    ];
  return [
    {
      kind: 'four_grid',
      variant: 'default',
      slotAspects: [1.48, 1.48, 1.48, 1.48],
      areaScore: 0.82,
      styleScore: style === 'travel_magazine' ? 1 : 0.7,
    },
  ];
}

function layoutScore(
  candidate: LayoutCandidate,
  ids: string[],
  photos: Map<string, Photo>,
  style: BookPreviewDTO['bookStyle']
): number {
  let fit = 0;
  let safety = 0;
  let penalty = 0;
  ids.forEach((id, index) => {
    const aspect = photoAspect(photos.get(id) ?? { width: null, height: null });
    const visible = coverVisibleFraction(
      aspect,
      candidate.slotAspects[index] ?? candidate.slotAspects.at(-1) ?? 1
    );
    const portrait = ['portrait', 'tall'].includes(classifyAspect(aspect));
    fit += visible;
    safety += portrait && visible < 0.95 ? visible * 0.35 : visible;
    if (portrait && visible < 0.72) penalty += 1.5;
  });
  const divisor = Math.max(ids.length, 1);
  return (
    (safety / divisor) * 6 +
    (fit / divisor) * 3 +
    candidate.areaScore * 2 +
    candidate.styleScore * 1.5 -
    penalty +
    (style === 'minimalist' ? candidate.areaScore : 0)
  );
}

function finalizePage(
  page: BookPage,
  photos: Map<string, Photo>,
  style: BookPreviewDTO['bookStyle']
): BookPage {
  const leadAspect = page.photoIds[0]
    ? photoAspect(photos.get(page.photoIds[0]) ?? { width: null, height: null })
    : 1;
  const normalized =
    page.photoIds.length === 1 &&
    (page.kind === 'cover' || page.kind === 'chapter_opener') &&
    leadAspect >= 1.2 &&
    !['cover_magazine', 'cover_memoir', 'cover_minimal', 'story_card', 'text_rail'].includes(
      page.variant ?? ''
    )
      ? { ...page, variant: 'landscape_lead' as const }
      : page;
  const aspects = slotAspects(
    normalized.kind,
    normalized.variant ?? 'default',
    normalized.photoIds.length
  );
  const placements: Record<string, PhotoPlacement> = {};
  normalized.photoIds.forEach((id, index) => {
    placements[id] = placementFor(photos.get(id), aspects[index] ?? aspects.at(-1) ?? 1, {
      allowExpressiveCrop: false,
      manual: normalized.placements[id],
    });
  });
  return { ...normalized, placements };
}

export function slotAspects(
  kind: BookLayoutKind,
  variant: BookLayoutVariant,
  count: number
): number[] {
  if (kind === 'cover') {
    if (variant === 'cover_memoir') return Array(count).fill(1.08);
    if (variant === 'cover_minimal') return Array(count).fill(1.42);
    if (variant === 'cover_magazine') return Array(count).fill(1.33);
    return Array(count).fill(variant === 'landscape_lead' ? 1.19 : 0.86);
  }
  if (kind === 'chapter_opener')
    return Array(count).fill(variant === 'landscape_lead' ? 1.19 : 0.773);
  if (kind === 'full_bleed') return Array(count).fill(0.773);
  if (kind === 'image_left' || kind === 'image_right') return Array(count).fill(0.62);
  if (kind === 'two_photo') return Array(count).fill(variant === 'pair_rows' ? 1.62 : 0.82);
  if (kind === 'hero_two') return count === 2 ? [1.5, 1.5] : [1.55, 0.82, 0.82];
  if (kind === 'three_collage')
    return variant === 'landscape_lead' ? [1.55, 1.55, 1.55] : [0.78, 1.18, 1.18];
  if (kind === 'four_grid') return Array(count).fill(1.48);
  return Array(count).fill(1.15);
}

export function restoreBookLayout(
  raw: Record<string, unknown> | null | undefined,
  book: BookPreviewDTO,
  photos: Map<string, Photo>
): BookLayoutDocument | null {
  if (
    !raw ||
    ![2, 3, 4, 5].includes(Number(raw.version)) ||
    raw.storyId !== book.storyId ||
    raw.style !== book.bookStyle ||
    !Array.isArray(raw.pages)
  )
    return null;
  const pages = raw.pages.filter(isBookPage).map((page) => {
    const photoIds = page.photoIds.filter((id) => photos.has(id));
    const placements = Object.fromEntries(
      Object.entries(page.placements ?? {}).filter(
        ([id, value]) => photoIds.includes(id) && isPhotoPlacement(value)
      )
    );
    return finalizePage({ ...page, photoIds, placements }, photos, book.bookStyle);
  });
  if (!pages.length || pages[0]?.kind !== 'cover') return null;
  const restored: BookLayoutDocument = {
    version: 5,
    storyId: book.storyId,
    style: book.bookStyle,
    language:
      typeof raw.language === 'string' ? raw.language : (book.story.meta.actualLanguage ?? 'en'),
    title: typeof raw.title === 'string' ? raw.title : book.title,
    coverPhotoId: typeof raw.coverPhotoId === 'string' ? raw.coverPhotoId : null,
    chapters: Array.isArray(raw.chapters) ? raw.chapters.filter(isChapterPlan) : [],
    pages,
  };
  if (Number(raw.version) === 5) return restored;
  return mergeUserEdits(buildBookLayout(book, photos), restored);
}

export function compatibleLayouts(page: BookPage): BookLayoutKind[] {
  const count = page.photoIds.length;
  if (!count) return ['mixed', 'outro'];
  if (count === 1) return ['full_bleed', 'image_left', 'image_right', 'mixed'];
  if (count === 2) return ['two_photo', 'hero_two', 'mixed'];
  if (count === 3) return ['three_collage', 'hero_two'];
  return ['four_grid'];
}
export function changePageLayout(
  document: BookLayoutDocument,
  pageId: string,
  photos: Map<string, Photo> = new Map()
): BookLayoutDocument {
  return updatePage(document, pageId, (page) => {
    const options = compatibleLayouts(page);
    const kind = options[(options.indexOf(page.kind) + 1) % options.length]!;
    const variant: BookLayoutVariant =
      kind === 'two_photo'
        ? page.variant === 'pair_rows'
          ? 'pair_columns'
          : 'pair_rows'
        : 'default';
    return finalizePage({ ...page, kind, variant, userEdited: true }, photos, document.style);
  });
}
export function rotatePagePhotos(
  document: BookLayoutDocument,
  pageId: string,
  photos: Map<string, Photo> = new Map()
): BookLayoutDocument {
  return updatePage(document, pageId, (page) =>
    finalizePage(
      {
        ...page,
        photoIds:
          page.photoIds.length > 1 ? [...page.photoIds.slice(1), page.photoIds[0]!] : page.photoIds,
        userEdited: true,
      },
      photos,
      document.style
    )
  );
}
export function togglePhotoFit(
  document: BookLayoutDocument,
  pageId: string,
  photoId: string
): BookLayoutDocument {
  return updatePage(document, pageId, (page) => {
    const current = page.placements[photoId];
    if (!current) return page;
    const fit = current.fit === 'cover' ? 'contain' : 'cover';
    return {
      ...page,
      userEdited: true,
      placements: {
        ...page.placements,
        [photoId]: {
          ...current,
          fit,
          visibleFraction:
            fit === 'contain'
              ? 1
              : coverVisibleFraction(current.sourceAspect, current.containerAspect),
          safety: 'manual',
          userEdited: true,
        },
      },
    };
  });
}
export function cyclePhotoFocus(
  document: BookLayoutDocument,
  pageId: string,
  photoId: string
): BookLayoutDocument {
  return updatePage(document, pageId, (page) => {
    const current = page.placements[photoId];
    if (!current) return page;
    const positionY = current.positionY === 0.5 ? 0.32 : current.positionY < 0.5 ? 0.68 : 0.5;
    return {
      ...page,
      userEdited: true,
      placements: {
        ...page.placements,
        [photoId]: { ...current, positionY, safety: 'manual', userEdited: true },
      },
    };
  });
}
export function swapPageLeadPhoto(
  document: BookLayoutDocument,
  pageId: string,
  photos: Map<string, Photo> = new Map()
): BookLayoutDocument {
  const current = document.pages.findIndex((page) => page.id === pageId);
  const next = document.pages.findIndex(
    (page, index) => index > current && page.photoIds.length > 0
  );
  if (current < 0 || next < 0 || !document.pages[current]?.photoIds.length) return document;
  const pages = document.pages.map((page) => ({
    ...page,
    photoIds: [...page.photoIds],
    placements: { ...page.placements },
  }));
  [pages[current]!.photoIds[0], pages[next]!.photoIds[0]] = [
    pages[next]!.photoIds[0]!,
    pages[current]!.photoIds[0]!,
  ];
  pages[current] = finalizePage({ ...pages[current]!, userEdited: true }, photos, document.style);
  pages[next] = finalizePage({ ...pages[next]!, userEdited: true }, photos, document.style);
  return { ...document, pages };
}
export function mergeUserEdits(
  fresh: BookLayoutDocument,
  previous: BookLayoutDocument
): BookLayoutDocument {
  const edited = new Map(
    previous.pages.filter((page) => page.userEdited).map((page) => [page.id, page])
  );
  return { ...fresh, pages: fresh.pages.map((page) => edited.get(page.id) ?? page) };
}

export function inspectBookLayout(document: BookLayoutDocument): string[] {
  const issues: string[] = [];
  document.pages.forEach((page, index) => {
    if (index > 0 && page.photoIds.length === 0 && (page.body?.trim().length ?? 0) < 360)
      issues.push(`${page.id}: short text-only page`);
    if (page.photoIds.length > 4) issues.push(`${page.id}: too many photos`);
    if (page.body && page.body.length > 1300) issues.push(`${page.id}: text overflow risk`);
    page.photoIds.forEach((id) => {
      const p = page.placements[id];
      if (!p) issues.push(`${page.id}/${id}: missing placement`);
      else if (
        p.fit === 'cover' &&
        p.visibleFraction < (['portrait', 'tall'].includes(p.aspectClass) ? 0.95 : 0.85)
      )
        issues.push(`${page.id}/${id}: unsafe crop`);
    });
  });
  for (let i = 2; i < document.pages.length; i += 1)
    if (
      document.pages[i]!.kind === document.pages[i - 1]!.kind &&
      document.pages[i]!.kind === document.pages[i - 2]!.kind
    )
      issues.push(`${document.pages[i]!.id}: repeated layout`);
  return issues;
}

export function makePdfFilename(
  title: string | null | undefined,
  startDate: string | null
): string {
  const safeTitle =
    (title?.trim() || 'Trailogue')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, 80) || 'Trailogue';
  const iso = startDate?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return `${safeTitle}${iso ? `_${iso}` : ''}.pdf`;
}
export function formatBookDate(
  value: string | null | undefined,
  language: string
): string | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (language.startsWith('zh') || language === 'ja')
    return `${year}年${Number(month)}月${Number(day)}日`;
  if (language === 'ko') return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  return `${monthName(Number(month))} ${Number(day)}, ${year}`;
}
export function renderBookHtml(document: BookLayoutDocument, photos: Map<string, Photo>): string {
  return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><style>${bookCss(document.style)}</style></head><body class="${document.style}">${document.pages.map((page, index) => renderPage(page, photos, index)).join('')}</body></html>`;
}

function renderPage(page: BookPage, photos: Map<string, Photo>, index: number): string {
  const figures = page.photoIds
    .map((id) => {
      const photo = photos.get(id);
      if (!photo) return '';
      const p = page.placements[id] ?? placementFor(photo, 1);
      const caption = page.captions[id] ?? photo.caption ?? '';
      return `<figure class="fit-${p.fit} aspect-${p.aspectClass}"><img class="photo" data-photo-id="${escapeHtml(id)}" src="${escapeHtml(photo.url)}" style="object-fit:${p.fit};object-position:${p.positionX * 100}% ${p.positionY * 100}%">${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    })
    .join('');
  const copy = `<div class="copy">${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}${page.body ? `<p>${escapeHtml(page.body)}</p>` : ''}</div>`;
  const number =
    page.kind === 'cover'
      ? ''
      : `<span class="page-number">${String(index + 1).padStart(2, '0')}</span>`;
  const className = `${page.kind} ${page.variant ?? 'default'} count-${page.photoIds.length}`;
  if (page.kind === 'cover')
    return `<section class="page ${className}"><div class="media">${figures}</div><div class="cover-shade"></div><div class="cover-copy">${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}<h1>${escapeHtml(page.title ?? '')}</h1>${page.body ? `<p>${escapeHtml(page.body)}</p>` : ''}</div></section>`;
  if (page.kind === 'chapter_opener')
    return `<section class="page ${className}"><div class="media">${figures}</div><div class="local-shade"></div>${copy}${number}</section>`;
  if (page.variant === 'text_rail')
    return `<section class="page gallery ${className}">${copy}<div class="media">${figures}</div>${number}</section>`;
  if (page.kind === 'full_bleed')
    return `<section class="page ${className}"><div class="media">${figures}</div>${page.body || page.title ? copy : ''}${number}</section>`;
  if (page.kind === 'image_left' || page.kind === 'image_right')
    return `<section class="page split ${className}">${page.kind === 'image_left' ? `<div class="media">${figures}</div>${copy}` : `${copy}<div class="media">${figures}</div>`}${number}</section>`;
  if (['two_photo', 'three_collage', 'four_grid', 'hero_two'].includes(page.kind))
    return `<section class="page gallery ${className}"><div class="media">${figures}</div>${page.body || page.title ? copy : ''}${number}</section>`;
  return `<section class="page prose ${className}">${copy}<div class="media">${figures}</div>${number}</section>`;
}

function bookCss(style: BookPreviewDTO['bookStyle']): string {
  const warm = style === 'warm_memoir';
  const minimal = style === 'minimalist';
  const paper = warm ? '#f7efe4' : minimal ? '#fff' : '#f3eee6';
  const ink = warm ? '#49342c' : minimal ? '#111' : '#17262c';
  const accent = warm ? '#a96553' : minimal ? '#66705f' : '#d7643d';
  const serif = warm
    ? '"Songti SC","Hiragino Mincho ProN",Georgia,serif'
    : minimal
      ? '"Helvetica Neue","PingFang SC",Arial,sans-serif'
      : '"Iowan Old Style","Songti SC",Georgia,serif';
  return `
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:${paper};color:${ink};font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","PingFang TC","Yu Gothic","Apple SD Gothic Neo",sans-serif}
.page{width:215.9mm;height:279.4mm;overflow:hidden;break-after:page;position:relative;background:${paper};padding:16mm}
.photo{width:100%;height:100%;display:block}.fit-contain{background:${warm ? '#eadfce' : minimal ? '#f4f4f1' : '#e8e1d7'}}
figure{margin:0;overflow:hidden;position:relative}figcaption{background:linear-gradient(transparent,rgba(0,0,0,.72));bottom:0;color:#fff;font-size:7.5pt;left:0;line-height:1.35;padding:6mm 3mm 2.5mm;position:absolute;right:0}
.eyebrow{color:${accent};font-size:8pt;font-weight:800;letter-spacing:1.2px;margin-bottom:4mm;text-transform:uppercase}h1,h2,p{margin:0}h1{font-family:${serif};font-size:${minimal ? 37 : 44}pt;line-height:1.04}h2{font-family:${serif};font-size:${warm ? 25 : 28}pt;line-height:1.14;margin-bottom:5mm}p{font-family:${serif};font-size:${minimal ? 10.5 : 11.5}pt;line-height:${warm ? 1.76 : 1.64};white-space:pre-wrap}.page-number{bottom:7mm;color:${accent};font-size:8pt;position:absolute;right:9mm}.media{min-height:0}
.cover{padding:0}.cover .media{inset:0;position:absolute}.cover .media>figure{height:100%}.cover-shade{position:absolute}.cover-copy{position:absolute;z-index:2}.cover-copy p{margin-top:5mm}
.chapter_opener{padding:0;color:#fff}.chapter_opener .media{height:100%;inset:0;position:absolute}.chapter_opener .media>figure{height:100%}.chapter_opener .local-shade{background:linear-gradient(180deg,transparent 50%,rgba(0,0,0,.78));bottom:0;height:52%;left:0;position:absolute;right:0}.chapter_opener .copy{bottom:17mm;left:17mm;max-width:170mm;position:absolute;z-index:2}.chapter_opener p{max-width:148mm}
.chapter_opener.landscape_lead{background:${paper};color:${ink}}.chapter_opener.landscape_lead .media{height:64%;bottom:auto}.chapter_opener.landscape_lead .local-shade{display:none}.chapter_opener.landscape_lead .copy{bottom:16mm}
.split{display:grid;gap:10mm;grid-template-columns:1.13fr .87fr}.split.image_right{grid-template-columns:.87fr 1.13fr}.split .media{height:247mm}.split .media>figure{height:100%}.split .copy{align-self:center}
.gallery{display:flex;flex-direction:column}.gallery .media{display:grid;gap:3mm;height:${warm ? 194 : 209}mm}.gallery .copy{margin-top:7mm}.two_photo.pair_columns .media{grid-template-columns:1fr 1fr;height:${warm ? 164 : 182}mm}.two_photo.pair_rows .media{grid-template-rows:1fr 1fr}.hero_two .media{grid-template-columns:1fr 1fr;grid-template-rows:1.48fr 1fr}.hero_two figure:first-child{grid-column:1/3}.hero_two.count-2 figure:nth-child(2){grid-column:1/3}.three_collage.portrait_lead .media{grid-template-columns:1.2fr .8fr;grid-template-rows:1fr 1fr}.three_collage.portrait_lead figure:first-child{grid-row:1/3}.three_collage.landscape_lead .media{grid-template-columns:1fr 1fr;grid-template-rows:1.35fr 1fr}.three_collage.landscape_lead figure:first-child{grid-column:1/3}.four_grid .media{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.full_bleed{padding:0}.full_bleed .media{height:100%;inset:0;position:absolute}.full_bleed .media>figure{height:100%}.full_bleed .copy{background:rgba(255,255,255,.94);bottom:12mm;left:12mm;max-width:128mm;padding:7mm;position:absolute}
.prose{display:grid;gap:11mm;grid-template-columns:${warm ? '1.05fr .95fr' : '1fr 1fr'};align-items:center}.prose .media{height:185mm}.prose .media>figure{height:100%}.prose .media:empty{display:none}.prose.outro{grid-template-columns:.52fr 1.48fr;padding:12mm}.prose.outro .media{height:255mm}

/* Travel magazine: saturated photography, editorial blocks and asymmetric rhythm. */
.travel_magazine .cover{background:#14283b;color:#fff}.travel_magazine .cover_magazine .media{height:58%;bottom:auto}.travel_magazine .cover_magazine .cover-shade{background:linear-gradient(180deg,transparent,rgba(8,17,25,.92));height:18%;left:0;right:0;top:40%}.travel_magazine .cover_magazine .cover-copy{bottom:18mm;left:17mm;max-width:178mm}.travel_magazine .cover_magazine h1{font-size:47pt;letter-spacing:-1.6px}.travel_magazine .cover_magazine p{font-size:13.5pt;max-width:145mm}.travel_magazine .cover_magazine .eyebrow{color:#fff}.travel_magazine .split .copy{border-top:2.2mm solid #d7643d;padding-top:7mm}.travel_magazine .gallery{padding:10mm}.travel_magazine .gallery:not(:has(.copy)) .media{height:259mm}.travel_magazine .gallery .copy{background:#fff;padding:5mm 7mm;margin:0;max-width:150mm;position:absolute;bottom:10mm;left:10mm;z-index:2}.travel_magazine .four_grid .copy{max-width:92mm}.travel_magazine .page-number{background:rgba(255,255,255,.85);padding:1.5mm 2mm}

/* Warm memoir: photo-led keepsake pages with compact memory cards. */
.warm_memoir .page{background-color:#f7efe4;background-image:radial-gradient(circle at 16% 12%,rgba(180,137,93,.08),transparent 28%),linear-gradient(110deg,rgba(255,255,255,.45),transparent 44%)}.warm_memoir .cover_memoir{color:#49342c;padding:12mm}.warm_memoir .cover_memoir:before,.warm_memoir .cover_memoir:after{content:"";position:absolute;border-radius:50%;background:rgba(113,132,88,.16);transform:rotate(-25deg)}.warm_memoir .cover_memoir:before{height:42mm;width:14mm;left:5mm;top:20mm}.warm_memoir .cover_memoir:after{height:33mm;width:12mm;right:5mm;bottom:11mm}.warm_memoir .cover_memoir .media{background:#fffaf2;box-shadow:0 3mm 9mm rgba(72,45,31,.18);height:202mm;left:17mm;padding:5mm;right:17mm;top:12mm}.warm_memoir .cover_memoir .media>figure{height:100%}.warm_memoir .cover_memoir .cover-shade{display:none}.warm_memoir .cover_memoir .cover-copy{background:rgba(255,250,242,.96);bottom:12mm;box-shadow:0 1.5mm 5mm rgba(72,45,31,.12);left:31mm;padding:7mm 10mm;right:31mm;text-align:center}.warm_memoir .cover_memoir h1{font-size:32pt}.warm_memoir .cover_memoir p{font-size:10.5pt;margin-top:3mm}.warm_memoir figure{border-radius:1.5mm;box-shadow:0 1.2mm 4mm rgba(72,45,31,.13)}.warm_memoir .gallery{padding:10mm}.warm_memoir .gallery .media{height:239mm}.warm_memoir .two_photo.pair_columns .media{height:232mm}.warm_memoir .gallery .copy{background:rgba(255,250,242,.95);bottom:10mm;box-shadow:0 1.5mm 5mm rgba(72,45,31,.12);left:10mm;margin:0;max-width:150mm;padding:5mm 7mm;position:absolute;z-index:2}.warm_memoir .gallery .copy p{font-size:10pt;line-height:1.6}.warm_memoir .split{gap:7mm;grid-template-columns:1.5fr .5fr;padding:11mm}.warm_memoir .split.image_right{grid-template-columns:.5fr 1.5fr}.warm_memoir .split .media{height:257mm}.warm_memoir .split .copy{align-self:end;background:#fffaf2;box-shadow:0 1.5mm 5mm rgba(72,45,31,.1);padding:6mm}.warm_memoir .split .copy p{font-size:9.6pt;line-height:1.55}.warm_memoir .story_card .copy{border-left:1.2mm solid #c78d72}.warm_memoir .chapter_opener.landscape_lead{background:#f7efe4}

/* Minimalist photo book: slim information rail and broad, uninterrupted image bands. */
.minimalist .page{padding:14mm 13mm}.minimalist .cover_minimal{color:#171914;padding:0}.minimalist .cover_minimal .media{height:80%;bottom:auto}.minimalist .cover_minimal .cover-shade{background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.7));height:26%;left:0;right:0;top:53%}.minimalist .cover_minimal .cover-copy{left:17mm;right:17mm;text-align:center;top:57%}.minimalist .cover_minimal h1{font-family:"Songti SC",Georgia,serif;font-size:39pt}.minimalist .cover_minimal p{font-size:11pt}.minimalist .cover_minimal .eyebrow{color:#333}.minimalist .gallery.text_rail{display:grid;grid-template-columns:30mm 1fr;gap:6mm;padding:12mm 10mm}.minimalist .gallery.text_rail .copy{grid-column:1;grid-row:1;margin:0;padding-top:3mm}.minimalist .gallery.text_rail .media{grid-column:2;grid-row:1;height:245mm;gap:2.5mm}.minimalist .gallery.text_rail.count-1{grid-template-columns:28mm 1fr}.minimalist .gallery.text_rail.count-1 .media{align-self:center;height:218mm;justify-self:center;width:130mm}.minimalist .gallery.text_rail h2{color:#18365d;font-family:"Songti SC",Georgia,serif;font-size:16pt;line-height:1.3}.minimalist .gallery.text_rail p{font-size:8.6pt;line-height:1.55}.minimalist .gallery.text_rail .eyebrow{font-size:7pt;line-height:1.5}.minimalist .page-number{color:#777}.minimalist .two_photo.pair_rows .media{height:245mm}.minimalist .split{grid-template-columns:1.28fr .72fr}.minimalist .split .copy{align-self:end;padding-bottom:18mm}.minimalist .outro{padding:12mm}
`;
}

function updatePage(
  document: BookLayoutDocument,
  pageId: string,
  updater: (page: BookPage) => BookPage
): BookLayoutDocument {
  return {
    ...document,
    pages: document.pages.map((page) => (page.id === pageId ? updater(page) : page)),
  };
}
function bookExcerpt(value: string, style: BookPreviewDTO['bookStyle']): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const cjk = /[\u3000-\u9fff\uf900-\ufaff]/.test(normalized);
  const limit = cjk
    ? style === 'minimalist' ? 42 : style === 'warm_memoir' ? 78 : 110
    : style === 'minimalist' ? 105 : style === 'warm_memoir' ? 190 : 260;
  if (normalized.length <= limit) return normalized;
  const clipped = normalized.slice(0, limit);
  const boundary = Math.max(clipped.lastIndexOf('。'), clipped.lastIndexOf('！'), clipped.lastIndexOf('？'), clipped.lastIndexOf('. '));
  return `${clipped.slice(0, boundary > limit * 0.55 ? boundary + 1 : limit).trim()}…`;
}
function joinCopy(...values: (string | undefined | null)[]): string {
  return values
    .map((value) => value?.trim())
    .filter(Boolean)
    .join('\n\n');
}
function unique(values: string[]): string[] {
  return [...new Set(values)];
}
function validPhotoId(value: string | null, photos: Map<string, Photo>): string | null {
  return value && photos.has(value) ? value : null;
}
function coverPhotos(
  style: BookPreviewDTO['bookStyle'],
  cover: string | null,
  referenced: string[],
  all: string[]
): string[] {
  if (!cover) return [];
  return [cover];
}

function coverVariant(style: BookPreviewDTO['bookStyle']): BookLayoutVariant {
  if (style === 'warm_memoir') return 'cover_memoir';
  if (style === 'minimalist') return 'cover_minimal';
  return 'cover_magazine';
}
function chapterMeta(chapter: StoryChapterDTO): string | undefined {
  return [chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · ') || undefined;
}
function monthName(month: number): string {
  return (
    [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ][month - 1] ?? ''
  );
}
function localizedLabel(language: string): string {
  return language.startsWith('zh')
    ? '尾声'
    : language === 'ja'
      ? 'エピローグ'
      : language === 'ko'
        ? '에필로그'
        : 'Epilogue';
}
function isBookPage(value: unknown): value is BookPage {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<BookPage>;
  return (
    typeof page.id === 'string' &&
    typeof page.kind === 'string' &&
    KINDS.includes(page.kind as BookLayoutKind) &&
    Array.isArray(page.photoIds) &&
    page.photoIds.every((id) => typeof id === 'string') &&
    Boolean(page.captions) &&
    typeof page.captions === 'object'
  );
}
function isChapterPlan(value: unknown): value is BookChapterPlan {
  if (!value || typeof value !== 'object') return false;
  const chapter = value as Partial<BookChapterPlan>;
  return (
    typeof chapter.chapterId === 'string' &&
    typeof chapter.title === 'string' &&
    Array.isArray(chapter.pageIds) &&
    Array.isArray(chapter.photoIds)
  );
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!
  );
}
