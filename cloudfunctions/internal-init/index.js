"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// cloudfunctions/internal-init/index.ts — 一次性数据库初始化
// 用途：创建业务集合 + 种子 app_config 配置文档（幂等，已存在则跳过）
// 使用：部署后在「云开发控制台 → 云函数 → internal-init → 云端测试」调用一次
// 注意：索引与权限规则仍需在控制台配置（见 docs/12-deploy-manual.md、docs/14-ops-manual.md）
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
wx_server_sdk_1.default.init({ env: wx_server_sdk_1.default.DYNAMIC_CURRENT_ENV });
const COLLECTIONS = [
    'users',
    'albums',
    'photos',
    'photo_groups',
    'album_stories',
    'ai_jobs',
    'share_links',
    'geo_cache',
    // 2026-08-29 上线前最小改造新增（docs/13-launch-gap-analysis.md）
    'app_config', // 集中配置（global 文档）
    'daily_usage', // 每日用量（_id = openid_业务日）
    'events', // 核心行为事件（保留 90 天，见 expire_at）
];
/** app_config 种子配置（与各云函数 common.ts DEFAULT_CONFIG 保持一致） */
const APP_CONFIG_SEED = {
    minPhotosPerAlbum: 5,
    maxPhotosPerAlbum: 50,
    dailyGenerationAttemptLimit: 5,
    dailySuccessfulAlbumLimit: 2,
    dailyPhotoProcessingLimit: 100,
    concurrentGenerationLimit: 1,
    freeRegenerationLimitPerAlbum: 2,
    generationLimitEnabled: false,
    freeGenerationLimit: -1,
    adsEnabled: false,
    paymentEnabled: false,
};
exports.main = async () => {
    const db = wx_server_sdk_1.default.database();
    const created = [];
    const existed = [];
    const failed = [];
    for (const name of COLLECTIONS) {
        try {
            await db.createCollection(name);
            created.push(name);
            console.log(`collection [${name}] created`);
        }
        catch (err) {
            const e = err;
            const msg = String(e.message || e);
            // -501001 / DATABASE_COLLECTION_EXISTS / ResourceExist: 集合已存在（错误格式随 SDK 版本变化，宽匹配）
            if (e.code === -501001 ||
                /exists/i.test(msg) ||
                /已存在/.test(msg) ||
                /table exist/i.test(msg) ||
                /resourceexist/i.test(msg)) {
                existed.push(name);
            }
            else {
                failed.push({ name, error: msg });
                console.warn(`collection [${name}] create failed:`, msg);
            }
        }
    }
    // 种子 app_config/global（已存在则跳过，避免覆盖线上手工调整）
    let configSeeded = false;
    try {
        await db.collection('app_config').doc('global').get();
        console.log('app_config/global already exists, skip seeding');
    }
    catch (err) {
        try {
            await db.collection('app_config').doc('global').set({
                data: { ...APP_CONFIG_SEED, updated_at: new Date().toISOString() },
            });
            configSeeded = true;
            console.log('app_config/global seeded');
        }
        catch (e) {
            console.warn('app_config seed failed:', e);
            failed.push({ name: 'app_config/global', error: String(e) });
        }
    }
    const result = {
        code: failed.length > 0 ? 1 : 0,
        data: {
            created,
            existed,
            failed,
            configSeeded,
            total: COLLECTIONS.length,
        },
    };
    console.log('init result', JSON.stringify(result));
    return result;
};
