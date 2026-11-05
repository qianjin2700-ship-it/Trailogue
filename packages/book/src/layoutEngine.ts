import { PAGE } from './tokens.js';
import type { BlockPhoto, MagazinePage, MagazinePageKind, PhotoAspectClass } from './types.js';

/**
 * 版式引擎的纯几何层。
 *
 * 只做「根据照片真实宽高比，判断它在某个槽位里会被裁掉多少」这类计算，
 * 不做任何视觉决策（选哪种版式由 Story / Magazine 的编排器决定）。
 *
 * 所有函数都是确定性的：相同输入永远得到相同输出，没有随机、没有时间依赖。
 */

/** 缺少宽高信息时按 3:2 处理（手机横拍最常见比例，裁切风险最低） */
export const DEFAULT_ASPECT = 1.5;

export function photoAspect(photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined): number {
  const width = photo?.width ?? null;
  const height = photo?.height ?? null;
  if (!width || !height || width <= 0 || height <= 0) return DEFAULT_ASPECT;
  return width / height;
}

export function classifyAspect(aspect: number): PhotoAspectClass {
  if (aspect < 0.85) return 'portrait';
  if (aspect < 1.05) return 'square';
  if (aspect < 1.45) return 'landscape';
  return 'wide';
}

/**
 * `object-fit: cover` 下，源图有多少比例仍然可见。
 * 用于判断「这张图放进这个槽位会不会把主体裁掉太多」。
 */
export function coverVisibleFraction(sourceAspect: number, slotAspect: number): number {
  if (!sourceAspect || !slotAspect) return 1;
  return sourceAspect > slotAspect ? slotAspect / sourceAspect : sourceAspect / slotAspect;
}

/**
 * 低于这个可见比例就认为裁切过度（主体可能被切掉），
 * 渲染器改用 `object-fit: contain` 留白居中，而不是硬裁。
 *
 * 取值依据：0.45 意味着「最多裁掉 55% 的画面」。
 * Phase B0 曾取 0.6，实测在真实画册里代价太大：手机横拍 3:2 的图放进
 * Letter 竖版页面只剩 0.52，于是每一张横图都变成上下留黑的「信箱版」，
 * 封面和 hero 页出现大片空边 —— 那看起来像渲染出错，而不是设计。
 * 0.45 让「同一方向的图进同一个槽位」都能满幅，只有全景/极端长图才留白。
 */
export const MIN_VISIBLE_FRACTION = 0.45;

/**
 * 满幅页（封面 / hero / 整版单图）的可见比例下限。
 *
 * 满幅页没有「纸张留白」这个概念 —— 图片必须铺满，留白只会露出底色。
 * 因此这里允许更大的裁切（0.34 ≈ 裁掉 2/3），只有 3:1 以上的全景图
 * 才会退回 contain，用深色底把它当成一条横向画面来呈现。
 */
export const MIN_FULL_BLEED_VISIBLE = 0.34;

const FULL_BLEED_KINDS = new Set<MagazinePageKind>(['cover', 'hero', 'full_width']);

/** 某个版式允许的最小可见比例 */
export function minVisibleFor(kind: MagazinePageKind): number {
  return FULL_BLEED_KINDS.has(kind) ? MIN_FULL_BLEED_VISIBLE : MIN_VISIBLE_FRACTION;
}

/* ------------------------------------------------------------------ */
/* 槽位几何：Letter 版心下每种页面版式的图片槽位宽高比                   */
/* ------------------------------------------------------------------ */

const CONTENT_W_MM = PAGE.widthMm - PAGE.marginMm * 2;
const CONTENT_H_MM = PAGE.heightMm - PAGE.marginMm * 2;
const PAGE_ASPECT = PAGE.widthMm / PAGE.heightMm;

/** image_text 的图片列宽度（与 magazineRender 的 1.16fr / .84fr + 9mm gutter 对应） */
export const IMAGE_TEXT_COLUMN_MM = ((CONTENT_W_MM - 9) * 1.16) / 2;

/** 版心高度（页高 - 上下页边距），image_text 图片列的最大高度 */
export const CONTENT_HEIGHT_MM = CONTENT_H_MM;

/**
 * 文图分栏里图片框的最小高度（占版心高度的比例）。
 *
 * 只按图片自身比例撑开时，一张 2:3 竖图在 99mm 宽的图版列里只有 132mm 高，
 * 摆在 Letter 页面上像缩略图 —— 图上方和下方各留 55mm 白，读起来是「这页没做完」。
 * 给一个下限，让图版至少占到版心的 68%，短章节的页面才立得住。
 */
