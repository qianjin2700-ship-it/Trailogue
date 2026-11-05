import { formatDateRange } from './format';
import { chunkPhotos, pickLead, resolvePhotos } from './layoutEngine';
import { captionFor, chapterEyebrow, photoIndex, type DocumentSource } from './source';
import type {
  BlockPhoto,
  MagazineDocument,
  MagazinePage,
  MagazinePageKind,
} from './types';

/**
 * Magazine 2.0 编排器。
 *
 * 核心原则：**AI 不决定像素，程序决定版式**。
 * 这里的决策只有四类，全部可解释、可测试：
 *   1. 顺序：封面 → 行程页 →（章节页 → 主图页 → 图版页）* → 尾页
 *   2. 一张照片在页面里占主导还是配角（取决于它在章节里的位置）
 *   3. 主图是竖构图还是横构图（决定用满幅还是文图分栏）
 *   4. 剩余照片按 1 / 2 / 3 张切成「整版大图 / 双图跨版 / 三图拼版」
 *
 * 没有随机、没有时间依赖：同一份输入永远得到同一本画册。
 */

export interface MagazineBuildOptions {
  /** 章节分隔页，默认插入 */
  chapterDividers?: boolean;
  /** 行程信息页（日期 / 地点 / 数量），默认插入 */
  tripInfo?: boolean;
  /** 引语页候选，由内容理解环节产出；为空则不插页 */
  quotes?: { chapterIndex: number; text: string; attribution?: string }[];
}

export function buildMagazineDocument(
  source: DocumentSource,
  options: MagazineBuildOptions = {},
): MagazineDocument {
  const index = photoIndex(source);
  const pages: MagazinePage[] = [];
  const dateRange = formatDateRange(source.startDate, source.endDate, source.language);

  const coverPhotos = source.coverPhotoId ? resolvePhotos([source.coverPhotoId], index) : [];
  const fallbackCover = source.photos.length ? resolvePhotos([source.photos[0]!.id], index) : [];
  pages.push({
    id: 'cover',
    kind: 'cover',
    eyebrow: dateRange,
    title: source.title,
    body: source.subtitle,
    photos: coverPhotos.length ? coverPhotos : fallbackCover,
    lead: pickLead(coverPhotos.length ? coverPhotos : fallbackCover),
  });

  if (options.tripInfo !== false) {
    pages.push({ id: 'trip-info', kind: 'trip_info', photos: [] });
  }

  const quotes = new Map((options.quotes ?? []).map((quote) => [quote.chapterIndex, quote]));

  source.chapters.forEach((chapter, chapterIndex) => {
    if (options.chapterDividers !== false) {
      pages.push({
        id: `${chapter.chapterId}-divider`,
        kind: 'chapter_divider',
        chapterId: chapter.chapterId,
        eyebrow: chapterEyebrow(chapter),
        title: chapter.title,
        photos: [],
      });
    }

    const photos = resolvePhotos(chapter.photoIds, index).map((photo) => ({
      ...photo,
      caption: captionFor(chapter, photo),
    }));
    const [lead, ...rest] = photos;

    if (!lead) {
      // 只有文字没有照片：仍然给一页，避免章节凭空消失
      if (chapter.narrative) {
        pages.push({
          id: `${chapter.chapterId}-text`,
          kind: 'image_text',
          chapterId: chapter.chapterId,
          eyebrow: chapterEyebrow(chapter),
          title: chapter.title,
          body: chapter.narrative,
          photos: [],
          align: 'left',
        });
      }
    } else {
      const leadKind: MagazinePageKind = pickLead([lead]) === 'portrait' ? 'image_text' : 'hero';
      pages.push({
        id: `${chapter.chapterId}-lead`,
        kind: leadKind,
        chapterId: chapter.chapterId,
        eyebrow: chapterEyebrow(chapter),
        title: chapter.title,
        body: chapter.narrative || undefined,
        photos: [lead],
        align: chapterIndex % 2 === 0 ? 'left' : 'right',
        lead: pickLead([lead]),
      });

      chunkPhotos(rest).forEach((chunk, pageIndex) => {
        pages.push({
          id: `${chapter.chapterId}-plate-${pageIndex}`,
          kind: plateKind(chunk.length),
          chapterId: chapter.chapterId,
          photos: chunk,
          align: pageIndex % 2 === 0 ? 'right' : 'left',
        });
      });
    }

    const quote = quotes.get(chapterIndex);
    if (quote?.text.trim()) {
      pages.push({
        id: `${chapter.chapterId}-quote`,
        kind: 'quote',
        chapterId: chapter.chapterId,
        body: quote.text.trim(),
        photos: [],
        eyebrow: quote.attribution?.trim() || undefined,
      });
    }
  });

  const closingPhotos = resolveClosingPhotos(source, index);
  if (source.epilogue || closingPhotos.length) {
    pages.push({
      id: 'closing',
      kind: 'closing',
      title: source.epilogue ? undefined : source.title,
      body: source.epilogue,
      photos: closingPhotos,
    });
  }

  return {
    version: 1,
    language: source.language,
    title: source.title,
    subtitle: source.subtitle,
    trip: {
      dateLabel: dateRange,
      locationLabel: source.chapters.find((chapter) => chapter.locationLabel)?.locationLabel,
      photoCount: source.stats.photoCount,
      chapterCount: source.stats.chapterCount,
    },
    pages,
  };
}

/** 1 张 → 整版大图；2 张 → 双图跨版；3 张 → 三图拼版 */
export function plateKind(count: number): MagazinePageKind {
  if (count <= 1) return 'full_width';
  if (count === 2) return 'two_spread';
  return 'three_collage';
}

/** 尾页照片：优先取故事末尾的实际照片，最多 2 张 */
function resolveClosingPhotos(
  source: DocumentSource,
  index: Map<string, BlockPhoto>,
): BlockPhoto[] {
  const tail = source.chapters
    .flatMap((chapter) => chapter.photoIds)
    .slice(-2)
    .reverse();
  return resolvePhotos(tail, index);
}
