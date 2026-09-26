// usage.ts — 云函数共享模块：daily_usage 每日用量记录（简化版，非完整 usage_ledger）
// 文档 _id = `${openid}_${bjDayKey}`，天然按用户+业务日唯一
// 记录始终写入（供后台观察用量）；限制只在 app_config.generationLimitEnabled=true 时才生效
import cloud from 'wx-server-sdk';
import { bjDayKey } from './common';

export interface DailyUsage {
  attemptCount: number;      // 当日发起生成任务次数（系统故障会回滚）
  successCount: number;      // 当日成功生成相册数
  uniquePhotoCount: number;  // 当日进入 AI 处理的去重照片数
  regenerationCount: number; // 当日重生成次数
  photoIds: string[];        // 当日已计入处理量的照片 id（去重计数用，失败批次重试不重复计）
}

const EMPTY_USAGE: DailyUsage = {
  attemptCount: 0,
  successCount: 0,
  uniquePhotoCount: 0,
  regenerationCount: 0,
  photoIds: [],
};

export async function getDailyUsage(openid: string): Promise<DailyUsage> {
  const db = cloud.database();
  const id = `${openid}_${bjDayKey()}`;
  try {
    const res = await db.collection('daily_usage').doc(id).get();
    const d = (res.data || {}) as Partial<DailyUsage>;
    return {
      attemptCount: Number(d.attemptCount) || 0,
      successCount: Number(d.successCount) || 0,
      uniquePhotoCount: Number(d.uniquePhotoCount) || 0,
      regenerationCount: Number(d.regenerationCount) || 0,
      photoIds: Array.isArray(d.photoIds) ? d.photoIds.map(String) : [],
    };
  } catch (err) {
    // doc.get 对不存在文档抛异常 → 当日还没有用量记录
    return { ...EMPTY_USAGE };
  }
}

export interface UsagePatch {
  attemptDelta?: number;      // 正常 +1；系统确认的服务故障回滚 -1
  successDelta?: number;
  regenDelta?: number;
  addPhotoIds?: string[];     // 去重合并进 photoIds（重试同批照片不重复计数）
}

/**
 * 读改写更新当日用量（fail-open：失败仅 warn，不阻塞业务）。
 * 并发一致性由 concurrentGenerationLimit=1（同用户同时只允许 1 个生成任务）兜底。
 */
export async function bumpDailyUsage(openid: string, patch: UsagePatch): Promise<void> {
  const db = cloud.database();
  const id = `${openid}_${bjDayKey()}`;
  try {
    const current = await getDailyUsage(openid);
    const mergedIds = Array.from(new Set([
      ...current.photoIds,
      ...(patch.addPhotoIds || []).map(String),
    ]));
    const next: DailyUsage & { _openid: string; businessDate: string; updatedAt: string } = {
      _openid: openid,
      businessDate: bjDayKey(),
      attemptCount: Math.max(0, current.attemptCount + (patch.attemptDelta || 0)),
      successCount: Math.max(0, current.successCount + (patch.successDelta || 0)),
      regenerationCount: Math.max(0, current.regenerationCount + (patch.regenDelta || 0)),
      photoIds: mergedIds,
      uniquePhotoCount: mergedIds.length,
      updatedAt: new Date().toISOString(),
    };
    // doc(id).set：不存在则创建，存在则整体替换
    await db.collection('daily_usage').doc(id).set({ data: next });
  } catch (err) {
    console.warn('[daily_usage] bump failed (ignored)', err);
  }
}
