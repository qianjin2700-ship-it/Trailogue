/**
 * Chapter Divider 启用规则（2.0 Phase B0 冻结）。
 *
 * 背景：Phase A 的实现是「每章一页分隔」，等于把画册页数翻了一倍，
 * 短旅行会变成一堆几乎相同的空页。分隔页本身有用（它是章节呼吸点），
 * 但必须由**内容量**与**页面节奏**决定，而不是由章节数量机械决定。
 *
 * 本模块把这套判断做成纯函数：输入是编排器已知的确定性统计量
 * （章节数 / 照片数 / 文字长度 / 预计页数），输出是「哪些章节需要分隔页」。
 *
 * 规则（按顺序短路，全部可解释）：
 *
 *  R1 单章节 → 不加。只有一章的书没有「章节之间」这回事。
 *  R2 页数不足 → 不加。预计总页数 < 8 时，整本应是紧凑的短篇。
 *  R3 照片不足 → 不加。总照片 < 6 时同理（内容太薄，分隔页会显得空）。
 *  R4 第一章不加。封面 / 行程页 / 首章主图已经承担了「开场」，
 *     再插一页纯标题是重复。
 *  R5 分量门槛 → 该章要足够重：照片 ≥ 4 张或正文 ≥ 700 字。
 *  R6 上限 → 分隔页不超过 min(3, ⌊章节数/2⌋, ⌊页数/8⌋)，
 *     保证分隔页永远只是少数页（≤ 1/8 的篇幅节奏）。
 *  R7 间距 → 两个分隔页之间至少隔 3 个内容页；
 *     冲突时保留分量更重的一章（同分保留靠前的）。
 *
 * 所有阈值都在 `DIVIDER_RULES` 里，测试与文档引用同一份常量。
 */

export const DIVIDER_RULES = {
  /** R2：预计页数低于此值不加分隔页 */
  minPageCount: 8,
  /** R3：全书照片低于此值不加分隔页 */
  minPhotoCount: 6,
  /** R5：单章照片达到此值即视为「分量足够」 */
  weightPhotoCount: 4,
  /** R5：单章正文字符达到此值即视为「分量足够」 */
  weightTextLength: 700,
  /** R6：分隔页数量上限 */
  maxDividersHardCap: 3,
  /** R7：两个分隔页之间至少隔多少个内容页 */
  minPagesBetween: 3,
} as const;

export interface ChapterDividerInput {
  chapterId: string;
  /** 章节在书中的序号（从 0 开始） */
  index: number;
  photoCount: number;
  textLength: number;
  /** 该章正文/图片预计占用的页数（不含分隔页） */
  pageCount: number;
  /** 该章是否有任何可显示内容（标题/正文/照片） */
  hasContent: boolean;
}

export type DividerSkipReason =
  | 'single-chapter'
  | 'short-book'
  | 'few-photos'
  | 'first-chapter'
  | 'below-weight'
  | 'over-cap'
  | 'too-close'
  | 'empty-chapter'
  | 'disabled';

export interface ChapterDividerPlan {
  /** 需要插入分隔页的章节 id，按书中顺序 */
  chapterIds: string[];
  /** 未插入的原因，便于调试与文档对照 */
  skipped: { chapterId: string; reason: DividerSkipReason }[];
  /** 本次允许的最大分隔页数量 */
  maxDividers: number;
  /** 编排器估算的总页数（用于对照 R2 / R6） */
  estimatedPageCount: number;
  enabled: boolean;
}

export interface ChapterDividerContext {
  chapters: ChapterDividerInput[];
  /** 不含分隔页的预计总页数（封面 + 行程页 + 各章内容页 + 尾页） */
  estimatedPageCount: number;
  totalPhotoCount: number;
}

/** 章节分量分数：只用于排序，数值本身没有语义 */
export function chapterWeight(chapter: ChapterDividerInput): number {
  return chapter.photoCount * 100 + Math.min(chapter.textLength, 4000) / 4;
}

function meetsWeight(chapter: ChapterDividerInput): boolean {
  return (
    chapter.photoCount >= DIVIDER_RULES.weightPhotoCount ||
    chapter.textLength >= DIVIDER_RULES.weightTextLength
  );
}

export function planChapterDividers(context: ChapterDividerContext): ChapterDividerPlan {
  const { chapters, estimatedPageCount, totalPhotoCount } = context;
  const skipped: { chapterId: string; reason: DividerSkipReason }[] = [];

  const disabled = (reason: DividerSkipReason): ChapterDividerPlan => ({
    chapterIds: [],
    skipped: chapters.map((chapter) => ({ chapterId: chapter.chapterId, reason })),
    maxDividers: 0,
    estimatedPageCount,
    enabled: false,
  });

  // R1
  if (chapters.length <= 1) return disabled('single-chapter');
  // R2
  if (estimatedPageCount < DIVIDER_RULES.minPageCount) return disabled('short-book');
  // R3
  if (totalPhotoCount < DIVIDER_RULES.minPhotoCount) return disabled('few-photos');

  // R6
  const maxDividers = Math.max(
    0,
    Math.min(
      DIVIDER_RULES.maxDividersHardCap,
      Math.floor(chapters.length / 2),
      Math.floor(estimatedPageCount / DIVIDER_RULES.minPageCount),
    ),
  );
  if (maxDividers === 0) return disabled('over-cap');

  // R4 + R5 + 空章节
  const candidates: ChapterDividerInput[] = [];
  for (const chapter of chapters) {
    if (!chapter.hasContent) skipped.push({ chapterId: chapter.chapterId, reason: 'empty-chapter' });
    else if (chapter.index === 0) skipped.push({ chapterId: chapter.chapterId, reason: 'first-chapter' });
    else if (!meetsWeight(chapter)) skipped.push({ chapterId: chapter.chapterId, reason: 'below-weight' });
    else candidates.push(chapter);
  }

  // R6：按分量取前 N
  const ranked = [...candidates].sort((a, b) => {
    const delta = chapterWeight(b) - chapterWeight(a);
    return delta !== 0 ? delta : a.index - b.index;
  });
  const selected = new Set(ranked.slice(0, maxDividers).map((chapter) => chapter.chapterId));
  ranked.slice(maxDividers).forEach((chapter) => {
    skipped.push({ chapterId: chapter.chapterId, reason: 'over-cap' });
  });

  // R7：按书中顺序做间距检查，冲突时保留更重的一章
  const ordered = chapters.filter((chapter) => selected.has(chapter.chapterId));
  const kept: ChapterDividerInput[] = [];
  for (const chapter of ordered) {
    const previous = kept[kept.length - 1];
    if (!previous) {
      kept.push(chapter);
      continue;
    }
    const pagesBetween = chapters
      .filter((item) => item.index > previous.index && item.index < chapter.index)
      .reduce((total, item) => total + item.pageCount, 0);
    if (pagesBetween >= DIVIDER_RULES.minPagesBetween) {
      kept.push(chapter);
      continue;
    }
    // 太近：留下分量更重的一章
    if (chapterWeight(chapter) > chapterWeight(previous)) {
      kept[kept.length - 1] = chapter;
      skipped.push({ chapterId: previous.chapterId, reason: 'too-close' });
    } else {
      skipped.push({ chapterId: chapter.chapterId, reason: 'too-close' });
    }
  }

  return {
    chapterIds: kept.map((chapter) => chapter.chapterId),
    skipped,
    maxDividers,
    estimatedPageCount,
    enabled: kept.length > 0,
  };
}
