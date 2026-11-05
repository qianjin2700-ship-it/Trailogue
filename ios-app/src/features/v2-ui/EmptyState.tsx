import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { Button } from './Button';
import { V2_COLORS, V2_SPACING, V2_TYPE } from './theme';

export interface EmptyStateProps {
  title: string;
  message?: string;
  /** 主行动，例如「添加第一段旅行」 */
  action?: { label: string; onPress: () => void };
  /** 可选的图形/图标插槽（不引入图标库，由调用方传） */
  icon?: ReactNode;
  testID?: string;
}

/**
 * 空态。
 *
 * 产品倾向：**不给新用户塞示例内容**。
 * 空态只说清楚「现在没有」和「可以做什么」，不预置演示数据 —— 
 * 预置内容会让用户分不清哪些是自己的。
 */
export function EmptyState({ title, message, action, icon, testID = 'v2-empty-state' }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <Button
            testID={`${testID}-action`}
            label={action.label}
            variant="secondary"
            onPress={action.onPress}
          />
        </View>
      ) : null}
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
  icon: { marginBottom: V2_SPACING.sm, opacity: 0.9 },
  title: { ...V2_TYPE.section, color: V2_COLORS.ink, textAlign: 'center' },
  message: { ...V2_TYPE.body, color: V2_COLORS.muted, textAlign: 'center' },
  action: { marginTop: V2_SPACING.md },
});
