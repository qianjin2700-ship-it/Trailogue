import type { BookPreviewDTO, StoryChapterDTO } from '@/contracts/story';
import type { Photo } from '@/domain/photo/photo';

export type BookLayoutKind = 'cover' | 'chapter_opener' | 'full_bleed' | 'image_left' | 'image_right' | 'two_photo' | 'three_collage' | 'hero_two' | 'mixed';
export interface BookPage {
  id: string;
  kind: BookLayoutKind;
  eyebrow?: string;
  title?: string;
  body?: string;
  photoIds: string[];
  captions: Record<string, string>;
}
export interface BookLayoutDocument {
  style: BookPreviewDTO['bookStyle'];
  pages: BookPage[];
}

export function buildBookLayout(book: BookPreviewDTO, photos: Map<string, Photo>): BookLayoutDocument {
  const pages: BookPage[] = [{
    id: 'cover', kind: 'cover', title: book.tripTitle || book.title,
    eyebrow: book.startDate ?? undefined, body: book.subtitle ?? undefined,
    photoIds: book.coverPhotoId ? [book.coverPhotoId] : [], captions: {},
  }];
  if (book.story.preface.trim()) pages.push({ id: 'preface', kind: 'mixed', title: book.story.title, body: book.story.preface, photoIds: [], captions: {} });
  book.story.chapters.forEach((chapter, chapterIndex) => {
    pages.push({ id: `${chapter.chapterId}-opener`, kind: 'chapter_opener', eyebrow: [chapter.dateLabel, chapter.locationLabel].filter(Boolean).join(' · '), title: chapter.title, body: excerpt(chapter.narrative, 360), photoIds: chapter.photoIds.slice(0, 1), captions: chapter.captions });
    const remainingText = chapter.narrative.slice(excerpt(chapter.narrative, 360).length).trim();
    pages.push(...layoutChapter(chapter, chapterIndex, remainingText, photos));
  });
  if (book.story.epilogue.trim()) pages.push({ id: 'epilogue', kind: 'mixed', title: book.story.meta.actualLanguage === 'zh-Hans' ? '尾声' : 'Epilogue', body: book.story.epilogue, photoIds: [], captions: {} });
  return { style: book.bookStyle, pages };
}

function layoutChapter(chapter: StoryChapterDTO, chapterIndex: number, body: string, photos: Map<string, Photo>): BookPage[] {
  const ids = chapter.photoIds.slice(1);
  const pages: BookPage[] = [];
  let offset = 0;
  let pageIndex = 0;
  while (offset < ids.length) {
    const count = ids.length - offset;
    const slice = ids.slice(offset, offset + (count >= 3 ? 3 : count));
    const aspects = slice.map((id) => { const photo = photos.get(id); return photo?.width && photo.height ? photo.width / photo.height : 1; });
    let kind: BookLayoutKind;
    if (slice.length >= 3) kind = pageIndex % 2 === 0 ? 'hero_two' : 'three_collage';
    else if (slice.length === 2) kind = 'two_photo';
    else if (aspects[0] > 1.55 && body.length < 240) kind = 'full_bleed';
    else kind = (chapterIndex + pageIndex) % 2 === 0 ? 'image_left' : 'image_right';
    pages.push({ id: `${chapter.chapterId}-${pageIndex}`, kind, title: pageIndex === 0 ? chapter.title : undefined, body: pageIndex === 0 ? body : undefined, photoIds: slice, captions: chapter.captions });
    offset += slice.length;
    pageIndex += 1;
  }
  if (ids.length === 0 && body) pages.push({ id: `${chapter.chapterId}-text`, kind: 'mixed', body, photoIds: [], captions: {} });
  return pages;
}

function excerpt(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const boundary = Math.max(value.lastIndexOf('。', maxLength), value.lastIndexOf('. ', maxLength));
  return value.slice(0, boundary > maxLength * 0.55 ? boundary + 1 : maxLength);
}

export function makePdfFilename(title: string | null | undefined, startDate: string | null): string {
  const safeTitle = (title?.trim() || 'Trailogue').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80) || 'Trailogue';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '') ? `_${startDate}` : '';
  return `${safeTitle}${date}.pdf`;
}

