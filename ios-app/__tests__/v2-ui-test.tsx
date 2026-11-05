import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MediaPlaceholder,
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
