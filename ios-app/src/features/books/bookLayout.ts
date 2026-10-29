import type { BookPreviewDTO, StoryChapterDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';

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
export interface BookPage {
  id: string;
  kind: BookLayoutKind;
  chapterId?: string;
  eyebrow?: string;
  title?: string;
  body?: string;
  photoIds: string[];
  captions: Record<string, string>;
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
  version: 2;
  storyId: string;
  style: BookPreviewDTO['bookStyle'];
  language: string;
  title: string;
  coverPhotoId: string | null;
  chapters: BookChapterPlan[];
  pages: BookPage[];
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
  const referencedIds = book.story.chapters
    .flatMap((chapter) => chapter.photoIds)
    .filter((id) => photos.has(id));
  const coverPhotoId =
    validPhotoId(book.coverPhotoId, photos) ?? referencedIds[0] ?? allPhotoIds[0] ?? null;
  const title = book.tripTitle?.trim() || book.title.trim() || 'Trailogue';
  const pages: BookPage[] = [
    {
      id: 'cover',
      kind: 'cover',
      eyebrow: formatBookDate(book.startDate, language),
      title,
      body: book.subtitle ?? undefined,
      photoIds: coverPhotos(book.bookStyle, coverPhotoId, referencedIds, allPhotoIds),
      captions: {},
    },
  ];
  const chapters: BookChapterPlan[] = [];
  const used = new Set(pages[0].photoIds);

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
  pages.push(...planGallery('unassigned', unassigned, book.bookStyle, {}, pages.length));
  const closingPhotoIds = unique([...unassigned.slice(-2), ...referencedIds.slice(-2)]).slice(
    0,
    book.bookStyle === 'minimalist' ? 1 : 2
  );
  const closingBody = joinCopy(book.story.preface, book.story.epilogue);
  if (closingBody)
    pages.push({
      id: 'outro',
      kind: 'outro',
      title: localizedLabel(language, 'closing'),
      body: closingBody,
      photoIds: closingPhotoIds,
      captions: {},
    });
  return {
    version: 2,
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
  const textChunks = splitNarrative(chapter.narrative, style === 'minimalist' ? 230 : 430);
  let cursor = 0;
  const captions = chapter.captions ?? {};
  if (style === 'travel_magazine' && ids.length) {
    pages.push({
      id: `${chapter.chapterId}-opener`,
      chapterId: chapter.chapterId,
      kind: 'chapter_opener',
      eyebrow: chapterMeta(chapter),
      title: chapter.title,
      body: textChunks.shift(),
      photoIds: ids.slice(cursor, (cursor += 1)),
      captions,
    });
  } else if (style === 'warm_memoir') {
    const count = Math.min(ids.length, 2);
    pages.push({
      id: `${chapter.chapterId}-opener`,
      chapterId: chapter.chapterId,
      kind: count === 2 ? 'hero_two' : chapterIndex % 2 ? 'image_right' : 'image_left',
      eyebrow: chapterMeta(chapter),
      title: chapter.title,
      body: textChunks.shift(),
      photoIds: ids.slice(cursor, (cursor += count)),
      captions,
    });
  } else if (style === 'minimalist' && ids.length) {
    pages.push({
      id: `${chapter.chapterId}-opener`,
      chapterId: chapter.chapterId,
      kind: 'full_bleed',
      eyebrow: chapterMeta(chapter),
      title: chapter.title,
      body: textChunks.shift(),
      photoIds: ids.slice(cursor, (cursor += 1)),
      captions,
      imageFit: dominantFit(ids[0], photos),
    });
  } else {
    pages.push({
      id: `${chapter.chapterId}-opener`,
      chapterId: chapter.chapterId,
      kind: 'mixed',
      eyebrow: chapterMeta(chapter),
      title: chapter.title,
      body: textChunks.shift(),
      photoIds: [],
      captions,
    });
  }
  const remaining = ids.slice(cursor);
  const gallery = planGallery(chapter.chapterId, remaining, style, captions, chapterIndex);
  gallery.forEach((page, index) => {
    if (textChunks[index]) page.body = textChunks[index];
  });
  pages.push(...gallery);
  const leftoverText = textChunks.slice(gallery.length).join('\n\n');
  if (leftoverText) {
    const target = pages.findLast((page) => page.photoIds.length > 0) ?? pages[pages.length - 1];
    target.body = joinCopy(target.body, leftoverText);
  }
  return pages.filter((page) => page.photoIds.length > 0 || Boolean(page.body?.trim()));
}

function planGallery(
  prefix: string,
  ids: string[],
  style: BookPreviewDTO['bookStyle'],
  captions: Record<string, string>,
  seed: number
): BookPage[] {
  const pages: BookPage[] = [];
  let offset = 0;
  let index = 0;
  while (offset < ids.length) {
    const left = ids.length - offset;
    let take =
      style === 'minimalist'
        ? left >= 2 && index % 3 === 2
          ? 2
          : 1
        : style === 'warm_memoir'
          ? Math.min(left, index % 2 ? 2 : 3)
          : Math.min(left, left >= 4 ? 4 : left);
    if (left === 5 && take === 4) take = 3;
    const slice = ids.slice(offset, offset + take);
    const kind = chooseGalleryKind(style, slice.length, seed + index);
    pages.push({
      id: `${prefix}-gallery-${index}`,
      chapterId: prefix === 'unassigned' ? undefined : prefix,
      kind,
      photoIds: slice,
      captions,
    });
    offset += take;
    index += 1;
  }
  return pages;
}

function chooseGalleryKind(
  style: BookPreviewDTO['bookStyle'],
  count: number,
  seed: number
): BookLayoutKind {
  if (count >= 4) return 'four_grid';
  if (count === 3) return style === 'warm_memoir' ? 'hero_two' : 'three_collage';
  if (count === 2)
    return style === 'minimalist' ? 'two_photo' : seed % 2 ? 'hero_two' : 'two_photo';
  if (style === 'minimalist') return seed % 2 ? 'full_bleed' : 'mixed';
  return seed % 2 ? 'image_right' : 'image_left';
}

export function restoreBookLayout(
  raw: Record<string, unknown> | null | undefined,
  book: BookPreviewDTO,
  photos: Map<string, Photo>
): BookLayoutDocument | null {
  if (
    !raw ||
    raw.version !== 2 ||
    raw.storyId !== book.storyId ||
    raw.style !== book.bookStyle ||
    !Array.isArray(raw.pages)
  )
    return null;
  const pages = raw.pages
    .filter(isBookPage)
    .map((page) => ({ ...page, photoIds: page.photoIds.filter((id) => photos.has(id)) }));
  if (!pages.length || pages[0]?.kind !== 'cover') return null;
  return {
    version: 2,
    storyId: book.storyId,
    style: book.bookStyle,
    language:
      typeof raw.language === 'string' ? raw.language : (book.story.meta.actualLanguage ?? 'en'),
    title: typeof raw.title === 'string' ? raw.title : book.title,
    coverPhotoId: typeof raw.coverPhotoId === 'string' ? raw.coverPhotoId : null,
    chapters: Array.isArray(raw.chapters) ? raw.chapters.filter(isChapterPlan) : [],
    pages,
  };
}

export function compatibleLayouts(page: BookPage): BookLayoutKind[] {
  const count = page.photoIds.length;
  if (!count) return ['mixed', 'outro'];
  if (count === 1) return ['full_bleed', 'image_left', 'image_right', 'mixed'];
  if (count === 2) return ['two_photo', 'hero_two', 'mixed'];
  if (count === 3) return ['three_collage', 'hero_two'];
  return ['four_grid'];
}

export function changePageLayout(document: BookLayoutDocument, pageId: string): BookLayoutDocument {
  return updatePage(document, pageId, (page) => {
    const options = compatibleLayouts(page);
    return {
      ...page,
      kind: options[(options.indexOf(page.kind) + 1) % options.length]!,
      userEdited: true,
    };
  });
}
export function rotatePagePhotos(document: BookLayoutDocument, pageId: string): BookLayoutDocument {
  return updatePage(document, pageId, (page) => ({
    ...page,
    photoIds:
      page.photoIds.length > 1 ? [...page.photoIds.slice(1), page.photoIds[0]!] : page.photoIds,
    userEdited: true,
  }));
}
export function swapPageLeadPhoto(
  document: BookLayoutDocument,
  pageId: string
): BookLayoutDocument {
  const current = document.pages.findIndex((page) => page.id === pageId);
  const next = document.pages.findIndex(
    (page, index) => index > current && page.photoIds.length > 0
  );
  if (current < 0 || next < 0 || !document.pages[current]?.photoIds.length) return document;
  const pages = document.pages.map((page) => ({ ...page, photoIds: [...page.photoIds] }));
  [pages[current]!.photoIds[0], pages[next]!.photoIds[0]] = [
    pages[next]!.photoIds[0]!,
    pages[current]!.photoIds[0]!,
  ];
  pages[current]!.userEdited = true;
  pages[next]!.userEdited = true;
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
  });
  for (let index = 2; index < document.pages.length; index += 1)
    if (
      document.pages[index]!.kind === document.pages[index - 1]!.kind &&
      document.pages[index]!.kind === document.pages[index - 2]!.kind &&
      document.style !== 'minimalist'
    )
      issues.push(`${document.pages[index]!.id}: repeated layout`);
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
  if (language.startsWith('zh')) return `${year}年${Number(month)}月${Number(day)}日`;
  if (language === 'ja') return `${year}年${Number(month)}月${Number(day)}日`;
  if (language === 'ko') return `${year}년 ${Number(month)}월 ${Number(day)}일`;
  return `${monthName(Number(month))} ${Number(day)}, ${year}`;
}