export const IMAGE_TEXT_MIN_HEIGHT_RATIO = 0.68;

/**
 * 文图分栏里图片框的高度。
 *
 * 规则（确定性，三条按顺序）：
 *  1. 图片本身够高（按比例算出来已经超过下限）→ 就用自然高度，不裁；
 *  2. 否则撑到下限，但**不超过「刚好不越过裁切阈值」的高度**（见 figureFit）；
 *  3. 永远不超过版心。
 *
 * 结果是：竖图变大、方图变庄重、横图最多裁到阈值线，三种情况都不会出现
 * 「图很小 + 一大片白」或者「图铺满 + 画面被切掉一半」。
 */
export function imageTextFigureHeightMm(
  photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined,
): number {
  const aspect = photoAspect(photo);
  const natural = IMAGE_TEXT_COLUMN_MM / aspect;
  const floor = CONTENT_H_MM * IMAGE_TEXT_MIN_HEIGHT_RATIO;
  if (natural >= floor) return Math.min(natural, CONTENT_H_MM);
  const maxCoverHeight = IMAGE_TEXT_COLUMN_MM / (aspect * MIN_VISIBLE_FRACTION);
  return Math.min(CONTENT_H_MM, Math.max(natural, Math.min(floor, maxCoverHeight)));
}

/** 文图分栏的图片框实际宽高比（高度可能被下限撑高） */
export function imageTextSlotAspect(
  photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined,
): number {
  return IMAGE_TEXT_COLUMN_MM / imageTextFigureHeightMm(photo);
}
const COLLAGE_GAP_MM = 3;
const COLLAGE_LEFT_MM = ((CONTENT_W_MM - COLLAGE_GAP_MM) * 1.24) / 2;
const COLLAGE_RIGHT_MM = ((CONTENT_W_MM - COLLAGE_GAP_MM) * 0.76) / 2;
const COLLAGE_ROW_MM = (CONTENT_H_MM - COLLAGE_GAP_MM) / 2;

const THREE_COLLAGE_SLOTS = [
  COLLAGE_LEFT_MM / CONTENT_H_MM,
  COLLAGE_RIGHT_MM / COLLAGE_ROW_MM,
  COLLAGE_RIGHT_MM / COLLAGE_ROW_MM,
] as const;

/** 横主图三图拼版：首图通栏（1.32fr / 1fr 两行，首图跨两列） */
const COLLAGE_LEAD_ROW_MM = (CONTENT_H_MM - COLLAGE_GAP_MM) * (1.32 / 2.32);
const COLLAGE_TAIL_ROW_MM = (CONTENT_H_MM - COLLAGE_GAP_MM) * (1 / 2.32);
const THREE_COLLAGE_LANDSCAPE_SLOTS = [
  CONTENT_W_MM / COLLAGE_LEAD_ROW_MM,
  CONTENT_W_MM / 2 / COLLAGE_TAIL_ROW_MM,
  CONTENT_W_MM / 2 / COLLAGE_TAIL_ROW_MM,
] as const;

/**
 * 某个版式里第 `index` 张照片的槽位宽高比。
 * 无法容纳照片的版式（文字页、分隔页）返回页面比例占位值。
 */
export function figureSlotAspect(
  kind: MagazinePageKind,
  index = 0,
  lead: 'portrait' | 'landscape' = 'portrait',
): number {
  switch (kind) {
    case 'cover':
    case 'hero':
    case 'full_width':
      return PAGE_ASPECT;
    case 'image_text':
      return IMAGE_TEXT_COLUMN_MM / CONTENT_H_MM;
    case 'two_spread':
      // 两张竖图并排（各占半宽、满高）；其余一律上下分栏（各占整宽、半高）。
      // 由 twoSpreadOrientation() 决定，编排器把结果写进 page.lead。
      return lead === 'portrait'
        ? PAGE.widthMm / 2 / PAGE.heightMm
        : PAGE.widthMm / ((PAGE.heightMm - 3) / 2);
    case 'closing':
      // 尾页两图并排：内容宽 (183.9 - 4mm gap) / 2，高 118mm
      return ((CONTENT_W_MM - 4) / 2) / 118;
    case 'three_collage':
      return (
        (lead === 'landscape' ? THREE_COLLAGE_LANDSCAPE_SLOTS : THREE_COLLAGE_SLOTS)[index] ??
        THREE_COLLAGE_SLOTS[2]
      );
    default:
      return PAGE_ASPECT;
  }
}

