// cloudfunctions/internal-processMeta/index.ts — EXIF 解析 + 逆地址解析（内部函数）
// 设计见 docs/07-metadata-degradation.md（三级降级）：
//   一级 EXIF：exifr 解析原图 DateTimeOriginal/GPS/Orientation
//   二级降级：EXIF 时间缺失时用上传时的本地文件时间（client_hint，file_meta，conf 0.5）
//   逆解析：geo_cache（4 位小数键）→ 腾讯位置服务 WebService（TENCENT_LBS_KEY 缺省时只存坐标）
import cloud from 'wx-server-sdk';
import https from 'https';
import exifr from 'exifr';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

interface CallEvent {
  job_id: string;
}

interface Batch {
  batch_no: number;
  photo_ids: string[];
  status: string;
  attempts: number;
}

exports.main = async (event: CallEvent) => {
  const db = cloud.database();
  const jobId = event.job_id;
  if (!jobId) return { code: 40001, message: '缺少 job_id' };

  // ⚠️ doc.get 对不存在的文档会抛异常（而非返回空 data），必须捕获否则整个函数崩
  let job: Record<string, unknown> | null = null;
  try {
    const res = await db.collection('ai_jobs').doc(jobId).get();
    job = res.data as Record<string, unknown>;
  } catch (err) {
    job = null;
  }
  if (!job) return { code: 40401, message: '任务不存在' };

  // 归属校验：openid 经函数间调用透传，客户端直调伪造他人 job_id 会被拒绝
  const callerOpenid = cloud.getWXContext().OPENID;
  if (!callerOpenid || callerOpenid !== job._openid) {
    return { code: 40301, message: '无权执行该任务' };
  }

  // 防重入：已完成的任务直接跳过（重复触发幂等）
  if (job.status === 'succeeded') {
    return { code: 0, data: { status: 'succeeded', skipped: true } };
  }

  // 防重入：运行中且 90 秒内有心跳 → 已有实例在跑，跳过（心跳过期的僵尸运行可接管）
  if (job.status === 'running') {
    const heartbeatMs = Date.now() - new Date(String(job.updated_at || job.created_at)).getTime();
    if (heartbeatMs < 90 * 1000) {
      return { code: 0, data: { status: 'running', skipped: true } };
    }
  }

  await db.collection('ai_jobs').doc(jobId).update({
    data: { status: 'running', updated_at: nowIso() },
  });

  try {
    // 循环处理直至没有待处理批次：
    // photo.requestMetaProcess 可能在任务运行期间追加新批次（用户又上传了照片），
    // 每批处理完重读任务文档才能看到增量；failed 批次在 attempts<3 时自动重试。
    for (let guard = 0; guard < 100; guard += 1) {
      const { data: fresh } = await db.collection('ai_jobs').doc(jobId).get();
      const batches = ((fresh.batches || []) as Batch[]);
      const pending = batches.find(
        (b) => b.status === 'pending' || (b.status === 'failed' && (b.attempts || 0) < 3)
      );
      if (!pending) break;

      const photoIds = pending.photo_ids as string[];
      const failedIds: string[] = [];
      for (const photoId of photoIds) {
        try {
          await processPhotoExif(db, photoId);
        } catch (err) {
          // 单张失败不中断整批，记录后批次标记 failed 供重试
          failedIds.push(photoId);
          console.error('processPhotoExif failed', photoId, err);
        }
      }

      const batchOk = failedIds.length === 0;
      // 重读后局部更新当前批次再整体写回，避免覆盖期间并发追加的批次
      const { data: reread } = await db.collection('ai_jobs').doc(jobId).get();
      const merged = ((reread.batches || []) as Batch[]).map((b) =>
        b.batch_no === pending.batch_no
          ? {
              ...b,
              status: batchOk ? 'succeeded' : 'failed',
              attempts: (b.attempts || 0) + 1,
              failed_photo_ids: failedIds,
              updated_at: nowIso(),
            }
          : b
      );
      const done = merged.filter((b) => b.status === 'succeeded').length;

      await db.collection('ai_jobs').doc(jobId).update({
        data: {
          batches: merged,
          progress: merged.length > 0 ? done / merged.length : 1,
          updated_at: nowIso(),
        },
      });
    }

    await db.collection('ai_jobs').doc(jobId).update({
      data: { status: 'succeeded', progress: 1, updated_at: nowIso() },
    });

    // 衔接视觉理解链路（vision 现由 internal-generateStory 兜底执行，此调用保持链路完整）
    await cloud.callFunction({
      name: 'internal-processVision',
      data: { album_id: job.album_id, meta_job_id: jobId },
    }).catch(() => undefined);

    return { code: 0, data: { status: 'succeeded' } };
  } catch (err) {
    await db.collection('ai_jobs').doc(jobId).update({
      data: { status: 'failed', error: String(err), updated_at: nowIso() },
    });
    return { code: 50001, message: 'EXIF 解析失败' };
  }
};