export function renderBookHtml(document: BookLayoutDocument, photos: Map<string, Photo>): string {
  const pages = document.pages
    .map((page, index) => renderPage(page, photos, index, document.style))
    .join('');
  return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><style>${bookCss(document.style)}.media>figure{height:100%}.gallery .media>figure{height:auto}</style></head><body class="${document.style}">${pages}</body></html>`;
}

function renderPage(
  page: BookPage,
  photos: Map<string, Photo>,
  index: number,
  style: BookPreviewDTO['bookStyle']
): string {
  const figures = page.photoIds
    .map((id) => {
      const photo = photos.get(id);
      if (!photo) return '';
      const caption = page.captions[id] ?? photo.caption ?? '';
      return `<figure><img class="photo" src="${escapeHtml(photo.url)}"><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    })
    .join('');
  const copy = `<div class="copy">${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}${page.body ? `<p>${escapeHtml(page.body)}</p>` : ''}</div>`;
  const number =
    page.kind === 'cover'
      ? ''
      : `<span class="page-number">${String(index + 1).padStart(2, '0')}</span>`;
  if (page.kind === 'cover')
    return `<section class="page cover count-${page.photoIds.length}"><div class="media">${figures}</div><div class="cover-shade"></div><div class="cover-copy">${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}<h1>${escapeHtml(page.title ?? '')}</h1>${page.body ? `<p>${escapeHtml(page.body)}</p>` : ''}</div></section>`;
  if (page.kind === 'chapter_opener')
    return `<section class="page chapter_opener"><div class="media">${figures}</div>${copy}${number}</section>`;
  if (page.kind === 'full_bleed')
    return `<section class="page full_bleed"><div class="media">${figures}</div>${page.body || page.title ? copy : ''}${number}</section>`;
  if (page.kind === 'image_left' || page.kind === 'image_right')
    return `<section class="page split ${page.kind}">${page.kind === 'image_left' ? `<div class="media">${figures}</div>${copy}` : `${copy}<div class="media">${figures}</div>`}${number}</section>`;
  if (['two_photo', 'three_collage', 'four_grid', 'hero_two'].includes(page.kind))
    return `<section class="page gallery ${page.kind}"><div class="media">${figures}</div>${page.body || page.title ? copy : ''}${number}</section>`;
  return `<section class="page prose ${page.kind}">${copy}<div class="media">${figures}</div>${number}</section>`;
}

