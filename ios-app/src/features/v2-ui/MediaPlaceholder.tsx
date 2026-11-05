import { StyleSheet, Text, View } from 'react-native';

import { V2_COLORS, V2_RADIUS, V2_SPACING, V2_TYPE } from './theme';

export interface MediaPlaceholderProps {
  /** 宽高比（宽 / 高）。缺省 3:2，与照片缺失时的默认比例一致 */
  aspectRatio?: number;
  label?: string;
  /** 说明这是占位而不是内容（加载失败 / 还未上传） */
  caption?: string;
  /** 圆角，与相邻真实图片保持一致，避免加载完成后跳动 */
  rounded?: 'sm' | 'md' | 'lg';
  testID?: string;
}

/**
 * 媒体占位块。
 *
 * 用途：照片还在上传 / 加载失败 / 被删除时，**占住位置**而不是塌陷，
 * 避免列表在加载过程中反复跳动（1.0 里最明显的观感问题之一）。
 *
 * 只画虚线框与一句说明，不做图标动画 —— 2.0 不引入新的动画依赖。
 */
export function MediaPlaceholder({
  aspectRatio = 1.5,
  label = 'Photo',
  caption,
  rounded = 'md',
  testID = 'v2-media-placeholder',
}: MediaPlaceholderProps) {
  return (
    <View
      testID={testID}
      style={[styles.container, { aspectRatio, borderRadius: V2_RADIUS[rounded] }]}
      accessibilityRole="image"
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
    >
      <Text style={styles.label}>{label}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: V2_COLORS.paperAlt,
    borderColor: V2_COLORS.rule,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: V2_SPACING.xs,
    justifyContent: 'center',
    paddingHorizontal: V2_SPACING.lg,
    width: '100%',
  },
  label: { ...V2_TYPE.label, color: V2_COLORS.muted },
  caption: { ...V2_TYPE.meta, color: V2_COLORS.muted, textAlign: 'center' },
});