export type FigureFitStrategy = 'cover' | 'contain';

export interface FigureFit {
  strategy: FigureFitStrategy;
  /** cover 时仍然可见的源图比例（1 表示完全容纳） */
  visible: number;
  /** 源图宽高比 */
  aspect: number;
}

/**
 * 照片在某个槽位里的填充策略。
 *
 * 规则（确定性）：
 *  1. 可见比例 ≥ `minVisibleFor(kind)` → `cover`（满幅裁切，视觉最有力）；
 *  2. 否则 → `contain`（完整保留画面，两侧/上下留白）。
 *
 * 满幅页与有图框的版式用**不同**阈值，因为两者的「留白」含义不同：
 * 满幅页留白会露出底色，图框留白是纸张本身。详见 minVisibleFor()。
 */
export function figureFit(
  kind: MagazinePageKind,
  index: number,
  photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined,
  lead: 'portrait' | 'landscape' = 'portrait',
  /** 显式指定槽位比例（上下分栏这类「槽位取决于同页其他图」的版式用） */
  explicitSlot?: number,
): FigureFit {
  const aspect = photoAspect(photo);
  // 文图分栏的图框高度由 imageTextFigureHeightMm 决定（可能被下限撑高），
  // 所以它的槽位比例要按「框」算，而不是按图片自身比例算。
  const slot =
    explicitSlot ??
    (kind === 'image_text' ? imageTextSlotAspect(photo) : figureSlotAspect(kind, index, lead));
  const visible = coverVisibleFraction(aspect, slot);
  return {
    strategy: visible >= minVisibleFor(kind) ? 'cover' : 'contain',
    visible,
    aspect,
  };
}

/**
 * 双图页的排法：两张都是竖图才并排（两列），否则上下分栏（两行）。
 *
 * 原因：并排时每张只有 0.39 的槽位比例，横图和方图进去必然留出大块空白；
 * 上下分栏的槽位是 1.56，横图/方图几乎不需要裁、竖图也只裁上下两端。
 * 只有「两张都竖」时并排才比上下分栏更合适（0.39 vs 0.75 的裁切量更小）。
 */
export function twoSpreadOrientation(photos: BlockPhoto[]): 'portrait' | 'landscape' {
  if (!photos.length) return 'landscape';
  // 只有「真正的竖图」并排才划算：0.85 的图放进 0.39 的槽位还剩 45% 可见，
  // 再宽一点（方图 1.0）就只剩 39%，必须改成上下分栏。
  const allPortrait = photos.every((photo) => classifyAspect(photoAspect(photo)) === 'portrait');
  return allPortrait ? 'portrait' : 'landscape';
}

/**
 * 上下分栏时每一行的高度权重（fr）。
 *
 * 行高与 1/宽高比 成正比 → 每张图铺满自己那一行时，裁切比例相同。
 * 也就是「短边等高」的经典图墙对齐法：横图那一行矮、竖图那一行高，
 * 两张图的可见比例都在 0.6 上下，谁都不过度裁，谁都不用留白。
 */
export function stackedRowWeights(photos: BlockPhoto[]): number[] {
  return photos.map((photo) => 1 / photoAspect(photo));
}

/**
 * 一页里每张照片的实际槽位宽高比。
 *
 * 大部分版式是常量（见 figureSlotAspect），只有上下分栏的双图页依赖
 * 「另一张图有多高」——所以槽位必须按整页算，不能按单张图算。
 */
export function pageSlotAspects(
  page: Pick<MagazinePage, 'kind' | 'photos' | 'lead'>,
): number[] {
  // 文图分栏的图框高度是「按图片自身比例算出来的」（见 imageTextFigureHeightMm），
  // 所以槽位比例就等于图片比例本身，永远不需要裁。
  if (page.kind === 'image_text') return page.photos.map((photo) => imageTextSlotAspect(photo));
  if (page.kind === 'two_spread' && page.lead !== 'portrait') {
    const photos = page.photos.slice(0, 2);
    const weights = stackedRowWeights(photos);
    const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    // 3mm 的行间距从可用高度里扣掉
    const usable = PAGE.heightMm - 3;
    return weights.map((weight) => PAGE.widthMm / ((usable * weight) / total));
  }
  return page.photos.map((_, index) => figureSlotAspect(page.kind, index, page.lead ?? 'portrait'));
}

/* ------------------------------------------------------------------ */
/* 照片分组                                                            */
/* ------------------------------------------------------------------ */