/* ============================================================
 * 单张照片处理：EXIF 解析 → 二级降级 → 逆地理解析 → 回写
 * ============================================================ */

async function processPhotoExif(
  db: ReturnType<typeof cloud.database>,
  photoId: string
): Promise<void> {
  const { data: photo } = await db.collection('photos').doc(photoId).get();
  if (!photo || photo.deleted) return;

  // 优先级保护（设计 2.1：user > exif > file_meta > unknown）：
  // 用户已确认的照片不做任何覆盖
  if (photo.user_confirmed) return;

  // 幂等跳过：时间与地点均已有可靠值（exif/user 来源）时不重复下载原图
  const timeSource = String(photo.taken_at_source || 'unknown');
  const hasReliableTime =
    !!photo.taken_at && (timeSource === 'exif' || timeSource === 'user');
  const loc = (photo.location || null) as Record<string, unknown> | null;
  const hasReliablePlace = !!loc && !!(loc.city || loc.district || loc.poi || loc.lat);
  if (hasReliableTime && hasReliablePlace) return;

  const updates: Record<string, unknown> = {};

  // 1. 下载原图（EXIF 在原图里；缩略图压缩时已丢弃）
  let buffer: Buffer | null = null;
  try {
    const dl = await cloud.downloadFile({ fileID: photo.file_id as string });
    buffer = dl.fileContent as Buffer;
  } catch (err) {
    console.error('downloadFile failed', photoId, err);
  }

  // 2. exifr 解析（文件损坏/无 EXIF 时 tags 为 null，走二级降级）
  let tags: Record<string, unknown> | null = null;
  if (buffer) {
    try {
      tags = (await exifr.parse(buffer, {
        tiff: true,
        exif: true,
        gps: true,
      })) as Record<string, unknown> | null;
    } catch (err) {
      tags = null;
    }
  }

  // 3. 拍摄时间
  const canWriteTime =
    !photo.taken_at || timeSource === 'unknown' || timeSource === 'file_meta';
  if (canWriteTime) {
    const dt = pickExifDate(tags);
    if (dt) {
      updates.taken_at = dt.iso;
      updates.taken_at_source = 'exif';
      updates.taken_at_confidence = dt.confidence;
    } else if (!photo.taken_at && photo.client_hint_taken_at) {
      // 二级降级：上传时携带的本地文件修改时间（真实 UTC 时刻，带 Z 存储）
      const hint = normalizeIsoUtc(photo.client_hint_taken_at);
      if (hint) {
        updates.taken_at = hint;
        updates.taken_at_source = 'file_meta';
        updates.taken_at_confidence = 0.5;
      }
    }
  }

  // 4. GPS + 逆地理解析（location 为 null 初始化的嵌套字段，必须 db.command.set 整体替换）
  const gps = pickGps(tags);
  const canWriteLocation = !loc || !(loc.city || loc.district || loc.poi || loc.lat);
  if (gps && canWriteLocation) {
    const place = await resolvePlace(db, gps.lat, gps.lng);
    updates.location = db.command.set({
      lat: gps.lat,
      lng: gps.lng,
      city: (place && place.city) || null,
      district: (place && place.district) || null,
      poi: (place && place.poi) || null,
      confidence: place ? 1.0 : 0.7, // 无 key/逆解析失败时只有坐标
    });
  }

  // 5. 方向（前端显示校正用）
  if (tags && typeof tags.Orientation === 'number') {
    updates.orientation = tags.Orientation;
  }

  // 6. 无任何 EXIF 成果时至少记录解析状态（便于区分「未处理」与「无 EXIF」）
  if (Object.keys(updates).length === 0) {
    updates.taken_at_source = timeSource === 'unknown' ? 'unknown' : timeSource;
  }

  if (Object.keys(updates).length > 0) {
    await db.collection('photos').doc(photoId).update({
      data: { ...updates, updated_at: nowIso() },
    });
  }
}