function bookCss(style: BookPreviewDTO['bookStyle']): string {
  const theme =
    style === 'warm_memoir'
      ? {
          paper: '#f7eee4',
          ink: '#4b332b',
          accent: '#b86f60',
          serif: '"Songti SC","Hiragino Mincho ProN",Georgia,serif',
        }
      : style === 'minimalist'
        ? {
            paper: '#fff',
            ink: '#111',
            accent: '#777',
            serif: '"Helvetica Neue","PingFang SC",Arial,sans-serif',
          }
        : {
            paper: '#f3eee6',
            ink: '#17262c',
            accent: '#d7643d',
            serif: '"Iowan Old Style","Songti SC",Georgia,serif',
          };
  return `@page{size:letter;margin:0}*{box-sizing:border-box}html,body{margin:0;background:${theme.paper};color:${theme.ink};font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","PingFang TC","Yu Gothic","Apple SD Gothic Neo",sans-serif}.page{width:215.9mm;height:279.4mm;overflow:hidden;break-after:page;position:relative;background:${theme.paper};padding:17mm}.photo{width:100%;height:100%;display:block;object-fit:cover}figure{margin:0;overflow:hidden;position:relative}figcaption{background:rgba(0,0,0,.55);bottom:0;color:#fff;font-size:7.5pt;left:0;line-height:1.35;padding:2mm 3mm;position:absolute;right:0}.eyebrow{color:${theme.accent};font-size:9pt;font-weight:800;letter-spacing:1.4px;margin-bottom:5mm;text-transform:uppercase}h1,h2,p{margin:0}h1{font-family:${theme.serif};font-size:${style === 'minimalist' ? 38 : 46}pt;line-height:1.03}h2{font-family:${theme.serif};font-size:${style === 'warm_memoir' ? 25 : 29}pt;line-height:1.15;margin-bottom:7mm}p{font-family:${theme.serif};font-size:${style === 'minimalist' ? 11.5 : 12.5}pt;line-height:${style === 'warm_memoir' ? 1.85 : 1.7};white-space:pre-wrap}.page-number{bottom:7mm;color:${theme.accent};font-size:8pt;position:absolute;right:10mm}.media{min-height:0}.cover{padding:0;color:#fff}.cover .media{display:grid;height:100%;inset:0;position:absolute}.cover.count-2 .media{grid-template-columns:1.25fr .75fr;gap:2mm}.cover.count-2 figure{height:100%}.cover-shade{background:linear-gradient(180deg,rgba(0,0,0,.03) 25%,rgba(0,0,0,.82));inset:0;position:absolute}.cover-copy{bottom:18mm;left:18mm;max-width:172mm;position:absolute;z-index:2}.cover-copy .eyebrow{color:#fff}.cover-copy p{font-size:14pt;margin-top:5mm}.chapter_opener{padding:0;color:#fff}.chapter_opener .media{height:100%;inset:0;position:absolute}.chapter_opener .media:after{background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.78));content:"";inset:0;position:absolute}.chapter_opener .copy{bottom:18mm;left:18mm;max-width:168mm;position:absolute;z-index:2}.chapter_opener p{max-width:150mm}.split{display:grid;gap:12mm;grid-template-columns:1.16fr .84fr}.split.image_right{grid-template-columns:.84fr 1.16fr}.split .media{height:245mm}.split .copy{align-self:center}.gallery .media{display:grid;gap:4mm;height:211mm}.gallery .copy{margin-top:8mm}.two_photo .media{grid-template-columns:1fr 1fr}.three_collage .media{grid-template-columns:1.3fr .7fr;grid-template-rows:1fr 1fr}.three_collage figure:first-child{grid-row:1/3}.hero_two .media{grid-template-columns:1fr 1fr;grid-template-rows:1.55fr 1fr}.hero_two figure:first-child{grid-column:1/3}.four_grid .media{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.full_bleed{padding:0}.full_bleed .media{height:100%;inset:0;position:absolute}.full_bleed .copy{background:rgba(255,255,255,.9);bottom:12mm;left:12mm;max-width:125mm;padding:7mm;position:absolute}.prose{display:grid;gap:11mm;grid-template-columns:${style === 'warm_memoir' ? '1.05fr .95fr' : '1fr 1fr'};align-items:center}.prose .media{height:185mm}.prose .media:empty{display:none}.prose.outro{grid-template-columns:1fr 1.2fr}${style === 'warm_memoir' ? '.page{border:4mm solid #efe0d2}.cover{border:0}.warm_memoir .gallery .media{border-radius:5mm}.warm_memoir figure{border-radius:3mm}' : ''}${style === 'minimalist' ? '.minimalist .page{padding:22mm}.minimalist .cover{padding:0}.minimalist .page-number{color:#999}.minimalist h2{letter-spacing:-.5px}.minimalist .gallery .media{height:220mm}' : '.travel_magazine h1{text-transform:uppercase;letter-spacing:-1.5px}.travel_magazine .split .copy{border-top:2mm solid #d7643d;padding-top:8mm}'}`;
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
function splitNarrative(value: string, max: number): string[] {
  const paragraphs = value
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (!chunks.length || chunks[chunks.length - 1]!.length + paragraph.length > max)
      chunks.push(paragraph);
    else chunks[chunks.length - 1] += `\n\n${paragraph}`;
  }
  return chunks.length ? chunks : [''];
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
  const pool = unique([cover, ...referenced, ...all]);
  return style === 'warm_memoir' ? pool.slice(0, 2) : [cover];
}
function chapterMeta(chapter: StoryChapterDTO): string | undefined {
  return [chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · ') || undefined;
}
function dominantFit(id: string, photos: Map<string, Photo>): 'cover' | 'contain' {
  const photo = photos.get(id);
  return photo?.width && photo.height && photo.width / photo.height > 2.2 ? 'contain' : 'cover';
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
function localizedLabel(language: string, key: 'closing'): string {
  if (key === 'closing')
    return language.startsWith('zh')
      ? '尾声'
      : language === 'ja'
        ? 'エピローグ'
        : language === 'ko'
          ? '에필로그'
          : 'Epilogue';
  return '';
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
