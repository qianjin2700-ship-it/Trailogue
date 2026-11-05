import {
  estimateLineCount,
  EXTREME_ASPECT,
  photoAspect,
  figureFit,
  magazineTextCapacity,
  MIN_FULL_BLEED_VISIBLE,
  pageSlotAspects,
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
    const slots = pageSlotAspects(page);
    page.photos.forEach((photo, photoIndex) => {
      const fit = figureFit(page.kind, photoIndex, photo, page.lead ?? 'portrait', slots[photoIndex]);
      if (fit.strategy === 'cover' && fit.visible < MIN_FULL_BLEED_VISIBLE) {
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

/* ------------------------------------------------------------------ */
/* 视觉质量不变量（Phase B1）                                          */
/* ------------------------------------------------------------------ */

/**
 * 结构性不变量保证「没有坏页」，但不保证「好看」。
 * 这里补三条只看文档模型就能判断的视觉规则 —— 它们对应的都是
 * Phase B1 在 mock preview 里真实踩到的问题：
 *
 *  1. **信箱化**（letterboxing）：图片放进槽位后上下/左右留出大片底色。
 *     成因是「一律 contain 兜底」。现在允许的最大留白是 20% 的照片，
 *     且不允许出现「整页照片全部留白」的页面（那就是一页空框）。
 *  2. **分隔页节奏**：分隔页前后的呼吸感来自间距，不是数量。
 *     要求任意两个分隔页之间至少 2 个内容页，且占比不超过 1/8。
 *  3. **封面必须有满幅图**：封面是唯一不能用「纸张留白」解释的页面，
 *     第一张照片一旦 contain，整本书的第一眼就是一条空带。
 */
export function visualViolations(document: MagazineDocument): string[] {
  const problems: string[] = [];
  const pages = document.pages;
  const photos = pages.flatMap((page) => page.photos);
  if (!photos.length) return problems;

  /* 1. 信箱化 ------------------------------------------------------ */
  let contained = 0;
  let normalPhotos = 0;
  pages.forEach((page, index) => {
    const where = `第 ${index + 1} 页(${page.kind})`;
    const pageSlots = pageSlotAspects(page);
    const containCount = page.photos.filter((photo, photoIndex) => {
      const fit = figureFit(page.kind, photoIndex, photo, page.lead ?? 'portrait', pageSlots[photoIndex]);
      return fit.strategy === 'contain';
    }).length;
    contained += containCount;
    // 全景 / 超长竖图留白是正确选择（塞进去只能裁成一条缝），不计入分母
    normalPhotos += page.photos.filter((photo) => {
      const aspect = photoAspect(photo);
      return aspect <= EXTREME_ASPECT.wide && aspect >= EXTREME_ASPECT.tall;
    }).length;
    // 一页里有 2 张以上留白 = 图框大小不一、版面碎掉（Phase B1 的三图拼版就是这样翻车的）。
    // 单张留白是允许的：3:1 全景放进竖版页面，留白比硬裁更合适。
    if (containCount > 1) {
      problems.push(`${where} 有 ${containCount} 张图留白，版面会碎`);
    }
    if (page.kind === 'cover' && containCount > 0) {
      const fit = figureFit('cover', 0, page.photos[0]!, page.lead ?? 'portrait');
      if (fit.visible >= MIN_FULL_BLEED_VISIBLE) {
        problems.push(`${where} 封面图可以满幅却被判为留白`);
      }
    }
  });
  if (normalPhotos > 0 && contained / normalPhotos > 0.2) {
    problems.push(`留白照片占比 ${(contained / normalPhotos).toFixed(2)}，超过 0.20`);
  }

  /* 2. 分隔页节奏 -------------------------------------------------- */
  const dividerIndexes = pages
    .map((page, index) => (page.kind === 'chapter_divider' ? index : -1))
    .filter((index) => index >= 0);
  for (let i = 1; i < dividerIndexes.length; i += 1) {
    const gap = dividerIndexes[i]! - dividerIndexes[i - 1]! - 1;
    if (gap < 2) problems.push(`分隔页之间只隔 ${gap} 页，节奏过密`);
  }
  if (dividerIndexes.length > Math.max(1, Math.floor(pages.length / 8))) {
    problems.push(`分隔页 ${dividerIndexes.length} 个，超过总页数的 1/8`);
  }

  /* 3. 分隔页的大号数字必须是章节序号、且严格递增 ------------------- */
  let lastOrdinal = 0;
  dividerIndexes.forEach((pageIndex) => {
    const page = pages[pageIndex]!;
    const ordinal = page.ordinal ?? 0;
    if (ordinal <= lastOrdinal) {
      problems.push(`第 ${pageIndex + 1} 页分隔页序号 ${ordinal} 未递增（上一页 ${lastOrdinal}）`);
    }
    lastOrdinal = Math.max(lastOrdinal, ordinal);
  });

  return problems;
}
