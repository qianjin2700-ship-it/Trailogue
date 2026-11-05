import { PAGE } from './tokens.js';
import type { BlockPhoto, MagazinePageKind, PhotoAspectClass } from './types.js';

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
 * 取值依据：0.6 意味着「最多裁掉 40% 的画面」，
 * 对旅行照片（主体通常在中央 1/3）来说是安全线。
 */
export const MIN_VISIBLE_FRACTION = 0.6;

/* ------------------------------------------------------------------ */
/* 槽位几何：Letter 版心下每种页面版式的图片槽位宽高比                   */
/* ------------------------------------------------------------------ */

const CONTENT_W_MM = PAGE.widthMm - PAGE.marginMm * 2;
const CONTENT_H_MM = PAGE.heightMm - PAGE.marginMm * 2;
const PAGE_ASPECT = PAGE.widthMm / PAGE.heightMm;

/** image_text 的图片列宽度（与 magazineRender 的 1.06fr / .94fr + 9mm gutter 对应） */
export const IMAGE_TEXT_COLUMN_MM = ((CONTENT_W_MM - 9) * 1.06) / 2;

/** 版心高度（页高 - 上下页边距），image_text 图片列的最大高度 */
export const CONTENT_HEIGHT_MM = CONTENT_H_MM;

/**
 * 文图分栏里图片框的高度。
 *
 * 不固定成整版高度：那样窄长的图片列（比例 0.375）会把 2:3 的竖图裁掉一半，
 * 或者被迫 contain 出一堆空白。改成「按图片自身比例撑开、最高不超过版心」——
 * 竖图得到一块端庄的竖向图版，方图/横图得到一条横向图版，都不裁不空。
 */
export function imageTextFigureHeightMm(
  photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined,
): number {
  const aspect = photoAspect(photo);
  return Math.min(CONTENT_H_MM, IMAGE_TEXT_COLUMN_MM / aspect);
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
      return PAGE.widthMm / 2 / PAGE.heightMm;
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
 *  1. 可见比例 ≥ MIN_VISIBLE_FRACTION → `cover`（满幅裁切，视觉最有力）；
 *  2. 否则 → `contain`（完整保留画面，两侧/上下留白）。
 *
 * 这条规则替代了「无脑 cover」，是「不产生异常裁图」的技术保证。
 */
export function figureFit(
  kind: MagazinePageKind,
  index: number,
  photo: Pick<BlockPhoto, 'width' | 'height'> | null | undefined,
  lead: 'portrait' | 'landscape' = 'portrait',
): FigureFit {
  const aspect = photoAspect(photo);
  // 文图分栏的图片框高度是按图片比例算出来的，因此槽位比例就是图片比例本身
  const slot =
    kind === 'image_text' ? aspect : figureSlotAspect(kind, index, lead);
  const visible = coverVisibleFraction(aspect, slot);
  return {
    strategy: visible >= MIN_VISIBLE_FRACTION ? 'cover' : 'contain',
    visible,
    aspect,
  };
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