export function renderBookHtml(document: BookLayoutDocument, photos: Map<string, Photo>): string {
  const palette = document.style === 'warm_memoir'
    ? ['#f6efe6', '#5b4030', '#b46f5b']
    : document.style === 'minimalist' ? ['#ffffff', '#111111', '#777777'] : ['#f5f0e8', '#1b262d', '#d2673a'];
  const pages = document.pages.map((page, index) => renderPage(page, photos, index)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:letter;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:${palette[0]};color:${palette[1]};font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","PingFang SC","PingFang TC","Yu Gothic","Apple SD Gothic Neo","Noto Sans CJK SC",sans-serif} .page{height:279.4mm;width:215.9mm;overflow:hidden;break-after:page;position:relative;background:${palette[0]};padding:18mm}h1,h2,p{margin:0}h1{font-size:34pt;line-height:1.05;letter-spacing:-1px}h2{font-size:23pt;line-height:1.15}.eyebrow{font-size:10pt;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${palette[2]};margin-bottom:6mm}.body{font-family:"Iowan Old Style","Songti SC","Yu Mincho",Georgia,serif;font-size:12.5pt;line-height:1.75;white-space:pre-wrap}.caption{font-size:8.5pt;line-height:1.3;color:#655e57;margin-top:2mm}.photo{display:block;height:100%;object-fit:cover;width:100%}.cover{padding:0;color:white}.cover:after{background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.76));content:"";inset:0;position:absolute}.cover .photo{height:100%;position:absolute}.cover-copy{bottom:18mm;left:18mm;max-width:170mm;position:absolute;z-index:2}.cover h1{font-size:42pt;text-align:left}.cover .eyebrow{color:white}.cover .body{font-size:15pt;margin-top:4mm}.chapter_opener{display:flex;flex-direction:column;justify-content:flex-end}.chapter_opener .backdrop{inset:0;position:absolute}.chapter_opener .backdrop:after{background:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.75));content:"";inset:0;position:absolute}.chapter_opener .copy{color:white;position:relative;z-index:2}.chapter_opener .eyebrow{color:#f4c7a9}.chapter_opener .body{font-size:13.5pt;margin-top:7mm;max-width:150mm}.split{display:grid;gap:11mm;grid-template-columns:1.18fr .82fr}.image_right{grid-template-columns:.82fr 1.18fr}.split .copy{align-self:center}.split h2{margin-bottom:7mm}.full_bleed{padding:0}.full_bleed .photo{position:absolute}.full_bleed .caption{background:rgba(255,255,255,.88);bottom:9mm;left:12mm;padding:3mm;position:absolute}.two_photo{display:grid;gap:5mm;grid-template-columns:1fr 1fr}.three_collage{display:grid;gap:4mm;grid-template-columns:1.25fr .75fr;grid-template-rows:1fr 1fr}.three_collage figure:first-child{grid-row:1/3}.hero_two{display:grid;gap:4mm;grid-template-columns:1fr 1fr;grid-template-rows:1.6fr 1fr}.hero_two figure:first-child{grid-column:1/3}.gallery figure{margin:0;min-height:0;overflow:hidden}.mixed{display:flex;flex-direction:column;justify-content:center}.mixed h2{margin-bottom:8mm}.mixed .body{max-width:165mm}.page-number{bottom:7mm;color:#8d857c;font-size:8pt;position:absolute;right:11mm}
.cover figure,.chapter_opener figure{inset:0;margin:0;position:absolute}.chapter_opener figure{height:100%}
</style></head><body>${pages}</body></html>`;
}

function renderPage(page: BookPage, photos: Map<string, Photo>, index: number): string {
  const figures = page.photoIds.map((id) => { const photo = photos.get(id); return photo ? `<figure><img class="photo" src="${escapeHtml(photo.url)}"><figcaption class="caption">${escapeHtml(page.captions[id] ?? photo.caption ?? '')}</figcaption></figure>` : ''; }).join('');
  const copy = `${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}${page.title ? `<h2>${escapeHtml(page.title)}</h2>` : ''}${page.body ? `<p class="body">${escapeHtml(page.body)}</p>` : ''}`;
  if (page.kind === 'cover') return `<section class="page cover">${figures || ''}<div class="cover-copy">${page.eyebrow ? `<div class="eyebrow">${escapeHtml(page.eyebrow)}</div>` : ''}<h1>${escapeHtml(page.title ?? '')}</h1>${page.body ? `<p class="body">${escapeHtml(page.body)}</p>` : ''}</div></section>`;
  if (page.kind === 'chapter_opener') return `<section class="page chapter_opener"><div class="backdrop">${figures}</div><div class="copy">${copy}</div><span class="page-number">${index + 1}</span></section>`;
  if (page.kind === 'full_bleed') return `<section class="page full_bleed">${figures}<span class="page-number">${index + 1}</span></section>`;
  if (page.kind === 'image_left' || page.kind === 'image_right') return `<section class="page split ${page.kind}">${page.kind === 'image_right' ? `<div class="copy">${copy}</div>${figures}` : `${figures}<div class="copy">${copy}</div>`}<span class="page-number">${index + 1}</span></section>`;
  if (page.kind === 'two_photo' || page.kind === 'three_collage' || page.kind === 'hero_two') return `<section class="page gallery ${page.kind}">${figures}<span class="page-number">${index + 1}</span></section>`;
  return `<section class="page mixed"><div>${copy}</div>${figures}<span class="page-number">${index + 1}</span></section>`;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!); }
