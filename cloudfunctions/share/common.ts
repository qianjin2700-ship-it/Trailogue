// common.ts — 云函数共享模块：app_config 集中配置 + 核心行为事件写入
// 设计原则（docs/13-launch-gap-analysis.md）：
// - fail-open：读配置/写事件失败一律吞错走默认值，绝不阻塞业务主链路
// - 事件中禁止存 OpenID 明文/原图 fileID/完整 GPS/手机号/故事正文，user 用 users._id 引用
// - 普通行为事件保留 90 天（expire_at 字段，清理方式见 docs/14 运维手册）
import cloud from 'wx-server-sdk';

/* ============================================================
 * app_config 集中配置
 * ============================================================ */

export interface AppConfig {
  minPhotosPerAlbum: number;
  maxPhotosPerAlbum: number;
  dailyGenerationAttemptLimit: number;
  dailySuccessfulAlbumLimit: number;
  dailyPhotoProcessingLimit: number;
  concurrentGenerationLimit: number;
  freeRegenerationLimitPerAlbum: number;
  generationLimitEnabled: boolean;
  freeGenerationLimit: number; // 商业化预留，本轮恒 -1（不限）
  adsEnabled: boolean;         // 商业化预留，本轮恒 false
  paymentEnabled: boolean;     // 商业化预留，本轮恒 false
}

/** 内置默认值（与 app_config 集合 global 文档一致；读不到配置时兜底） */
export const DEFAULT_CONFIG: AppConfig = {
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
let configCache: { at: number; value: AppConfig } | null = null;

/** 读取 app_config 集合 global 文档（60s 内存缓存；失败回退内置默认值） */
export async function loadAppConfig(): Promise<AppConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_CACHE_MS) {
    return configCache.value;
  }
  try {
    const db = cloud.database();
    const res = await db.collection('app_config').doc('global').get();
    const doc = (res.data || {}) as Partial<AppConfig> & { _id?: string };
    delete doc._id;
    const merged: AppConfig = { ...DEFAULT_CONFIG, ...doc };
    configCache = { at: Date.now(), value: merged };
    return merged;
  } catch (err) {
    console.warn('[app_config] load failed, fallback to defaults', err);
    return { ...DEFAULT_CONFIG };
  }
}

/* ============================================================
 * 核心行为事件（本轮 9 个：app_open / user_created / album_create /
 * upload_completed / generation_started / generation_succeeded /
 * generation_failed / album_saved / album_shared）
 * ============================================================ */

const EVENT_RETENTION_DAYS = 90;

/** users._id 缓存（云函数实例复用期间避免重复查询） */
let userCache: { openid: string; userId: string } | null = null;

async function resolveUserId(openid: string): Promise<string> {
  if (userCache && userCache.openid === openid) return userCache.userId;
  const { data } = await cloud.database().collection('users')
    .where({ _openid: openid }).limit(1).get();
  const userId = data.length > 0 ? String(data[0]._id) : 'unknown';
  userCache = { openid, userId };
  return userId;
}

/** props 白名单清洗：只保留短的标量值，剔除对象/数组/长文本 */
function sanitizeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) {
      out[k] = v;
    } else if (typeof v === 'string' && v.length <= 64) {
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
export async function writeEvent(
  openid: string,
  eventType: string,
  props: {
    album_id?: string;
    job_id?: string;
    [key: string]: unknown;
  } = {}
): Promise<void> {
  try {
    const userId = await resolveUserId(openid);
    const now = new Date();
    await cloud.database().collection('events').add({
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
  } catch (err) {
    console.warn(`[events] write ${eventType} failed (ignored)`, err);
  }
}

/* ============================================================
 * 时间工具
 * ============================================================ */

/** 北京时间（UTC+8）业务日 key：YYYY-MM-DD。云函数容器是 UTC，禁止直接用本地日期 */
export function bjDayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
