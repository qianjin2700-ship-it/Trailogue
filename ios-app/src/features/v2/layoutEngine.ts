import type { BlockPhoto, PhotoAspectClass } from './types';

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
 * 把连续的 N 张照片切成每页/每块的照片数。
 *
 * 规则（避免出现「孤零零一张图」的尴尬页）：
 *   1 → [1]、2 → [2]、3 → [3]
 *   4 → [1,3]、5 → [2,3]、6 → [3,3]、7 → [1,3,3]
 *   余数为 1 时先切一张独立大图，其余按 3 张一组。
 */
export function splitPhotoRun(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 3) return [count];
  const sizes: number[] = [];
  let rest = count;
  if (rest % 3 === 1) {
    sizes.push(1);
    rest -= 1;
  }
  while (rest > 0) {
    const take = Math.min(3, rest);
    sizes.push(take);
    rest -= take;
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
