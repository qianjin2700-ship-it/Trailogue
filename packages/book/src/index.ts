/**
 * @trailogue/book — Trailogue 2.0 共享排版引擎。
 *
 * 纯 TypeScript：不依赖 React / React Native / DOM / 网络 / 平台 API，
 * 因此下面五个消费者读的是**同一份模型、同一套编排、同一个渲染器**：
 *
 * | 消费者                        | 用法                                        |
 * | ----------------------------- | ------------------------------------------- |
 * | iOS Story preview (WebView)   | `renderStoryHtml(buildStoryDocument(src), {preview:true})` |
 * | iOS Magazine preview (WebView)| `renderMagazineHtml(buildMagazineDocument(src), {preview:true})` |
 * | expo-print PDF                | 同上，`preview:false`                       |
 * | Railway 服务端 Story 分享页    | 同上（Node 端直接 import 本包 dist）        |
 * | Railway 服务端 Magazine 分享页 | 同上                                        |
 *
 * 关键不变量：
 *  - **确定性**：同一份 `DocumentSource` 永远产出逐字节相同的 HTML；
 *  - **不裁字**：Magazine 固定页高，正文超过单页容量时按句子分页，不靠 CSS 硬裁；
 *  - **不异常裁图**：图片槽位与照片比例差异过大时改用 contain 留白（见 `figureFit`）；
 *  - **无孤立尾图**：照片按 1/2/3 分组，余数为 1 时先切一张独立大图（见 `splitPhotoRun`）。
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
} from './types.js';

export {
  MAGAZINE_TOKENS,
  MAGAZINE_TYPE,
  MM_TO_PT,
  PAGE,
  STORY_METRICS,
  STORY_TOKENS,
  type ThemeTokens,
} from './tokens.js';

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
} from './source.js';

export {
  chunkPhotos,
  classifyAspect,
  coverVisibleFraction,
  DEFAULT_ASPECT,
  EXTREME_ASPECT,
  figureFit,
  figureSlotAspect,
  IMAGE_TEXT_COLUMN_MM,
  IMAGE_TEXT_MIN_HEIGHT_RATIO,
  imageTextFigureHeightMm,
  imageTextSlotAspect,
  MIN_FULL_BLEED_VISIBLE,
  MIN_VISIBLE_FRACTION,
  minVisibleFor,
  photoAspect,
  pageSlotAspects,
  pickLead,
  planPlates,
  stackedRowWeights,
  resolvePhotos,
  splitPhotoRun,
  twoSpreadOrientation,
  type FigureFit,
  type FigureFitStrategy,
} from './layoutEngine.js';

export {
  charWidthEm,
  charsPerLine,
  estimateLineCount,
  isCjkChar,
  magazineTextCapacity,
  splitTextIntoPages,
  widthMmToLineEm,
  type MagazineTextZone,
  type TextCapacity,
} from './textFit.js';

export {
  chapterWeight,
  DIVIDER_RULES,
  planChapterDividers,
  type ChapterDividerContext,
  type ChapterDividerInput,
  type ChapterDividerPlan,
  type DividerSkipReason,
} from './chapterDivider.js';

export { contentSummary, formatDateLabel, formatDateRange } from './format.js';

export { buildStoryDocument, figureLayout, type StoryBuildOptions } from './storyDocument.js';
export { renderStoryHtml, type StoryRenderOptions } from './storyRender.js';

export {
  buildMagazineDocument,
  planMagazine,
  plateKind,
  type MagazineBuildOptions,
  type MagazinePlan,
} from './magazineDocument.js';
export { renderMagazineHtml, type MagazineRenderOptions } from './magazineRender.js';

export {
  FEATURE_CATALOG,
  FREE_ENTITLEMENTS,
  isEntitled,
  magazineLayoutTier,
  PDF_RESOLUTION,
  pdfResolution,
  PRO_FEATURES,
  type Entitlements,
  type FeatureCatalogEntry,
  type PlanTier,
  type ProFeature,
} from './entitlements.js';

export {
  createCompactMockSource,
  createMockPhotos,
  createMockSource,
  placeholderPhoto,
} from './mock.js';
