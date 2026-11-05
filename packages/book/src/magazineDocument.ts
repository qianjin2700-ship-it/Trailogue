import {
  planChapterDividers,
  type ChapterDividerInput,
  type ChapterDividerPlan,
} from './chapterDivider.js';
import { formatDateRange } from './format.js';
import {
  EXTREME_ASPECT,
  photoAspect,
  pickLead,
  planPlates,
  resolvePhotos,
  twoSpreadOrientation,
} from './layoutEngine.js';
import { captionFor, chapterEyebrow, photoIndex, type DocumentSource, type SourceChapter } from './source.js';
import { estimateLineCount, magazineTextCapacity, splitTextIntoPages } from './textFit.js';
import type {
  BlockPhoto,
  MagazineDocument,
  MagazinePage,
  MagazinePageKind,
} from './types.js';

/**
 * Magazine 2.0 编排器。
 *
 * 核心原则：**AI 不决定像素，程序决定版式**。
 * 这里的决策只有五类，全部可解释、可测试：
 *   1. 顺序：封面 → 行程页 →（[分隔页] → 主图页 → 续文页 → 图版页）* → 尾页
 *   2. 分隔页是否出现：由 chapterDivider 的确定性规则决定（不是每章一页）
 *   3. 一张照片在页面里占主导还是配角（取决于它在章节里的位置）
 *   4. 主图是竖构图还是横构图（决定用满幅还是文图分栏）
 *   5. 正文超过单页容量时按句子边界分页，绝不裁字
 *
 * 没有随机、没有时间依赖：同一份输入永远得到同一本画册。
 */

export interface MagazineBuildOptions {
  /**
   * 分隔页显式开关。
   * - 省略（默认）：按 `planChapterDividers` 的规则决定
   * - `true` / `false`：设计/调试用的强制覆盖
   */
  chapterDividers?: boolean;
  /** 行程信息页（日期 / 地点 / 数量），默认插入 */
  tripInfo?: boolean;
  /** 引语页候选，由内容理解环节产出；为空则不插页 */
  quotes?: { chapterIndex: number; text: string; attribution?: string }[];
}

/** 编排结果：文档本身 + 决策报告（测试与文档引用，不参与渲染） */
export interface MagazinePlan {
  document: MagazineDocument;
  dividerPlan: ChapterDividerPlan;
  /** 不含分隔页的预计总页数 */
  estimatedPageCount: number;
}

interface ChapterPlan {
  chapter: SourceChapter;
  index: number;
  photos: BlockPhoto[];
  leadKind: MagazinePageKind;
  lead: 'portrait' | 'landscape';
  /** 正文分段：第 0 段进主图页，其余进续文页 */
  bodyPages: string[];
  plates: BlockPhoto[][];
  quote?: { text: string; attribution?: string };
  pageCount: number;
}

