import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { V2_COLORS, V2_SPACING, V2_TYPE } from './theme';

export interface SectionHeaderProps {
  title: string;
  /** 副标题，用于一句说明（不要写成小段落） */
  subtitle?: string;
  /** 右侧操作（一般放 ghost 按钮） */
  action?: ReactNode;
  testID?: string;
}

/** 区块标题：标题 + 可选副标题 + 可选右侧操作，间距与 1.0 页面一致 */
export function SectionHeader({ title, subtitle, action, testID }: SectionHeaderProps) {
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.text}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: V2_SPACING.md,
    justifyContent: 'space-between',
    paddingVertical: V2_SPACING.md,
  },
  text: { flexShrink: 1, gap: 2 },
  title: { ...V2_TYPE.section, color: V2_COLORS.ink },
  subtitle: { ...V2_TYPE.meta, color: V2_COLORS.muted },
  action: { flexShrink: 0 },
});
