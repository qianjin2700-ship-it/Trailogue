import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Retry } from './Retry';
import { V2_COLORS, V2_RADIUS, V2_SPACING, V2_TYPE } from './theme';

export interface ErrorStateProps {
  /** 一句话说清「哪里失败了」，不要直接抛技术栈 */
  title?: string;
  /** 面向用户的原因说明（可为空） */
  message?: string;
  /**
   * 重试回调。
   * 传了才会出现按钮 —— 没有可重试的动作时不要放一个假按钮。
   */
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  retryingLabel?: string;
  /** 已经自动重试过的次数（用于显示 "Attempt 2 of 3"） */
  attempt?: number;
  /** 自动重试上限 */
  maxAttempts?: number;
  /** 外部已经知道正在重试（例如父组件在跑请求） */
  retrying?: boolean;
  /** 次要出口，例如「返回书架」 */
  secondaryAction?: { label: string; onPress: () => void };
  testID?: string;
}

/**
 * V2 错误态 + 明确的重试行为。
 *
 * 背景：Phase A 的 Book Preview 加载失败时只有一行红字，
 * 用户不知道发生了什么、也不知道能不能再试一次 —— 只能退出重进。
 *
 * 这里把「重试」做成一等公民，行为固定为：
 *  1. 点击后立刻进入 `busy` 态（按钮禁用 + 文案变 "Retrying…"），避免连点；
 *  2. `onRetry` 允许返回 Promise，resolve / reject 后自动解除 busy；
 *  3. 重试失败由调用方决定是否保留当前错误文案（组件不吞错误）；
 *  4. 没传 `onRetry` 时**不渲染按钮**，不给用户一个点了没反应的按钮。
 *
 * 组件本身不发请求、不读全局状态，因此可以被任何屏幕复用，
 * 也可以在测试里直接断言「点一次只触发一次」。
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  retryingLabel = 'Retrying…',
  attempt = 0,
  maxAttempts,
  retrying = false,
  secondaryAction,
  testID = 'v2-error-state',
}: ErrorStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        {onRetry ? (
          <Retry
            testID={`${testID}-retry`}
            onRetry={onRetry}
            attempt={attempt}
            maxAttempts={maxAttempts}
            retryLabel={retryLabel}
            retryingLabel={retryingLabel}
            busy={retrying}
            variant="primary"
            showAttempts={attempt > 0}
          />
        ) : null}
        {secondaryAction ? (
          <Button
            testID={`${testID}-secondary`}
            label={secondaryAction.label}
            variant="ghost"
            onPress={secondaryAction.onPress}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: V2_COLORS.dangerWash,
    borderColor: V2_COLORS.rule,
    borderRadius: V2_RADIUS.lg,
    borderWidth: 1,
    gap: V2_SPACING.sm,
    paddingHorizontal: V2_SPACING.xl,
    paddingVertical: V2_SPACING.xxl,
  },
  title: { ...V2_TYPE.section, color: V2_COLORS.danger, textAlign: 'center' },
  message: { ...V2_TYPE.body, color: V2_COLORS.inkSoft, textAlign: 'center' },
  actions: {
    alignItems: 'center',
    gap: V2_SPACING.sm,
    marginTop: V2_SPACING.md,
    width: '100%',
  },
});
