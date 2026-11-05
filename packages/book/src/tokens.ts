/**
 * Trailogue 2.0 设计令牌。
 *
 * 取值全部来自 1.0 代码里的高频色值（#24211D / #7D5C3C / #F7F4EE / #D8CDBE …），
 * 保证 2.0 与现有 App 视觉同源，不是重新设计品牌。
 * 这里的值会被 Story / Magazine 两个渲染器直接写进 CSS。
 *
 * 约束：本包（packages/book）不得 import React / React Native /
 * 任何平台 API，这样才能同时服务 WebView 预览、expo-print PDF、
 * Node 端分享页与单元测试。
 */
export interface ThemeTokens {
  /** 页面底色 */
  readonly paper: string;
  /** 预览背板 / 次级底色 */
  readonly paperAlt: string;
  /** 主文字 */
  readonly ink: string;
  /** 正文文字（略浅于 ink） */
  readonly inkSoft: string;
  /** 次要信息 */
  readonly muted: string;
  /** 强调色（分隔线标题、页码、强调条） */
  readonly accent: string;
  /** 强调色的浅色底 */
  readonly accentWash: string;
  /** 分隔线 */
  readonly rule: string;
  /** 深色底（Magazine 封面） */
  readonly cover: string;
  /** 标题字体栈 */
  readonly display: string;
  /** 正文字体栈 */
  readonly body: string;
}

export const STORY_TOKENS: ThemeTokens = {
  paper: '#f7f4ee',
  paperAlt: '#eae3d8',
  ink: '#24211d',
  inkSoft: '#39342e',
  muted: '#6f655a',
  accent: '#8b6d50',
  accentWash: '#efe3d1',
  rule: '#d8cdbe',
  cover: '#14283b',
  display: 'Georgia, "Songti SC", "Hiragino Mincho ProN", serif',
  body: 'Georgia, "Songti SC", "Hiragino Mincho ProN", serif',
};

export const MAGAZINE_TOKENS: ThemeTokens = {
  paper: '#f3eee6',
  paperAlt: '#eae3d8',
  ink: '#17262c',
  inkSoft: '#2c3a40',
  muted: '#6f675e',
  accent: '#d7643d',
  accentWash: '#f6e7dd',
  rule: '#d5cabb',
  cover: '#14283b',
  display: '"Iowan Old Style", "Songti SC", Georgia, serif',
  body: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif',
};

/**
 * 版式刻度（单位：mm，印刷侧）与阅读刻度（单位：px，屏幕侧）。
 * 分开定义是因为 PDF 用毫米、WebView 用像素，混用会得到不可预期的结果。
 *
 * **Letter 已冻结**：2.0 第一阶段不增加 A4，改动属破坏性变更。
 */
export const PAGE = {
  /** Letter：与 1.0 已导出的 PDF 保持一致 */
  widthMm: 215.9,
  heightMm: 279.4,
  marginMm: 16,
  gutterMm: 6,
  /** WebView 预览宽度（96dpi 下 215.9mm ≈ 816px，留 44px 余量） */
  previewWidthPx: 860,
} as const;

/** 1mm 对应的 PostScript 点（1pt = 1/72 inch） */
export const MM_TO_PT = 72 / 25.4;

export const STORY_METRICS = {
  /** 正文 16.5px / 1.75：与 1.0 收口后的阅读排版一致 */
  bodySizePx: 16.5,
  bodyLineHeight: 1.75,
  /** 屏幕阅读最佳行长 */
  measurePx: 700,
  paragraphGapPx: 18,
  sectionGapPx: 40,
} as const;

/**
 * Magazine 文字档位。`textWidthMm` 是正文可用宽度，
 * 与 magazineRender 的 CSS 栅格一一对应（改一处必须同时改另一处）。
 */
export const MAGAZINE_TYPE = {
  bodySizePt: 10.5,
  /** hero 页文字压在满幅图上，宽度限制更窄 */
  heroTextWidthMm: 130,
  /** image_text 页文字列：内容宽 183.9mm × .84/2（含 9mm gutter） */
  imageTextWidthMm: (PAGE.widthMm - PAGE.marginMm * 2 - 9) * (0.84 / 2),
  /** hero 正文行数上限：超出的正文分页到后续文字页，不裁字 */
  heroCapacityLines: 9,
  /** image_text 正文行数上限 */
  imageTextCapacityLines: 18,
  /** 引语页字号与行数上限（超出则整页不出现，避免压字） */
  quoteSizePt: 26,
  quoteCapacityLines: 10,
  /** 尾页正文（铭文）字号，比内文略大以示收束 */
  closingSizePt: 11,
  closingTextWidthMm: 165,
  closingCapacityLines: 14,
} as const;