/**
 * 把连续的 N 张照片切成每页/每块的照片数。
 *
 * 规则（避免出现「孤零零一张图」的尴尬页）：
 *   1 → [1]、2 → [2]、3 → [3]
 *   4 → [1,3]、5 → [2,3]、6 → [3,3]、7 → [1,3,3]、8 → [2,3,3]
 *   余数永远排在最前（1 张独立大图 / 2 张跨版），其余按 3 张一组，
 *   保证最后一页是满的，不会以「一张图」收尾。
 */
export function splitPhotoRun(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  const sizes: number[] = [];
  const remainder = count % 3;
  let rest = count;
  // 余数先出：1 → 一张独立大图打头，2 → 一组双图打头，剩下的全部按 3 张
  // 这样最后一页永远是满的 3 张，不会出现「最后一页只有一张图」的孤儿页。
  if (remainder !== 0) {
    sizes.push(remainder);
    rest -= remainder;
  }
  while (rest > 0) {
    sizes.push(3);
    rest -= 3;
  }
  return sizes;
}

/** 主图竖/横构图：决定了 hero 页用「满幅裁切」还是「上图文下文」 */
export function pickLead(photos: BlockPhoto[]): 'portrait' | 'landscape' {
  const first = photos[0];
  if (!first) return 'landscape';
  return photoAspect(first) < 1.05 ? 'portrait' : 'landscape';
}

/** 从照片列表里按 id 取照片，缺失的静默丢弃（照片被删是常态，不该让整页失败） */
export function resolvePhotos(ids: string[], photos: Map<string, BlockPhoto>): BlockPhoto[] {
  const resolved: BlockPhoto[] = [];
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (seen.has(id)) return;
    const photo = photos.get(id);
    if (!photo) return;
    seen.add(id);
    resolved.push(photo);
  });
  return resolved;
}

/**
 * 极端比例的边界。超出这个范围的照片不适合和别人共享一页：
 * 3:1 全景塞进 0.45 的竖槽只剩 15% 画面，再裁就成了「一条缝」。
 * 这类照片单独给一整页，反而是最合适的待遇。
 */
export const EXTREME_ASPECT = {
  /** 比这个还宽（> 2.6:1）视为全景 */
  wide: 2.6,
  /** 比这个还窄（< 1:2.4）视为超长竖图 */
  tall: 1 / 2.4,
} as const;

function isExtreme(photo: BlockPhoto): boolean {
  const aspect = photoAspect(photo);
  return aspect > EXTREME_ASPECT.wide || aspect < EXTREME_ASPECT.tall;
}

/**
 * 图版分页：比 chunkPhotos 多两条「按方向分家」的规则。
 *
 * chunkPhotos 只保证「没有孤零零一张图收尾」，但不管方向 —— 于是
 * [竖图, 横图, 横图] 会被塞进同一页：竖主图骨架的右侧槽位只有 0.56，
 * 两张横图进去各自剩 37% 可见，留出上下两条空白，看着像渲染失败。
 *
 * 这里的规则（确定性）：
 *  1. 极端比例（全景 / 超长竖图）单独成页 —— 满幅页才是它的归宿；
 *  2. 三张一组时若方向混合（既有竖图又有横图），首张单独成页、
 *     后两张同页 —— 两个页面各自只含一个方向的照片；
 *  3. 其余情况沿用 chunkPhotos 的分组（1 / 2 / 3）。
 */
export function planPlates(photos: BlockPhoto[]): BlockPhoto[][] {
  const pages: BlockPhoto[][] = [];
  let buffer: BlockPhoto[] = [];
  const flush = () => {
    if (buffer.length) pages.push(buffer);
    buffer = [];
  };

  photos.forEach((photo) => {
    if (isExtreme(photo)) {
      flush();
      pages.push([photo]);
      return;
    }
    buffer.push(photo);
    if (buffer.length < 3) return;
    const portraits = buffer.filter((item) => photoAspect(item) < 1.05).length;
    if (portraits > 0 && portraits < buffer.length) {
      pages.push([buffer[0]!]);
      buffer = buffer.slice(1);
    }
    flush();
  });
  flush();
  return pages;
}

/** 把一段照片按 splitPhotoRun 切块 */
export function chunkPhotos(photos: BlockPhoto[]): BlockPhoto[][] {
  const chunks: BlockPhoto[][] = [];
  let offset = 0;
  splitPhotoRun(photos.length).forEach((size) => {
    chunks.push(photos.slice(offset, offset + size));
    offset += size;
  });
  return chunks;
}
