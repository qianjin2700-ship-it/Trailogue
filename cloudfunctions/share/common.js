"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.loadAppConfig = loadAppConfig;
exports.writeEvent = writeEvent;
exports.bjDayKey = bjDayKey;
// common.ts — 云函数共享模块：app_config 集中配置 + 核心行为事件写入
// 设计原则（docs/13-launch-gap-analysis.md）：
// - fail-open：读配置/写事件失败一律吞错走默认值，绝不阻塞业务主链路
// - 事件中禁止存 OpenID 明文/原图 fileID/完整 GPS/手机号/故事正文，user 用 users._id 引用
// - 普通行为事件保留 90 天（expire_at 字段，清理方式见 docs/14 运维手册）
const wx_server_sdk_1 = __importDefault(require("wx-server-sdk"));
/** 内置默认值（与 app_config 集合 global 文档一致；读不到配置时兜底） */
exports.DEFAULT_CONFIG = {
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
const CONFIG_CACHE_MS = 60 * 1000;
let configCache = null;
/** 读取 app_config 集合 global 文档（60s 内存缓存；失败回退内置默认值） */
async function loadAppConfig() {
    if (configCache && Date.now() - configCache.at < CONFIG_CACHE_MS) {
        return configCache.value;
    }
    try {
        const db = wx_server_sdk_1.default.database();
        const res = await db.collection('app_config').doc('global').get();
        const doc = (res.data || {});
        delete doc._id;
        const merged = { ...exports.DEFAULT_CONFIG, ...doc };
        configCache = { at: Date.now(), value: merged };
        return merged;
    }
    catch (err) {
        console.warn('[app_config] load failed, fallback to defaults', err);
        return { ...exports.DEFAULT_CONFIG };
    }
}
/* ============================================================
 * 核心行为事件（本轮 9 个：app_open / user_created / album_create /
 * upload_completed / generation_started / generation_succeeded /
 * generation_failed / album_saved / album_shared）
 * ============================================================ */
const EVENT_RETENTION_DAYS = 90;
/** users._id 缓存（云函数实例复用期间避免重复查询） */
let userCache = null;
async function resolveUserId(openid) {
    if (userCache && userCache.openid === openid)
        return userCache.userId;
    const { data } = await wx_server_sdk_1.default.database().collection('users')
        .where({ _openid: openid }).limit(1).get();
    const userId = data.length > 0 ? String(data[0]._id) : 'unknown';
    userCache = { openid, userId };
    return userId;
}
/** props 白名单清洗：只保留短的标量值，剔除对象/数组/长文本 */
function sanitizeProps(props) {
    const out = {};
    for (const [k, v] of Object.entries(props)) {
        if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
            out[k] = v;
        }
        else if (typeof v === 'string' && v.length <= 64) {
            out[k] = v;
        }
        // 对象/数组/长文本一律丢弃（禁止原始图片/GPS/正文等进入事件）
    }
    return out;
}
/**
 * 写一条行为事件。全量 try/catch：埋点失败只打 warn，不影响业务返回。
 * @param albumId / jobId 提为一级字段便于后台查询
 */
async function writeEvent(openid, eventType, props = {}) {
    try {
        const userId = await resolveUserId(openid);
        const now = new Date();
        await wx_server_sdk_1.default.database().collection('events').add({
            data: {
                event_type: eventType,
                user_id: userId, // 引用 users._id，事件文档中不存 OpenID 明文
                album_id: props.album_id || null,
                job_id: props.job_id || null,
                props: sanitizeProps(props),
                created_at: now.toISOString(),
                expire_at: new Date(now.getTime() + EVENT_RETENTION_DAYS * 86400000).toISOString(),
            },
        });
    }
    catch (err) {
        console.warn(`[events] write ${eventType} failed (ignored)`, err);
    }
}
/* ============================================================
 * 时间工具
 * ============================================================ */
/** 北京时间（UTC+8）业务日 key：YYYY-MM-DD。云函数容器是 UTC，禁止直接用本地日期 */
function bjDayKey(date = new Date()) {
    return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
