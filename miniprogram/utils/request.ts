/**
 * utils/request.ts
 * 云函数调用统一封装
 */
import { ApiEnvelope, ErrorCode } from '../types/index';

/**
 * 调用云函数的统一方法
 * @param name 云函数名
 * @param action 操作名（云函数内路由）
 * @param data 入参
 * @returns 解包后的 data（出错时抛出 Error）
 */
export async function callFunction<T = unknown>(
  name: string,
  action: string,
  data?: Record<string, unknown>
): Promise<T> {
  try {
    const res = await wx.cloud.callFunction({
      name,
      data: { action, ...data },
    });
    const envelope = res.result as ApiEnvelope<T> | null | undefined;
    if (!envelope || typeof envelope.code !== 'number') {
      // 云函数崩溃/未按信封格式返回时 res.result 可能为空
      throw new CloudFunctionError(ErrorCode.INTERNAL_ERROR, '服务返回异常，请重试');
    }
    if (envelope.code !== ErrorCode.OK) {
      throw new CloudFunctionError(envelope.code, envelope.message || '未知错误');
    }
    return envelope.data as T;
  } catch (err) {
    if (err instanceof CloudFunctionError) throw err;
    // 网络错误
    throw new CloudFunctionError(ErrorCode.INTERNAL_ERROR, `网络请求失败: ${err}`);
  }
}

/** 云函数错误 */
export class CloudFunctionError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'CloudFunctionError';
  }
}

/**
 * 从 catch 到的错误中提取「用户能看懂的话」。
 * 服务端返回的具体原因（如「至少需要5张照片才能生成故事」）就在 err.message 里，
 * 页面提示必须用它，而不是硬编码一句「xx失败」把原因吞掉。
 * @param err catch 到的错误
 * @param fallback 完全无法提取时的兜底文案
 */
export function errText(err: unknown, fallback = '操作失败，请重试'): string {
  if (err instanceof CloudFunctionError && err.message) return err.message;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}

/** 错误码 → 用户可读提示 */
export function errorMessage(code: ErrorCode): string {
  const map: Record<number, string> = {
    [ErrorCode.PARAM_INVALID]: '参数有误，请检查输入',
    [ErrorCode.UNAUTHORIZED]: '请先登录',
    [ErrorCode.FORBIDDEN]: '无权操作此资源',
    [ErrorCode.NOT_FOUND]: '资源不存在',
    [ErrorCode.STATUS_CONFLICT]: '当前状态不支持此操作',
    [ErrorCode.PHOTO_LIMIT_50]: '已达 50 张照片上限',
    [ErrorCode.PHOTO_NOT_READY]: '存在未处理完成或失败的照片',
    [ErrorCode.FILE_INVALID]: '文件校验失败（格式/大小/损坏）',
    [ErrorCode.RATE_LIMITED]: '操作过于频繁，请稍后再试',
    [ErrorCode.INTERNAL_ERROR]: '服务开小差了，请重试',
    [ErrorCode.THIRD_PARTY_ERROR]: '第三方服务暂时不可用',
    [ErrorCode.TASK_TIMEOUT]: '任务超时，请重试',
  };
  return map[code] || '未知错误';
}
