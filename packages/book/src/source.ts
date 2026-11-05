import type { BlockPhoto } from './types.js';

/**
 * 渲染器的输入归一化层。
 *
 * Story / Magazine 用同一个 `DocumentSource`，保证两种形态读的是同一份内容、
 * 同一批照片、同一套语言判断 —— 这是「所见即所得」的基础（不会出现
 * Story 里有这张图、Magazine 里没有的情况）。
 */

export interface SourceChapter {
  chapterId: string;
  title: string;
  dateLabel?: string;
  locationLabel?: string;
  narrative: string;
  photoIds: string[];
  captions: Record<string, string>;
}

export interface DocumentSource {
  language: string;
  title: string;
  subtitle?: string;
  preface?: string;
  epilogue?: string;
  chapters: SourceChapter[];
  photos: BlockPhoto[];
  coverPhotoId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** 章节数 + 照片数 + 正文字符数，供两种形态显示一致的内容量信息 */
  stats: { chapterCount: number; photoCount: number; textLength: number };
}

export interface CreateSourceInput {
  language?: string | null;
  title: string;
  subtitle?: string | null;
  preface?: string | null;
  epilogue?: string | null;
  chapters: {
    chapterId: string;
    title: string;
    dateLabel?: string | null;
    locationLabel?: string | null;
    narrative: string;
    photoIds: string[];
    captions?: Record<string, string> | null;
  }[];
  photos: BlockPhoto[];
  coverPhotoId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export function createDocumentSource(input: CreateSourceInput): DocumentSource {
  const photos = dedupePhotos(input.photos);
  const available = new Set(photos.map((photo) => photo.id));
  const chapters: SourceChapter[] = input.chapters.map((chapter) => ({
    chapterId: chapter.chapterId,
    title: chapter.title.trim(),
    dateLabel: trimmed(chapter.dateLabel),
    locationLabel: trimmed(chapter.locationLabel),
    narrative: chapter.narrative.trim(),
    // 只保留真实存在的照片：照片被删后，故事文本仍然可读
    photoIds: chapter.photoIds.filter((id) => available.has(id)),
    captions: chapter.captions ?? {},
  }));
  const referenced = new Set(chapters.flatMap((chapter) => chapter.photoIds));
  const coverPhotoId =
    (input.coverPhotoId && available.has(input.coverPhotoId) ? input.coverPhotoId : null) ??
    chapters.flatMap((chapter) => chapter.photoIds)[0] ??
    photos[0]?.id ??
    null;
  const textLength =
    chapters.reduce((total, chapter) => total + chapter.narrative.length, 0) +
    (trimmed(input.preface)?.length ?? 0) +
    (trimmed(input.epilogue)?.length ?? 0);
  return {
    language: normalizeLanguage(input.language),
    title: input.title.trim() || 'Trailogue',
    subtitle: trimmed(input.subtitle),
    preface: trimmed(input.preface),
    epilogue: trimmed(input.epilogue),
    chapters,
    photos,
    coverPhotoId,
    startDate: trimmed(input.startDate) ?? null,
    endDate: trimmed(input.endDate) ?? null,
    stats: {
      chapterCount: chapters.length,
      photoCount: referenced.size || photos.length,
      textLength,
    },
  };
}

/**
 * 1.0 数据的结构性描述。
 *
 * 这里**故意**不 import `StoryContentDTO` / `Photo`：
 *  - 2.0 的渲染层要能脱离 iOS 客户端复用（服务端分享页 / worker）；
 *  - 结构类型（structural typing）下，1.0 的 DTO 天然可赋值进来，无需适配代码；
 *  - 避免 v2 与 1.0 类型纠缠，1.0 将来改字段时 v2 不会被连带绑死。
 */
export interface StoryLike {
  title: string;
  subtitle?: string | null;
  preface?: string | null;
  epilogue?: string | null;
  chapters: {
    chapterId: string;
    title: string;
    dateLabel?: string | null;
    locationLabel?: string | null;
    narrative: string;
    photoIds: string[];
    captions?: Record<string, string> | null;
  }[];
  meta: {
    actualLanguage?: string | null;
    languageMode?: string | null;
  };
}

export interface PhotoLike {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
}

/** 1.0 数据 → 2.0 文档源（StoryContentDTO / Photo[] 可直接传入） */
export function sourceFromStory(
  story: StoryLike,
  photos: PhotoLike[],
  options: { coverPhotoId?: string | null; startDate?: string | null; endDate?: string | null } = {},
): DocumentSource {
  return createDocumentSource({
    language: story.meta.actualLanguage ?? story.meta.languageMode ?? 'en',
    title: story.title,
    subtitle: story.subtitle,
    preface: story.preface,
    epilogue: story.epilogue,
    chapters: story.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      title: chapter.title,
      dateLabel: chapter.dateLabel,
      locationLabel: chapter.locationLabel,
      narrative: chapter.narrative,
      photoIds: chapter.photoIds,
      captions: chapter.captions,
    })),
    photos: photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption ?? undefined,
      width: photo.width,
      height: photo.height,
    })),
    coverPhotoId: options.coverPhotoId ?? null,
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
  });
}

export function photoIndex(source: DocumentSource): Map<string, BlockPhoto> {
  return new Map(source.photos.map((photo) => [photo.id, photo]));
}

/** 章节元信息：「10 月 3 日 · 深圳湾」，两者都空则不输出 */
export function chapterEyebrow(chapter: SourceChapter): string | undefined {
  const parts = [chapter.dateLabel, chapter.locationLabel].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length ? parts.join(' · ') : undefined;
}

/** 照片说明：优先章节内 caption，其次照片自带 caption */
export function captionFor(chapter: SourceChapter | undefined, photo: BlockPhoto): string | undefined {
  const fromChapter = chapter?.captions[photo.id]?.trim();
  if (fromChapter) return fromChapter;
  const own = photo.caption?.trim();
  return own || undefined;
}

function dedupePhotos(photos: BlockPhoto[]): BlockPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    if (!photo.id || seen.has(photo.id)) return false;
    seen.add(photo.id);
    return true;
  });
}

function trimmed(value: string | null | undefined): string | undefined {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeLanguage(value: string | null | undefined): string {
  const next = value?.trim();
  return next ? next : 'en';
}
