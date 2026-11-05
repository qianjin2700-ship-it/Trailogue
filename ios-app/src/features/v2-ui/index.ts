/**
 * V2 UI 基础组件（Phase B0）。
 *
 * 这一层只做「屏幕上的通用状态」，不含任何业务逻辑，
 * 也**不接入 `app/**` 正式路由** —— 2.0 的页面在 Phase C 才开始搬。
 *
 * 与 1.0 的关系：
 *  - 不 import 也不修改 1.0 的任何组件；
 *  - 颜色 / 间距取值沿用 1.0 现有页面（见 `theme.ts`），保证视觉同源；
 *  - 只用 React Native 核心组件，不引入新的动画 / 图标依赖。
 */

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { ErrorState, type ErrorStateProps } from './ErrorState';
export { LoadingState, type LoadingStateProps } from './LoadingState';
export { MediaPlaceholder, type MediaPlaceholderProps } from './MediaPlaceholder';
export { SectionHeader, type SectionHeaderProps } from './SectionHeader';
export { V2_COLORS, V2_RADIUS, V2_SPACING, V2_TYPE } from './theme';
