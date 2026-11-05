import { formatDateRange } from './format';
import { chunkPhotos, resolvePhotos } from './layoutEngine';
import { captionFor, chapterEyebrow, photoIndex, type DocumentSource } from './source';
import type { StoryBlock, StoryDocument, StoryFigureLayout } from './types';

/**
 * Story 2.0 编排器。
 *
 * 输出一个「可阅读的块序列」：标题 → 序 →（章节 → 图文块）* → 尾声。
 * 这里不做任何视觉判断，只决定**顺序**与**图文配比**；
 * 具体字号、间距、图片宽度全部交给渲染器（storyRender.ts）。
 *
 * 与 1.0 的差别：1.0 是「一段文字 + 该章所有照片平铺」，
 * 2.0 把照片切成 1 / 2 / 3 张一组，穿插在章节内，阅读时不会一次撞上十张图。
 */

export interface StoryBuildOptions {
  /** 可选的高光引语，由内容理解环节产出；为空则不产生引语块 */
  highlights?: { chapterIndex: number; text: string; attribution?: string }[];
}

export function buildStoryDocument(
  source: DocumentSource,
  options: StoryBuildOptions = {},
): StoryDocument {
  const index = photoIndex(source);
  const blocks: StoryBlock[] = [];
  const dateRange = formatDateRange(source.startDate, source.endDate, source.language);

  blocks.push({
    type: 'header',
    title: source.title,
    subtitle: source.subtitle,
    eyebrow: dateRange,
  });

  if (source.preface) blocks.push({ type: 'paragraph', text: source.preface });

  const highlights = new Map((options.highlights ?? []).map((item) => [item.chapterIndex, item]));

  source.chapters.forEach((chapter, chapterIndex) => {
    blocks.push({
      type: 'section',
      title: chapter.title,
      eyebrow: chapterEyebrow(chapter),
      text: chapter.narrative || undefined,
    });

    const photos = resolvePhotos(chapter.photoIds, index).map((photo) => ({
      ...photo,
      caption: captionFor(chapter, photo),
    }));
    chunkPhotos(photos).forEach((chunk) => {
      blocks.push({ type: 'figure', layout: figureLayout(chunk.length), photos: chunk });
    });

    const highlight = highlights.get(chapterIndex);
    if (highlight?.text.trim()) {
      blocks.push({
        type: 'quote',
        text: highlight.text.trim(),
        attribution: highlight.attribution?.trim() || undefined,
      });
    }
  });

  if (source.epilogue) blocks.push({ type: 'closing', text: source.epilogue });

  return {
    version: 1,
    language: source.language,
    title: source.title,
    blocks,
    stats: {
      chapterCount: source.stats.chapterCount,
      photoCount: blocks.reduce(
        (total, block) => total + (block.type === 'figure' ? block.photos.length : 0),
        0,
      ),
    },
  };
}

/** 1 张 → 大图，2 张 → 并排，3 张及以上 → 图组 */
export function figureLayout(count: number): StoryFigureLayout {
  if (count <= 1) return 'large';
  if (count === 2) return 'pair';
  return 'gallery';
}
