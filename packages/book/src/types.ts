/**
 * Trailogue 2.0 文档模型（共享包版本）。
 *
 * 设计目标：**AI 只产出内容，版式由程序决定**。
 * 因此这里的类型全部是「内容块」而不是「像素」——
 * 没有任何 margin / fontSize / 坐标，渲染器才负责把内容块变成具体版式。
 *
 * 这一层是纯数据（可 JSON 序列化），因此可以：
 *  - 存库（未来扩展）
 *  - 做 diff（改版前后对比）
 *  - 单元测试（不需要渲染器）
 *  - 在 iOS / Node 服务端之间原样传输
 */

/** 照片块。宽高是可选的：历史数据可能没有，缺省按 3:2 处理。 */
export interface BlockPhoto {
  id: string;
  url: string;
  caption?: string | undefined;
  width?: number | null | undefined;
  height?: number | null | undefined;
}

export type PhotoAspectClass = 'portrait' | 'square' | 'landscape' | 'wide';

/* ------------------------------------------------------------------ */
/* Story：以阅读为核心，块顺序即阅读顺序                                 */
/* ------------------------------------------------------------------ */

export interface StoryHeaderBlock {
  type: 'header';
  title: string;
  subtitle?: string | undefined;
  eyebrow?: string | undefined;
}

export interface StoryParagraphBlock {
  type: 'paragraph';
  text: string;
}

export interface StorySectionBlock {
  type: 'section';
  title: string;
  text?: string | undefined;
  /** 章节元信息，例如「10 月 3 日 · 深圳湾」 */
  eyebrow?: string | undefined;
}

export type StoryFigureLayout = 'large' | 'pair' | 'gallery';

export interface StoryFigureBlock {
  type: 'figure';
  layout: StoryFigureLayout;
  photos: BlockPhoto[];
}

export interface StoryQuoteBlock {
  type: 'quote';
  text: string;
  attribution?: string | undefined;
}

export interface StoryClosingBlock {
  type: 'closing';
  text: string;
}

export type StoryBlock =
  | StoryHeaderBlock
  | StoryParagraphBlock
  | StorySectionBlock
  | StoryFigureBlock
  | StoryQuoteBlock
  | StoryClosingBlock;

export interface StoryDocument {
  version: 1;
  language: string;
  title: string;
  blocks: StoryBlock[];
  stats: {
    chapterCount: number;
    photoCount: number;
    /** 正文字符数（不含标点压缩），用于页数预估与「短旅行更紧凑」判断 */
    textLength: number;
  };
}

/* ------------------------------------------------------------------ */
/* Magazine：以视觉成品感为核心，页序即翻页顺序                          */
/* ------------------------------------------------------------------ */

export type MagazinePageKind =
  | 'cover'
  | 'trip_info'
  | 'chapter_divider'
  | 'hero'
  | 'image_text'
  | 'two_spread'
  | 'three_collage'
  | 'full_width'
  | 'quote'
  | 'closing';

export interface MagazinePage {
  id: string;
  kind: MagazinePageKind;
  chapterId?: string | undefined;
  eyebrow?: string | undefined;
  title?: string | undefined;
  body?: string | undefined;
  photos: BlockPhoto[];
  /** 文图页的图片在左还是右 */
  align?: 'left' | 'right' | undefined;
  /** 主图是竖构图还是横构图，决定 hero 的裁切策略 */
  lead?: 'portrait' | 'landscape' | undefined;
  /**
   * 章节序号（从 1 开始），只有分隔页使用。
   * 分隔页上那个大号数字必须是**章节序号**而不是页码，
   * 否则第 2 章会因为排在第 6 页而显示「06」，与标题对不上。
   */
  ordinal?: number | undefined;
  /**
   * 正文被拆页时的续页序号（0 表示首页或不拆）。
   * 由编排器在正文超过单页容量时写入，渲染器不需要关心。
   */
  bodyPart?: number | undefined;
}

export interface MagazineTripInfo {
  dateLabel?: string | undefined;
  locationLabel?: string | undefined;
  photoCount: number;
  chapterCount: number;
}

export interface MagazineDocument {
  version: 1;
  language: string;
  title: string;
  subtitle?: string | undefined;
  trip: MagazineTripInfo;
  pages: MagazinePage[];
}
