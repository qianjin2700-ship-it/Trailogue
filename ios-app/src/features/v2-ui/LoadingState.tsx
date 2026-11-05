import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { V2_COLORS, V2_SPACING, V2_TYPE } from './theme';

export interface LoadingStateProps {
  label?: string;
  /** 说明下一步会发生什么，减少「卡住了」的错觉 */
  hint?: string;
  /**
   * 紧凑模式：横向一行，用在列表底部「加载更多」这类位置。
   * 默认是纵向居中，用于整页加载。
   */
  compact?: boolean;
  testID?: string;
}

/** 加载态：只有一处转圈 + 一句说明，不做骨架屏（2.0 暂不引入） */
export function LoadingState({
  label = 'Loading…',
  hint,
  compact = false,
  testID = 'v2-loading-state',
}: LoadingStateProps) {
  return (
    <View
      style={[styles.container, compact ? styles.compact : null]}
      testID={testID}
      accessibilityRole="progressbar"
    >
      <ActivityIndicator color={V2_COLORS.accent} size={compact ? 'small' : 'large'} />
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: V2_SPACING.sm,
    paddingHorizontal: V2_SPACING.xl,
    paddingVertical: V2_SPACING.xxl,
  },
  compact: { flexDirection: 'row', gap: V2_SPACING.sm, paddingVertical: V2_SPACING.lg },
  label: { ...V2_TYPE.body, color: V2_COLORS.ink },
  hint: { ...V2_TYPE.meta, color: V2_COLORS.muted, textAlign: 'center' },
});
