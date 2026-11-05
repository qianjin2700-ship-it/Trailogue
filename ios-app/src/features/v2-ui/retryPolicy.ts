/**
 * V2 重试策略（纯函数，不含 React）。
 *
 * 背景：Phase A 的 Book Preview 加载失败只有一行红字，用户既不知道
 * 「是不是再试一次就好」，也不知道「这个错误值不值得等」。
 * 这里把「要不要重试、等多久」变成可测试的规则，UI 只负责呈现。
 *
 * 三条原则：
 *  1. **4xx 不重试**：请求本身有问题，重试一百次也是同样的结果；
 *     `auth` 需要重新登录，也不该原地打转。
 *  2. **退避是确定的**：600ms → 1200ms → 2400ms，不掺随机抖动。
 *     客户端只有一个用户在等，抖动只会让「多久能好」变得不可预测。
 *  3. **有上限**：默认 3 次。超过之后交给用户手动点，
 *     而不是无限重试把电量耗光。
 */

export type FailureKind = 'offline' | 'timeout' | 'server' | 'client' | 'auth' | 'unknown';

export interface RetryPolicy {
  /** 总尝试次数（含首次请求） */
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
}

export const RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 600,
  factor: 2,
  maxDelayMs: 4000,
};

/** 只有「网络抖一下可能就好」的失败才自动重试 */
export function isRetryable(kind: FailureKind): boolean {
  return kind === 'offline' || kind === 'timeout' || kind === 'server' || kind === 'unknown';
}

/** HTTP 状态码 → 失败类型（null/0 视为网络错误） */
export function failureKindFromStatus(status?: number | null): FailureKind {
  if (status === null || status === undefined || status === 0) return 'offline';
  if (status === 408) return 'timeout';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  return 'unknown';
}

/**
 * 第 `attempt` 次失败之后要等多久再重试（attempt 从 1 开始）。
 * 超过 `maxAttempts` 时返回 0 —— 调用方据此停止自动重试。
 */
export function retryDelayMs(attempt: number, policy: RetryPolicy = RETRY_POLICY): number {
  if (!Number.isFinite(attempt) || attempt < 1) return policy.baseDelayMs;
  if (attempt >= policy.maxAttempts) return 0;
  const raw = policy.baseDelayMs * policy.factor ** (attempt - 1);
  return Math.min(Math.round(raw), policy.maxDelayMs);
}

/** 还能不能自动再试一次 */
export function canRetry(attempt: number, policy: RetryPolicy = RETRY_POLICY): boolean {
  return attempt < policy.maxAttempts;
}
