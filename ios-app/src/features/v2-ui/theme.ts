/**
 * V2 UI 令牌（屏幕侧）。
 *
 * 取值与 1.0 现有页面保持一致（`#24211D` / `#7D5C3C` / `#F7F4EE` / `#D8CDBE` …），
 * 2.0 不是重新做一套视觉，而是把已经在用的颜色与节奏显式化。
 *
 * 注意：印刷侧的令牌在 `@trailogue/book` 的 `STORY_TOKENS` / `MAGAZINE_TOKENS` 里
 * （那套要写进 PDF/HTML），这里是 React Native 用的，两边刻意分开：
 * 屏幕与纸张的对比度、字号不能共用一份数值。
 */

export const V2_COLORS = {
  paper: '#F7F4EE',
  paperAlt: '#EAE3D8',
  surface: '#FFFFFF',
  ink: '#24211D',
  inkSoft: '#39342E',
  muted: '#655F57',
  accent: '#7D5C3C',
  accentWash: '#F1E7DA',
  rule: '#D8CDBE',
  danger: '#A33B2B',
  dangerWash: '#F7E7E3',
  onAccent: '#FFFDF9',
} as const;

export const V2_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const V2_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const V2_TYPE = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  section: { fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  body: { fontSize: 15.5, lineHeight: 24, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;