export function planMagazine(
  source: DocumentSource,
  options: MagazineBuildOptions = {},
): MagazinePlan {
  const index = photoIndex(source);
  const dateRange = formatDateRange(source.startDate, source.endDate, source.language);
  const quotes = new Map((options.quotes ?? []).map((quote) => [quote.chapterIndex, quote]));

  const chapterPlans: ChapterPlan[] = source.chapters
    .map((chapter, chapterIndex) => buildChapterPlan(chapter, chapterIndex, index, quotes.get(chapterIndex)))
    .filter((plan): plan is ChapterPlan => plan !== null);

  const includeTripInfo = options.tripInfo !== false;
  const closing = buildClosingPages(source, index);
  const estimatedPageCount =
    1 + (includeTripInfo ? 1 : 0) + chapterPlans.reduce((total, plan) => total + plan.pageCount, 0) + closing.length;

  const dividerInput: ChapterDividerInput[] = chapterPlans.map((plan) => ({
    chapterId: plan.chapter.chapterId,
    index: plan.index,
    photoCount: plan.photos.length,
    textLength: plan.chapter.narrative.length,
    pageCount: plan.pageCount,
    hasContent: true,
  }));

  const dividerPlan: ChapterDividerPlan =
    options.chapterDividers === false
      ? emptyPlan(dividerInput, estimatedPageCount)
      : options.chapterDividers === true
        ? { ...forceAllPlan(dividerInput, estimatedPageCount) }
        : planChapterDividers({
            chapters: dividerInput,
            estimatedPageCount,
            totalPhotoCount: source.stats.photoCount,
          });

  const dividerIds = new Set(dividerPlan.chapterIds);
  const pages: MagazinePage[] = [];

  /* 封面 -------------------------------------------------------------- */
  const coverPhotos = source.coverPhotoId ? resolvePhotos([source.coverPhotoId], index) : [];
  const fallbackCover = source.photos.length ? resolvePhotos([source.photos[0]!.id], index) : [];
  const coverPhoto = coverPhotos.length ? coverPhotos : fallbackCover;
  pages.push({
    id: 'cover',
    kind: 'cover',
    eyebrow: dateRange,
    title: source.title,
    body: source.subtitle,
    photos: coverPhoto,
    lead: pickLead(coverPhoto),
  });

  if (includeTripInfo) {
    pages.push({ id: 'trip-info', kind: 'trip_info', photos: [] });
  }

  /* 章节 -------------------------------------------------------------- */
  for (const plan of chapterPlans) {
    const { chapter } = plan;
    if (dividerIds.has(chapter.chapterId)) {
      pages.push({
        id: `${chapter.chapterId}-divider`,
        kind: 'chapter_divider',
        chapterId: chapter.chapterId,
        eyebrow: chapterEyebrow(chapter),
        title: chapter.title,
        photos: [],
        // 大号数字是章节序号，不是页码
        ordinal: plan.index + 1,
      });
    }

    pages.push({
      id: `${chapter.chapterId}-lead`,
      kind: plan.leadKind,
      chapterId: chapter.chapterId,
      eyebrow: chapterEyebrow(chapter),
      title: chapter.title,
      body: plan.bodyPages[0],
      photos: plan.photos.slice(0, 1),
      align: plan.index % 2 === 0 ? 'left' : 'right',
      lead: plan.lead,
    });

    plan.bodyPages.slice(1).forEach((segment, segmentIndex) => {
      pages.push({
        id: `${chapter.chapterId}-text-${segmentIndex + 1}`,
        kind: 'image_text',
        chapterId: chapter.chapterId,
        eyebrow: segmentIndex === 0 ? chapterEyebrow(chapter) : undefined,
        title: segmentIndex === 0 ? chapter.title : undefined,
        body: segment,
        photos: [],
        align: 'left',
        bodyPart: segmentIndex + 1,
      });
    });

    plan.plates.forEach((chunk, pageIndex) => {
      const kind = plateKind(chunk.length);
      pages.push({
        id: `${chapter.chapterId}-plate-${pageIndex}`,
        kind,
        chapterId: chapter.chapterId,
        photos: chunk,
        // 图版页也要声明方向：三图拼版据此选「竖主图」还是「横主图」骨架，
        // 双图页据此选「并排」还是「上下分栏」。缺了这个字段，任何图版
        // 都会按竖主图骨架排，横图进去就只能留出上下两条空白。
        lead: kind === 'two_spread' ? twoSpreadOrientation(chunk) : pickLead(chunk),
        align: pageIndex % 2 === 0 ? 'right' : 'left',
      });
    });

    if (plan.quote) {
      pages.push({
        id: `${chapter.chapterId}-quote`,
        kind: 'quote',
        chapterId: chapter.chapterId,
        body: plan.quote.text,
        photos: [],
        eyebrow: plan.quote.attribution,
      });
    }
  }

  /* 尾页 -------------------------------------------------------------- */
  closing.forEach((page, pageIndex) => {
    pages.push({ ...page, id: pageIndex === 0 ? 'closing' : `closing-${pageIndex}` });
  });

  return {
    dividerPlan,
    estimatedPageCount,
    document: {
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
    },
  };
}

export function buildMagazineDocument(
  source: DocumentSource,
  options: MagazineBuildOptions = {},
): MagazineDocument {
  return planMagazine(source, options).document;
}

/** 1 张 → 整版大图；2 张 → 双图跨版；3 张 → 三图拼版 */
export function plateKind(count: number): MagazinePageKind {
  if (count <= 1) return 'full_width';
  if (count === 2) return 'two_spread';
  return 'three_collage';
}

/* ------------------------------------------------------------------ */
/* 单章规划                                                            */
/* ------------------------------------------------------------------ */

