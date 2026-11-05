import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  Button,
  canRetry,
  EmptyState,
  ErrorState,
  failureKindFromStatus,
  isRetryable,
  LoadingState,
  MediaPlaceholder,
  RETRY_POLICY,
  Retry,
  retryDelayMs,
  SectionHeader,
} from '@/features/v2-ui';

/**
 * V2 UI 基础组件（Phase B0）。
 *
 * 重点不是「渲染出来了」，而是**状态机是否可靠**：
 *  - 错误态的重试按钮：点一次触发一次，重试期间禁用，没有回调时不渲染；
 *  - 禁用按钮不能被触发（避免重复提交）；
 *  - 空态 / 占位块只承担展示，不偷偷发请求。
 */

describe('ErrorState 重试行为', () => {
  it('展示标题与原因说明', () => {
    render(<ErrorState title="Could not load this book" message="Check your connection and try again." />);
    expect(screen.getByText('Could not load this book')).toBeTruthy();
    expect(screen.getByText('Check your connection and try again.')).toBeTruthy();
  });

  it('没有 onRetry 时不渲染重试按钮（不给用户假按钮）', () => {
    render(<ErrorState title="Failed" />);
    expect(screen.queryByTestId('v2-error-state-retry')).toBeNull();
  });

  it('点一次只触发一次重试', async () => {
    const onRetry = jest.fn().mockResolvedValue(undefined);
    render(<ErrorState title="Failed" onRetry={onRetry} />);

    fireEvent.press(screen.getByTestId('v2-error-state-retry'));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByTestId('v2-error-state-retry'));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(2));
  });

  it('重试进行中按钮进入 busy 且不可再次触发', async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    render(<ErrorState title="Failed" onRetry={onRetry} />);

    fireEvent.press(screen.getByTestId('v2-error-state-retry'));
    await waitFor(() => expect(screen.getByText('Retrying…')).toBeTruthy());

    fireEvent.press(screen.getByTestId('v2-error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRetry?.();
    });
    await waitFor(() => expect(screen.queryByText('Retrying…')).toBeNull());
  });

  it('重试失败不会把错误吞掉（组件保持挂载，回调可再次触发）', async () => {
    const onRetry = jest.fn().mockRejectedValue(new Error('still offline'));
    render(<ErrorState title="Failed" onRetry={onRetry} />);

    fireEvent.press(screen.getByTestId('v2-error-state-retry'));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Retrying…')).toBeNull());
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('可以同时给出次要出口', () => {
    const onBack = jest.fn();
    render(<ErrorState title="Failed" onRetry={jest.fn()} secondaryAction={{ label: 'Back to books', onPress: onBack }} />);
    fireEvent.press(screen.getByTestId('v2-error-state-secondary'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('Button', () => {
  it('禁用态不触发回调', () => {
    const onPress = jest.fn();
    render(<Button label="Export" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Export'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('加载态显示替代文案并阻止点击', () => {
    const onPress = jest.fn();
    render(<Button label="Export" loading loadingLabel="Exporting…" onPress={onPress} />);
    expect(screen.getByText('Exporting…')).toBeTruthy();
    fireEvent.press(screen.getByText('Exporting…'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('可用时正常触发', () => {
    const onPress = jest.fn();
    render(<Button label="Share" onPress={onPress} />);
    fireEvent.press(screen.getByText('Share'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState / LoadingState / SectionHeader / MediaPlaceholder', () => {
  it('空态可以带一个行动入口', () => {
    const onPress = jest.fn();
    render(<EmptyState title="No trips yet" message="Start with one trip." action={{ label: 'New trip', onPress }} />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    fireEvent.press(screen.getByText('New trip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('加载态给出进度语义与说明', () => {
    render(<LoadingState label="Loading your books…" hint="This takes a few seconds." />);
    expect(screen.getByText('Loading your books…')).toBeTruthy();
    expect(screen.getByText('This takes a few seconds.')).toBeTruthy();
  });

  it('区块标题渲染标题、副标题与右侧操作', () => {
    render(<SectionHeader title="Chapters" subtitle="4 chapters" action={<Button label="Edit" size="sm" />} />);
    expect(screen.getByText('Chapters')).toBeTruthy();
    expect(screen.getByText('4 chapters')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
  });

  it('媒体占位块带可读的无障碍标签', () => {
    render(<MediaPlaceholder label="Photo" caption="Still uploading" />);
    expect(screen.getByLabelText('Photo. Still uploading')).toBeTruthy();
  });
});

describe('Retry 组件', () => {
  it('点击后进入 busy、resolve 之后恢复', async () => {
    let resolveRetry: (() => void) | undefined;
    const onRetry = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve;
        }),
    );
    render(<Retry onRetry={onRetry} testID="retry" />);

    fireEvent.press(screen.getByTestId('retry'));
    await waitFor(() => expect(screen.getByText('Retrying…')).toBeTruthy());
    // busy 期间再点不触发
    fireEvent.press(screen.getByTestId('retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRetry?.();
    });
    await waitFor(() => expect(screen.queryByText('Retrying…')).toBeNull());
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('自动重试次数用尽后换文案，但仍然允许手动重试', async () => {
    const onRetry = jest.fn();
    render(<Retry onRetry={onRetry} attempt={3} maxAttempts={3} testID="retry" />);
    expect(screen.getByText('Still not working')).toBeTruthy();
    expect(screen.getByText('Tried 3 of 3 times automatically')).toBeTruthy();

    fireEvent.press(screen.getByTestId('retry'));
    // 点击 → 微任务 → 回调，断言要走 waitFor
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it('外部 busy 时不触发回调', () => {
    const onRetry = jest.fn();
    render(<Retry onRetry={onRetry} busy testID="retry" />);
    fireEvent.press(screen.getByTestId('retry'));
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('重试策略（纯函数）', () => {
  it('4xx 与鉴权失败不自动重试', () => {
    expect(isRetryable(failureKindFromStatus(500))).toBe(true);
    expect(isRetryable(failureKindFromStatus(408))).toBe(true);
    expect(isRetryable(failureKindFromStatus(0))).toBe(true);
    expect(isRetryable(failureKindFromStatus(404))).toBe(false);
    expect(isRetryable(failureKindFromStatus(401))).toBe(false);
    expect(failureKindFromStatus(503)).toBe('server');
    expect(failureKindFromStatus(422)).toBe('client');
    expect(failureKindFromStatus(401)).toBe('auth');
  });

  it('退避是确定的倍数增长，且到上限后返回 0', () => {
    expect(retryDelayMs(1)).toBe(600);
    expect(retryDelayMs(2)).toBe(1200);
    // 第 3 次已到 maxAttempts → 不再安排自动重试
    expect(retryDelayMs(3)).toBe(0);
    expect(retryDelayMs(2, { ...RETRY_POLICY, maxAttempts: 5 })).toBe(1200);
    expect(retryDelayMs(9, { ...RETRY_POLICY, maxAttempts: 12 })).toBe(RETRY_POLICY.maxDelayMs);
  });

  it('canRetry 与 maxAttempts 一致', () => {
    expect(canRetry(0)).toBe(true);
    expect(canRetry(2)).toBe(true);
    expect(canRetry(3)).toBe(false);
  });
});

describe('V2 UI 新增属性', () => {
  it('Button 支持 fullWidth', () => {
    render(<Button label="Delete trip" fullWidth onPress={jest.fn()} />);
    expect(screen.getByText('Delete trip')).toBeTruthy();
  });

  it('LoadingState 紧凑模式仍保留语义', () => {
    render(<LoadingState compact label="Loading more…" testID="compact" />);
    expect(screen.getByTestId('compact').props.accessibilityRole).toBe('progressbar');
    expect(screen.getByText('Loading more…')).toBeTruthy();
  });

  it('SectionHeader 支持 eyebrow', () => {
    render(<SectionHeader eyebrow="Trip · 2026" title="Chapters" />);
    expect(screen.getByText('Trip · 2026')).toBeTruthy();
  });

  it('ErrorState 会把尝试次数透传给 Retry', () => {
    render(<ErrorState title="Failed" onRetry={jest.fn()} attempt={2} maxAttempts={3} />);
    expect(screen.getByText('Attempt 3 of 3')).toBeTruthy();
  });
});
