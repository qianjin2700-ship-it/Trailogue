import type { Photo } from '@/domain/photo/photo';

export type PhotoAspectClass = 'ultrawide' | 'landscape' | 'square' | 'portrait' | 'tall';
export type PhotoFit = 'cover' | 'contain';

export interface EffectiveSize {
  width: number;
  height: number;
}

export interface PhotoPlacement {
  fit: PhotoFit;
  positionX: number;
  positionY: number;
  sourceAspect: number;
  containerAspect: number;
  visibleFraction: number;
  aspectClass: PhotoAspectClass;
  safety: 'automatic' | 'conservative' | 'manual';
  userEdited?: boolean;
}

/** Returns the display dimensions after applying the EXIF orientation transform. */
export function effectiveDimensions(
  width: number,
  height: number,
  orientation: number | null | undefined
): EffectiveSize {
  return orientation && [5, 6, 7, 8].includes(orientation)
    ? { width: height, height: width }
    : { width, height };
}

export function photoAspect(photo: Pick<Photo, 'width' | 'height'>): number {
  if (!photo.width || !photo.height || photo.width <= 0 || photo.height <= 0) return 1;
  return photo.width / photo.height;
}

export function classifyAspect(aspect: number): PhotoAspectClass {
  if (aspect >= 1.8) return 'ultrawide';
  if (aspect >= 1.2) return 'landscape';
  if (aspect >= 0.85) return 'square';
  if (aspect >= 0.6) return 'portrait';
  return 'tall';
}

/** Fraction of source image area retained by a centered cover crop. */
export function coverVisibleFraction(sourceAspect: number, containerAspect: number): number {
  if (
    !Number.isFinite(sourceAspect) ||
    !Number.isFinite(containerAspect) ||
    sourceAspect <= 0 ||
    containerAspect <= 0
  )
    return 0;
  return Math.min(sourceAspect / containerAspect, containerAspect / sourceAspect, 1);
}

export function placementFor(
  photo: Pick<Photo, 'width' | 'height'> | undefined,
  containerAspect: number,
  options: { allowExpressiveCrop?: boolean; manual?: Partial<PhotoPlacement> } = {}
): PhotoPlacement {
  const sourceAspect = photo ? photoAspect(photo) : 1;
  const aspectClass = classifyAspect(sourceAspect);
  const visibleFraction = coverVisibleFraction(sourceAspect, containerAspect);
  const unknownSubjectRisk = aspectClass === 'portrait' || aspectClass === 'tall';
  const minimumVisible = unknownSubjectRisk ? 0.95 : 0.85;
  const fit: PhotoFit =
    options.manual?.fit ??
    (visibleFraction >= minimumVisible ||
    (!unknownSubjectRisk && options.allowExpressiveCrop && visibleFraction >= 0.72)
      ? 'cover'
      : 'contain');
  return {
    fit,
    positionX: clamp(options.manual?.positionX ?? 0.5),
    positionY: clamp(options.manual?.positionY ?? 0.5),
    sourceAspect,
    containerAspect,
    visibleFraction: fit === 'contain' ? 1 : visibleFraction,
    aspectClass,
    safety: options.manual?.userEdited
      ? 'manual'
      : fit === 'contain'
        ? 'conservative'
        : 'automatic',
    userEdited: options.manual?.userEdited,
  };
}

export function isPhotoPlacement(value: unknown): value is PhotoPlacement {
  if (!value || typeof value !== 'object') return false;
  const placement = value as Partial<PhotoPlacement>;
  return (
    (placement.fit === 'cover' || placement.fit === 'contain') &&
    typeof placement.positionX === 'number' &&
    typeof placement.positionY === 'number' &&
    typeof placement.sourceAspect === 'number' &&
    typeof placement.containerAspect === 'number' &&
    typeof placement.visibleFraction === 'number' &&
    typeof placement.aspectClass === 'string'
  );
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
