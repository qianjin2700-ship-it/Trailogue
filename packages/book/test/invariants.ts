import {
  estimateLineCount,
  figureFit,
  magazineTextCapacity,
  MIN_VISIBLE_FRACTION,
} from '../src/index.js';
import type { MagazineDocument, MagazinePage, StoryDocument } from '../src/index.js';

/**
 * 排版不变量。
 *
 * 这些函数把「版式看起来对不对」翻译成**可断言的字符串列表**：
 * 空数组 = 没有违规。所有检查只依赖文档模型 + 纯几何函数，
 * 不需要渲染、不需要截图、不需要真机。
 *
 * 检查项与 Phase B0 的验收清单一一对应：
 *   不出现孤立尾图 / 不发生文字溢出 / 不出现空白页面 /
 *   不产生异常裁图 / Story 阅读顺序稳定 / Magazine 页面顺序稳定
 */

const PHOTO_PAGE_KINDS = new Set(['cover', 'hero', 'full_width', 'two_spread', 'three_collage', 'image_text', 'closing']);

const EXPECTED_PHOTOS: Partial<Record<MagazinePage['kind'], number>> = {
  hero: 1,
  full_width: 1,
  two_spread: 2,
  three_collage: 3,
};

export function magazineViolations(document: MagazineDocument): string[] {
  const problems: string[] = [];
  const pages = document.pages;

  if (pages.length === 0) {
    problems.push('文档没有任何页面');
    return problems;
  }
  if (pages[0]?.kind !== 'cover') problems.push(`第一页不是封面：${pages[0]?.kind}`);
  if (pages[pages.length - 1]?.kind !== 'closing') {
    problems.push(`最后一页不是尾页：${pages[pages.length - 1]?.kind}`);
  }

  const ids = new Set<string>();
  const hasAnyPhoto = pages.some((page) => page.photos.length > 0);
  pages.forEach((page, index) => {
    const where = `第 ${index + 1} 页(${page.id}/${page.kind})`;
    if (ids.has(page.id)) problems.push(`${where} id 重复`);
    ids.add(page.id);

    /* 空白页 -------------------------------------------------------- */
    const hasPhotos = page.photos.length > 0;
    const hasText = Boolean(page.body?.trim());
    const hasTitle = Boolean(page.title?.trim());
    const isFactsPage = page.kind === 'trip_info';
    if (!hasPhotos && !hasText && !hasTitle && !isFactsPage) {
      problems.push(`${where} 是空白页`);
    }

    /* 孤立尾图 / 图数不匹配 ----------------------------------------- */
    if (page.kind === 'image_text' && page.photos.length > 1) {
      problems.push(`${where} 文图页放了 ${page.photos.length} 张图`);
    }
    if (page.kind === 'closing' && page.photos.length > 2) {
      problems.push(`${where} 尾页超过 2 张图`);
    }
    const expected = EXPECTED_PHOTOS[page.kind];
    if (expected !== undefined && page.photos.length !== expected) {
      problems.push(`${where} 期望 ${expected} 张图，实际 ${page.photos.length} 张`);
    }
    if (
      hasAnyPhoto &&
      PHOTO_PAGE_KINDS.has(page.kind) &&
      page.kind !== 'image_text' &&
      page.kind !== 'closing' &&
      !hasPhotos
    ) {
      problems.push(`${where} 是图片版式却没有照片`);
    }

    /* 文字溢出 ------------------------------------------------------ */
    if (page.body && (page.kind === 'hero' || page.kind === 'image_text')) {
      const capacity = magazineTextCapacity(page.kind === 'hero' ? 'hero' : 'image_text');
      const lines = estimateLineCount(page.body, capacity.lineWidthEm);
      if (lines > capacity.lines) {
        problems.push(`${where} 正文 ${lines} 行超出版心 ${capacity.lines} 行`);
      }
    }
    if (page.body && page.kind === 'quote') {
      const capacity = magazineTextCapacity('quote');
      const lines = estimateLineCount(page.body, capacity.lineWidthEm);
      if (lines > capacity.lines) {
        problems.push(`${where} 引语 ${lines} 行超出版心 ${capacity.lines} 行`);
      }
    }
    if (page.body && page.kind === 'closing') {
      const capacity = magazineTextCapacity('closing');
      const lines = estimateLineCount(page.body, capacity.lineWidthEm);
      if (lines > capacity.lines) {
        problems.push(`${where} 尾页正文 ${lines} 行超出版心 ${capacity.lines} 行`);
      }
    }

    /* 异常裁图 ------------------------------------------------------ */
    page.photos.forEach((photo, photoIndex) => {
      const fit = figureFit(page.kind, photoIndex, photo, page.lead ?? 'portrait');
      const cropped = fit.strategy === 'cover' && fit.visible < MIN_VISIBLE_FRACTION;
      if (cropped) {
        problems.push(`${where} 第 ${photoIndex + 1} 张图裁切过度（可见 ${fit.visible.toFixed(2)}）`);
      }
    });
  });

  /* 页面顺序：按章节出现的先后必须与书中一致 ------------------------- */
  const chapterOrder: string[] = [];
  for (const page of pages) {
    if (!page.chapterId) continue;
    if (chapterOrder[chapterOrder.length - 1] !== page.chapterId) chapterOrder.push(page.chapterId);
  }
  const unique = Array.from(new Set(chapterOrder));
  if (unique.length !== chapterOrder.length) {
    problems.push(`章节页序交错：${chapterOrder.join(' → ')}`);
  }

  return problems;
}

export function storyViolations(document: StoryDocument): string[] {
  const problems: string[] = [];
  const blocks = document.blocks;
  if (blocks.length === 0) {
    problems.push('文档没有任何内容块');
    return problems;
  }
  if (blocks[0]?.type !== 'header') problems.push(`第一个块不是标题：${blocks[0]?.type}`);

  const closingIndexes = blocks
    .map((block, index) => (block.type === 'closing' ? index : -1))
    .filter((index) => index >= 0);
  if (closingIndexes.length > 1) problems.push('出现多个尾声块');
  if (closingIndexes.length === 1 && closingIndexes[0] !== blocks.length - 1) {
    problems.push('尾声不在最后');
  }

  blocks.forEach((block, index) => {
    if (block.type === 'section') {
      if (!block.title.trim() && !block.text?.trim()) problems.push(`第 ${index + 1} 块是空章节`);
    }
    if (block.type === 'figure') {
      if (block.photos.length === 0) problems.push(`第 ${index + 1} 块是空图组`);
      if (block.photos.length > 3) problems.push(`第 ${index + 1} 块图组有 ${block.photos.length} 张图`);
      const expectedLayout = block.photos.length === 1 ? 'large' : block.photos.length === 2 ? 'pair' : 'gallery';
      if (block.layout !== expectedLayout) {
        problems.push(`第 ${index + 1} 块版式 ${block.layout} 与 ${block.photos.length} 张图不匹配`);
      }
    }
    if (block.type === 'paragraph' || block.type === 'closing') {
      if (!block.text.trim()) problems.push(`第 ${index + 1} 块正文为空`);
    }
  });

  return problems;
}

/** Story 里出现的照片 id 是否都来自输入（不允许凭空造图） */
export function storyPhotoIds(document: StoryDocument): string[] {
  return document.blocks.flatMap((block) => (block.type === 'figure' ? block.photos.map((photo) => photo.id) : []));
}

export function magazinePhotoIds(document: MagazineDocument): string[] {
  return document.pages.flatMap((page) => page.photos.map((photo) => photo.id));
}