function buildChapterPlan(
  chapter: SourceChapter,
  index: number,
  photosById: Map<string, BlockPhoto>,
  quote: { text: string; attribution?: string } | undefined,
): ChapterPlan | null {
  const photos = resolvePhotos(chapter.photoIds, photosById).map((photo) => ({
    ...photo,
    caption: captionFor(chapter, photo),
  }));
  const hasPhotos = photos.length > 0;
  const hasText = chapter.narrative.length > 0;
  const hasTitle = chapter.title.length > 0;
  // 完全空白的章节不生成任何页（否则会留下一页只有边线的空白）
  if (!hasPhotos && !hasText && !hasTitle) return null;

  const lead = hasPhotos ? pickLead(photos) : 'landscape';
  // 竖构图主图走文图分栏，横构图走满幅 hero
  const leadKind: MagazinePageKind = hasPhotos && lead === 'landscape' ? 'hero' : 'image_text';
  const bodyPages = hasText
    ? splitTextIntoPages(chapter.narrative, magazineTextCapacity(leadKind === 'hero' ? 'hero' : 'image_text'))
    : [];

  const plates = planPlates(photos.slice(1));
  const acceptedQuote = quote && quote.text.trim() && fitsQuote(quote.text.trim())
    ? { text: quote.text.trim(), attribution: quote.attribution?.trim() || undefined }
    : undefined;

  const pageCount =
    1 + Math.max(0, bodyPages.length - 1) + plates.length + (acceptedQuote ? 1 : 0);

  return {
    chapter,
    index,
    photos,
    leadKind,
    lead,
    bodyPages,
    plates,
    ...(acceptedQuote ? { quote: acceptedQuote } : {}),
    pageCount,
  };
}

/** 引语页容量：超过就整页不出现，避免 26pt 大字压出版心 */
function fitsQuote(text: string): boolean {
  const capacity = magazineTextCapacity('quote');
  return estimateLineCount(text, capacity.lineWidthEm) <= capacity.lines;
}

/* ------------------------------------------------------------------ */
/* 尾页                                                                */
/* ------------------------------------------------------------------ */

/**
 * 尾页：铭文（epilogue）+ 末尾最多两张照片。
 *
 * 铭文过长时按**段落/句子**分页，前置的续文页插在尾页之前，
 * 尾页始终保存最后一段，署名「Trailogue」落在全书最后。
 */
function buildClosingPages(source: DocumentSource, index: Map<string, BlockPhoto>): MagazinePage[] {
  const photos = resolveClosingPhotos(source, index);
  const segments = source.epilogue
    ? splitTextIntoPages(source.epilogue, magazineTextCapacity('closing'))
    : [];
  if (!segments.length && !photos.length) return [];

  const pages: MagazinePage[] = [];
  const head = segments.length > 1 ? segments.slice(0, -1) : [];
  head.forEach((segment, segmentIndex) => {
    pages.push({
      id: `closing-text-${segmentIndex}`,
      kind: 'image_text',
      body: segment,
      photos: [],
      align: 'left',
      bodyPart: segmentIndex + 1,
    });
  });
  const tail = segments.length ? segments[segments.length - 1]! : undefined;
  pages.push({
    id: 'closing',
    kind: 'closing',
    title: tail ? undefined : source.title,
    body: tail,
    photos,
  });
  return pages;
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
  // 尾页的两个格位是固定 0.76 的方框：全景 / 超长竖图进去只能留白，
  // 干脆让尾页留字不留图 —— 收束页安静一点更好，也避免出现「半页空框」。
  return resolvePhotos(tail, index).filter((photo) => {
    const aspect = photoAspect(photo);
    return aspect <= EXTREME_ASPECT.wide && aspect >= EXTREME_ASPECT.tall;
  });
}

/* ------------------------------------------------------------------ */
/* 显式覆盖用的空计划                                                  */
/* ------------------------------------------------------------------ */

function emptyPlan(
  chapters: ChapterDividerInput[],
  estimatedPageCount: number,
): ChapterDividerPlan {
  return {
    chapterIds: [],
    skipped: chapters.map((chapter) => ({ chapterId: chapter.chapterId, reason: 'disabled' })),
    maxDividers: 0,
    estimatedPageCount,
    enabled: false,
  };
}

function forceAllPlan(
  chapters: ChapterDividerInput[],
  estimatedPageCount: number,
): ChapterDividerPlan {
  return {
    chapterIds: chapters.map((chapter) => chapter.chapterId),
    skipped: [],
    maxDividers: chapters.length,
    estimatedPageCount,
    enabled: chapters.length > 0,
  };
}
