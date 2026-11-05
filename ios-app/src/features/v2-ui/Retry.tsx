import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { RETRY_POLICY } from './retryPolicy';
import { V2_COLORS, V2_SPACING, V2_TYPE } from './theme';

export interface RetryProps {
  /** 重试动作。允许返回 Promise，组件据此显示 busy 态 */
  onRetry: () => void | Promise<void>;
  /** 已经自动尝试过的次数（0 表示还没试过） */
  attempt?: number;
  /** 自动重试上限，默认 3 次 */
  maxAttempts?: number;
  retryLabel?: string;
  retryingLabel?: string;
  /** 自动重试次数用尽后的提示文案 */
  exhaustedLabel?: string;
  /** 外部正在跑请求（父组件已经知道 busy） */
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  /** 是否显示「第 n / m 次」计数。默认只在 attempt > 0 时显示 */
  showAttempts?: boolean;
  testID?: string;
}

/**
 * 重试控件（可单独使用，也被 ErrorState 复用）。
 *
 * 行为固定为：
 *  1. 点击后立刻 busy（按钮禁用 + 文案变 Retrying…），避免连点；
 *  2. `onRetry` 返回的 Promise resolve / reject 后自动解除 busy；
 *  3. `attempt` 用尽时**不禁用**按钮，而是换一句更诚实的文案
 *     （"Still not working"）—— 自动重试是有限度的，但用户想再试一次是他的权利；
 *  4. 组件不发请求、不读全局状态，只是一个被控外观。
 */
export function Retry({
  onRetry,
  attempt = 0,
  maxAttempts = RETRY_POLICY.maxAttempts,
  retryLabel = 'Try again',
  retryingLabel = 'Retrying…',
  exhaustedLabel = 'Still not working',
  busy = false,
  variant = 'secondary',
  showAttempts,
  testID = 'v2-retry',
}: RetryProps) {
  const [pending, setPending] = useState(false);
  const running = pending || busy;
  const exhausted = attempt >= maxAttempts;
  const displayAttempts = showAttempts ?? attempt > 0;

  const handlePress = useCallback(() => {
    if (running) return;
    setPending(true);
    // 同步回调也走一次微任务，保证 busy 至少渲染一帧，避免「点了没反应」的错觉
    void Promise.resolve()
      .then(() => onRetry())
      .catch(() => undefined)
      .finally(() => setPending(false));
  }, [onRetry, running]);

  return (
    <View style={styles.container}>
      <Button
        testID={testID}
        label={running ? retryingLabel : exhausted ? exhaustedLabel : retryLabel}
        loading={running}
        loadingLabel={retryingLabel}
        variant={variant}
        onPress={handlePress}
        accessibilityHint="Attempts to load this content again"
      />
      {displayAttempts && !running ? (
        <Text style={styles.meta} testID={`${testID}-meta`}>
          {exhausted
            ? `Tried ${Math.min(attempt, maxAttempts)} of ${maxAttempts} times automatically`
            : `Attempt ${attempt + 1} of ${maxAttempts}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: V2_SPACING.xs },
  meta: { ...V2_TYPE.meta, color: V2_COLORS.muted, textAlign: 'center' },
});