/* ============================================================
 * EXIF 值提取与校验（纯函数）
 * ============================================================ */

/** 从 EXIF tags 中取拍摄时间：DateTimeOriginal(1.0) > CreateDate(0.9) > ModifyDate(0.9) */
function pickExifDate(tags: Record<string, unknown> | null): { iso: string; confidence: number } | null {
  if (!tags) return null;
  const candidates: Array<[string, number]> = [
    ['DateTimeOriginal', 1.0],
    ['CreateDate', 0.9],
    ['ModifyDate', 0.9],
  ];
  for (const [key, confidence] of candidates) {
    const iso = dateToLiteral(tags[key]);
    if (iso) return { iso, confidence };
  }
  return null;
}

/**
 * exifr 解析出的日期还原为「字面时间」"YYYY-MM-DDTHH:mm:00"（无时区标记，视为当地时间）。
 * exifr 以运行容器时区解释 EXIF 字面时间，这里用 timezoneOffset 修正回字面，
 * 使云函数（UTC 容器）与本地测试（+8）结果一致；与用户手动输入的格式完全对齐。
 */
function dateToLiteral(v: unknown): string | null {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return null;
  const t = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
  const year = t.getUTCFullYear();
  // 合理性校验（设计 2.3）：不早于 1970，不晚于当前年份 +1
  const nowYear = new Date().getUTCFullYear();
  if (year < 1970 || year > nowYear + 1) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${year}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:00`;
}

/** client_hint 时间合法性：必须是可解析的 ISO 字符串且年份合理 */
function normalizeIsoUtc(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const nowYear = new Date().getUTCFullYear();
  if (year < 1970 || year > nowYear + 1) return null;
  return d.toISOString();
}

/** GPS 校验：剔除缺失、(0,0)、越界值；不做境内限制（出境旅行照片同样有效） */
function pickGps(tags: Record<string, unknown> | null): { lat: number; lng: number } | null {
  if (!tags) return null;
  const lat = tags.latitude;
  const lng = tags.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
}

/* ============================================================
 * 逆地理解析：geo_cache（4 位小数键，约 11m 精度）→ 腾讯位置服务
 * ============================================================ */

interface Place {
  city: string | null;
  district: string | null;
  poi: string | null;
}

async function resolvePlace(
  db: ReturnType<typeof cloud.database>,
  lat: number,
  lng: number
): Promise<Place | null> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

  // 1. 缓存命中直接返回
  try {
    const { data: cached } = await db.collection('geo_cache')
      .where({ cache_key: cacheKey })
      .limit(1)
      .get();
    if (cached.length > 0) {
      const c = cached[0] as Record<string, unknown>;
      return {
        city: (c.city as string) || null,
        district: (c.district as string) || null,
        poi: (c.poi as string) || null,
      };
    }
  } catch (err) {
    // 缓存查询失败不阻断，继续走在线解析
  }

  // 2. 无 key：降级只存坐标
  const key = process.env.TENCENT_LBS_KEY;
  if (!key) return null;

  // 3. 腾讯位置服务逆解析（失败重试 1 次，设计 5 异常兜底）
  let parsed: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    try {
      const res = await httpGetJson(
        `https://apis.map.qq.com/ws/geocoder/v1/?location=${lat},${lng}&key=${key}`
      );
      if (res && res.status === 0 && res.result) parsed = res.result as Record<string, unknown>;
    } catch (err) {
      // 重试
    }
  }
  if (!parsed) return null;

  const ac = (parsed.address_component || {}) as Record<string, unknown>;
  const fa = (parsed.formatted_addresses || {}) as Record<string, unknown>;
  const place: Place = {
    // 直辖市的 city 字段可能为空，回退到 province
    city: (ac.city as string) || (ac.province as string) || null,
    district: (ac.district as string) || null,
    poi: (fa.recommend as string) || (fa.rough as string) || null,
  };

  // 4. 写缓存（失败不写脏数据、不阻断）
  try {
    await db.collection('geo_cache').add({
      data: {
        cache_key: cacheKey,
        lat,
        lng,
        ...place,
        created_at: nowIso(),
      },
    });
  } catch (err) {
    // 忽略缓存写入失败
  }

  return place;
}

function httpGetJson(url: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LBS_TIMEOUT'));
    });
    req.on('error', (err: Error) => reject(err));
  });
}

function nowIso(): string {
  return new Date().toISOString();
}
