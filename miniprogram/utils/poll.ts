/**
 * utils/poll.ts
 * 任务轮询（指数退避）
 */
import { callFunction } from './request';
import { JobStatusResponse } from '../types';

interface PollOptions {
  /** 初始间隔（ms），默认 2000 */
  initialInterval?: number;
  /** 最大间隔（ms），默认 10000 */
  maxInterval?: number;
  /** 最大轮询时长（ms），默认 180000（3分钟） */
  timeout?: number;
  /** 每次回调 */
  onUpdate?: (status: JobStatusResponse) => void;
}

/**
 * 轮询任务状态直到 succeeded/failed/cancelled
 * 返回的 Promise 上挂有 cancel() 方法，页面 onUnload 时可停止轮询
 */
export function pollJobStatus(
  jobId: string,
  options: PollOptions = {}
): PollHandle {
  const {
    initialInterval = 2000,
    maxInterval = 10000,
    timeout = 180000,
    onUpdate,
  } = options;

  let cancelFn: () => void = () => undefined;

  const promise = new Promise<JobStatusResponse>((resolve, reject) => {
    let interval = initialInterval;
    let elapsed = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let consecutiveErrors = 0;

    const stop = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    cancelFn = () => {
      cancelled = true;
      stop();
    };

    const tick = async () => {
      if (cancelled) return;
      try {
        const status = await callFunction<JobStatusResponse>('story', 'getJobStatus', {
          job_id: jobId,
        });
        consecutiveErrors = 0;

        if (cancelled) return;
        if (onUpdate) onUpdate(status);

        if (status.status === 'succeeded') {
          stop();
          resolve(status);
          return;
        }
        if (status.status === 'failed' || status.status === 'cancelled') {
          stop();
          resolve(status); // 调用方判断 status 处理
          return;
        }

        elapsed += interval;
        if (elapsed >= timeout) {
          stop();
          reject(new Error('轮询超时'));
          return;
        }

        // 指数退避
        interval = Math.min(interval * 1.5, maxInterval);
        timer = setTimeout(tick, interval);
      } catch (err) {
        // 容忍瞬时网络抖动：连续失败 3 次才判死
        consecutiveErrors += 1;
        if (cancelled) return;
        if (consecutiveErrors >= 3) {
          stop();
          reject(err);
          return;
        }
        timer = setTimeout(tick, Math.min(interval * 2, maxInterval));
      }
    };

    timer = setTimeout(tick, interval);
  });

  const handle = promise as PollHandle;
  handle.cancel = cancelFn;
  return handle;
}

/** pollJobStatus 返回值：Promise + cancel 方法 */
export interface PollHandle extends Promise<JobStatusResponse> {
  cancel: () => void;
}
