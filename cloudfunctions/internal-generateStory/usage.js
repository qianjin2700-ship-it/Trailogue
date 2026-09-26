"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyUsage = getDailyUsage;
exports.bumpDailyUsage = bumpDailyUsage;
// usage.ts — 云函数共享模块：daily_usage 每日用量记录（简化版，非完整 usage_ledger）
// 文档 _id = `${openid}_${bjDayKey}`，天然按用户+业务日唯一
// 记录始终写入（供后台观察用量）；限制只在 app_config.generationLimitEnabled=true 时才生效
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
const common_1 = require("./common");
const EMPTY_USAGE = {
    attemptCount: 0,
    successCount: 0,
    uniquePhotoCount: 0,
    regenerationCount: 0,
    photoIds: [],
};
async function getDailyUsage(openid) {
    const db = wx_server_sdk_1.default.database();
    const id = `${openid}_${(0, common_1.bjDayKey)()}`;
    try {
        const res = await db.collection('daily_usage').doc(id).get();
        const d = (res.data || {});
        return {
            attemptCount: Number(d.attemptCount) || 0,
            successCount: Number(d.successCount) || 0,
            uniquePhotoCount: Number(d.uniquePhotoCount) || 0,
            regenerationCount: Number(d.regenerationCount) || 0,
            photoIds: Array.isArray(d.photoIds) ? d.photoIds.map(String) : [],
        };
    }
    catch (err) {
        // doc.get 对不存在文档抛异常 → 当日还没有用量记录
        return { ...EMPTY_USAGE };
    }
}
/**
 * 读改写更新当日用量（fail-open：失败仅 warn，不阻塞业务）。
 * 并发一致性由 concurrentGenerationLimit=1（同用户同时只允许 1 个生成任务）兜底。
 */
async function bumpDailyUsage(openid, patch) {
    const db = wx_server_sdk_1.default.database();
    const id = `${openid}_${(0, common_1.bjDayKey)()}`;
    try {
        const current = await getDailyUsage(openid);
        const mergedIds = Array.from(new Set([
            ...current.photoIds,
            ...(patch.addPhotoIds || []).map(String),
        ]));
        const next = {
            _openid: openid,
            businessDate: (0, common_1.bjDayKey)(),
            attemptCount: Math.max(0, current.attemptCount + (patch.attemptDelta || 0)),
            successCount: Math.max(0, current.successCount + (patch.successDelta || 0)),
            regenerationCount: Math.max(0, current.regenerationCount + (patch.regenDelta || 0)),
            photoIds: mergedIds,
            uniquePhotoCount: mergedIds.length,
            updatedAt: new Date().toISOString(),
        };
        // doc(id).set：不存在则创建，存在则整体替换
        await db.collection('daily_usage').doc(id).set({ data: next });
    }
    catch (err) {
        console.warn('[daily_usage] bump failed (ignored)', err);
    }
}
