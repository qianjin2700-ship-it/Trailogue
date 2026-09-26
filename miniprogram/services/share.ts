/**
 * services/share.ts
 * 分享创建/撤销/查看
 */
import { callFunction } from '../utils/request';
import { CreateShareParams, CreateShareResult, GetSharedStoryResult, GetShareQrCodeResult } from '../types';

/** 创建分享 */
export function createShare(params: CreateShareParams): Promise<CreateShareResult> {
  return callFunction<CreateShareResult>('share', 'createShare', params as unknown as Record<string, unknown>);
}

/** 撤销分享 */
export function revokeShare(shareId: string): Promise<{ ok: boolean }> {
  return callFunction('share', 'revokeShare', { share_id: shareId });
}

/** 获取分享故事（游客可调） */
export function getSharedStory(token: string): Promise<GetSharedStoryResult> {
  return callFunction<GetSharedStoryResult>('share', 'getSharedStory', { token });
}

/** 获取分享小程序码（base64，用于海报合成） */
export function getShareQrCode(token: string): Promise<GetShareQrCodeResult> {
  return callFunction<GetShareQrCodeResult>('share', 'getShareQrCode', { token });
}
