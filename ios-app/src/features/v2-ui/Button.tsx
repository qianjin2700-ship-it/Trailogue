import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { V2_COLORS, V2_RADIUS, V2_SPACING, V2_TYPE } from './theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** 加载中：显示指示器、禁用交互，但仍保留原宽度避免布局跳动 */
  loading?: boolean;
  /** 加载中的替代文案，默认沿用 label */
  loadingLabel?: string;
  icon?: ReactNode;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * V2 按钮。
 *
 * 三条约束（都来自 1.0 的踩坑）：
 *  1. 点击区域 ≥ 44pt（`minHeight`），不靠 padding 猜；
 *  2. 加载中必须禁用，避免连点重复提交；
 *  3. 禁用态用颜色 + `accessibilityState` 双保险，不只靠视觉。
 *
 * 暂不接入 `app/**` 正式路由 —— Phase B0 只交付组件本身。
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const palette = PALETTES[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? (loadingLabel ?? label) : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: palette.background, borderColor: palette.border },
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.inactive : null,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.text} style={styles.spinner} />
        ) : (
          icon
        )}
        <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: palette.text }]}>
          {loading ? (loadingLabel ?? label) : label}
        </Text>
      </View>
    </Pressable>
  );
}

const PALETTES: Record<ButtonVariant, { background: string; border: string; text: string }> = {
  primary: { background: V2_COLORS.accent, border: V2_COLORS.accent, text: V2_COLORS.onAccent },
  secondary: { background: V2_COLORS.surface, border: V2_COLORS.rule, text: V2_COLORS.ink },
  ghost: { background: 'transparent', border: 'transparent', text: V2_COLORS.accent },
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: V2_RADIUS.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  md: { paddingHorizontal: V2_SPACING.xl, paddingVertical: V2_SPACING.md },
  sm: { minHeight: 36, paddingHorizontal: V2_SPACING.lg, paddingVertical: V2_SPACING.sm },
  pressed: { opacity: 0.82 },
  inactive: { opacity: 0.45 },
  row: { alignItems: 'center', flexDirection: 'row', gap: V2_SPACING.sm },
  spinner: { marginRight: 2 },
  label: { ...V2_TYPE.label, fontSize: 15 },
  labelSm: { fontSize: 13 },
});
