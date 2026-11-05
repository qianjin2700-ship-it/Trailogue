/**
 * Trailogue 2.0 组件系统（Story / Magazine）。
 *
 * 使用方式：
 *
 * ```ts
 * const source = sourceFromStory(story.content, photos, { coverPhotoId, startDate, endDate });
 * const storyHtml = renderStoryHtml(buildStoryDocument(source), { preview: true });
 * const magazineHtml = renderMagazineHtml(buildMagazineDocument(source), { preview: true });
 * ```
 *
 * 同一份 `source` 同时喂给两种形态，保证「所见即所得」：
 * App 里看到的、分享出去打开的、导出 PDF 的，是同一套排版。
 *
 * 本模块是纯函数集合，不依赖 React / React Native / 网络，
 * 因此可以在 App、Node 测试、未来的服务端分享页三处复用。
 */

export type {
  BlockPhoto,
  MagazineDocument,
  MagazinePage,
  MagazinePageKind,
  MagazineTripInfo,
  PhotoAspectClass,
  StoryBlock,
  StoryClosingBlock,
  StoryDocument,
  StoryFigureBlock,
  StoryFigureLayout,
  StoryHeaderBlock,
  StoryParagraphBlock,
  StoryQuoteBlock,
  StorySectionBlock,
} from './types';

export { MAGAZINE_TOKENS, PAGE, STORY_METRICS, STORY_TOKENS, type ThemeTokens } from './tokens';

export {
  chapterEyebrow,
  createDocumentSource,
  photoIndex,
  sourceFromStory,
  type CreateSourceInput,
  type DocumentSource,
  type PhotoLike,
  type SourceChapter,
  type StoryLike,
} from './source';

export {
  chunkPhotos,
  classifyAspect,
  coverVisibleFraction,
  DEFAULT_ASPECT,
  photoAspect,
  pickLead,
  resolvePhotos,
  splitPhotoRun,
} from './layoutEngine';

export { contentSummary, formatDateLabel, formatDateRange } from './format';

export { buildStoryDocument, figureLayout, type StoryBuildOptions } from './storyDocument';
export { renderStoryHtml, type StoryRenderOptions } from './storyRender';

export {
  buildMagazineDocument,
  plateKind,
  type MagazineBuildOptions,
} from './magazineDocument';
export { renderMagazineHtml, type MagazineRenderOptions } from './magazineRender';

export { createMockPhotos, createMockSource, placeholderPhoto } from './mock';
