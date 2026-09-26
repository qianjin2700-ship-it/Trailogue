// cloudfunctions/photo/index.ts — 照片上传/元数据/排序/删除
import cloud from 'wx-server-sdk';
import { loadAppConfig, writeEvent } from './common';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const MAX_PHOTOS = 50; // 兜底常量；实际以 app_config.maxPhotosPerAlbum 为准（读不到配置时 fail-open 用此值）

interface CallEvent {
  action: string;
  client_hint?: { taken_at: string | null };
  [key: string]: unknown;
}

exports.main = async (event: CallEvent) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {
    case 'commitUpload':
      return handleCommitUpload(openid, event);
    case 'requestMetaProcess':
      return handleRequestMetaProcess(openid, event.album_id as string);
    case 'getMetaJobStatus':
      return handleGetMetaJobStatus(openid, event.job_id as string);
    case 'listPhotos':
      return handleListPhotos(openid, event.album_id as string, event.group_id as string | null);
    case 'updatePhotoMeta':
      return handleUpdateMeta(openid, event);
    case 'confirmMeta':
      return handleConfirmMeta(openid, event.album_id as string);
    case 'reorderPhotos':
      return handleReorder(openid, event.photo_ids as string[]);
    case 'deletePhoto':
      return handleDeletePhoto(openid, event.photo_id as string);
    case 'getPhotoFiles':
      return handleGetPhotoFiles(openid, event.photo_ids as string[]);
    default:
      return { code: 40001, message: `未知 action: ${action}` };
  }
};

async function handleCommitUpload(openid: string, event: CallEvent) {
  const db = cloud.database();
  const albumId = event.album_id as string;
  const config = await loadAppConfig();
  const maxPhotos = config.maxPhotosPerAlbum || MAX_PHOTOS;

  // 权限校验
  const { data: album } = await db.collection('albums').doc(albumId).get();
  if (!album || album._openid !== openid) {
    return { code: 40301, message: '无权操作该相册' };
  }

  // 数量校验
  if (album.photo_count >= maxPhotos) {
    return { code: 40902, message: `已达${maxPhotos}张照片上限` };
  }

  // 格式/大小校验
  const fileFormat = event.file_format as string;
  if (!['jpeg', 'png', 'heic'].includes(fileFormat)) {
    return { code: 40904, message: `不支持的格式: ${fileFormat}` };
  }
  const fileSize = event.file_size as number;
  if (fileSize > 20 * 1024 * 1024) {
    return { code: 40904, message: '文件超过20MB限制' };
  }

  // 重复检测
  const fileHash = event.file_hash as string;
  const { data: existing } = await db.collection('photos')
    .where({ album_id: albumId, file_hash: fileHash, deleted: false })
    .get();

  const isDuplicate = existing.length > 0;
  const duplicateOf = isDuplicate ? existing[0]._id : null;

  // 创建照片记录
  const now = new Date().toISOString();
  const photo = {
    _openid: openid,
    album_id: albumId,
    file_id: event.file_id,
    thumb_file_id: event.thumb_file_id,
    upload_status: 'uploaded',
    file_size: fileSize,
    file_format: fileFormat,
    file_hash: fileHash,
    is_duplicate: isDuplicate,
    duplicate_of: duplicateOf,
    fail_reason: null,
    taken_at: null,
    taken_at_source: 'unknown',
    taken_at_confidence: 0,
    location: null,
    orientation: null,
    raw_exif: {},
    vision: { facts: [], status: 'pending', error: null },
    group_id: null,
    sort_index: album.photo_count,
    user_confirmed: false,
    // 二级降级依据：上传时的本地文件时间（EXIF 缺失时 internal-processMeta 使用）
    client_hint_taken_at: (event.client_hint && event.client_hint.taken_at) || null,
    created_at: now,
    deleted: false,
  };

  const res = await db.collection('photos').add({ data: photo });

  // 更新相册计数
  await db.collection('albums').doc(albumId).update({
    data: {
      photo_count: db.command.inc(1),
      updated_at: now,
    },
  });

  // 行为事件：upload_completed（单张照片上传+登记完成；album 维度聚合靠 album_id）
  await writeEvent(openid, 'upload_completed', {
    album_id: albumId,
    photo_id: res._id,
    photo_count: album.photo_count + 1,
    is_duplicate: isDuplicate,
    file_size: fileSize,
  });

  return {
    code: 0,
    data: {
      photo_id: res._id,
      upload_status: 'uploaded',
      photo_count: album.photo_count + 1,
      is_duplicate: isDuplicate,
      duplicate_of: duplicateOf,
    },
  };
}

async function handleRequestMetaProcess(openid: string, albumId: string) {
  const db = cloud.database();

  // 权限校验：相册必须属于当前用户
  // ⚠️ doc.get 对不存在的文档会抛异常（而非返回空 data），必须捕获
  let album: Record<string, unknown> | null = null;
  try {
    const res = await db.collection('albums').doc(albumId).get();
    album = res.data as Record<string, unknown>;
  } catch (err) {
    album = null;
  }
  if (!album || album._openid !== openid) {
    return { code: 40301, message: '无权操作该相册' };
  }

  // 当前相册全部有效照片（复用任务时用于比对新照片是否已入批）
  const { data: photos } = await db.collection('photos')
    .where({ album_id: albumId, upload_status: 'uploaded', deleted: false })
    .get();
  const allPhotoIds = photos.map((p: Record<string, unknown>) => p._id as string);

  // 创建或获取 meta 任务
  const { data: existingJobs } = await db.collection('ai_jobs')
    .where({ album_id: albumId, type: 'meta', status: db.command.in(['pending', 'running']) })
    .get();

  let jobId: string;
  let job = existingJobs.length > 0 ? existingJobs[0] : null;

  if (job) {
    // 僵尸任务回收：running 超过 10 分钟无心跳（云函数超时被杀）→ 重置待处理批次后重跑
    const staleMs = Date.now() - new Date(job.updated_at || job.created_at).getTime();
    if (job.status === 'running' && staleMs > 10 * 60 * 1000) {
      const resetBatches = ((job.batches || []) as Record<string, unknown>[]).map((b) =>
        b.status === 'succeeded' ? b : { ...b, status: 'pending' }
      );
      await db.collection('ai_jobs').doc(job._id).update({
        data: { batches: resetBatches, status: 'pending', error: null, updated_at: new Date().toISOString() },
      });
      job = { ...job, batches: resetBatches, status: 'pending' };
    }
    jobId = job._id;

    // 增量补批：相册里新上传但未进入任何批次的照片，追加为新 pending 批次
    // （否则复用旧任务时新照片永远不会被解析）
    const existingBatches = ((job.batches || []) as Record<string, unknown>[]);
    const covered = new Set<string>(
      existingBatches.flatMap((b) => ((b.photo_ids || []) as unknown[]).map(String))
    );
    const uncovered = allPhotoIds.filter((id) => !covered.has(id));
    if (uncovered.length > 0) {
      const maxNo = existingBatches.reduce((m, b) => Math.max(m, Number(b.batch_no) || 0), 0);
      const newBatches: Record<string, unknown>[] = [];
      for (let i = 0; i < uncovered.length; i += 5) {
        newBatches.push({
          batch_no: maxNo + Math.floor(i / 5) + 1,
          photo_ids: uncovered.slice(i, i + 5),
          stage: 'meta',
          status: 'pending',
          attempts: 0,
          updated_at: new Date().toISOString(),
        });
      }
      const mergedBatches = [...existingBatches, ...newBatches];
      await db.collection('ai_jobs').doc(job._id).update({
        data: { batches: mergedBatches, updated_at: new Date().toISOString() },
      });
      job = { ...job, batches: mergedBatches };
    }

    // ⚠️ 触发方式变更：不再在云端 fire-and-forget 调 internal-processMeta——
    // 云函数返回后未 await 的 callFunction 会被运行时冻结，调用从未真正发出
    // （真机已验证：meta 任务永远 pending、batches attempts=0）。
    // 触发改由前端拿到 job_id 后直调 internal-processMeta：
    // 客户端发起的调用即使本地超时返回，云端仍会执行到完成（服务端超时 300s）。
  } else {
    // 创建新任务
    // 分批（每批5张）
    const batches = [];
    for (let i = 0; i < allPhotoIds.length; i += 5) {
      batches.push({
        batch_no: Math.floor(i / 5) + 1,
        photo_ids: allPhotoIds.slice(i, i + 5),
        stage: 'meta',
        status: 'pending',
        attempts: 0,
        updated_at: new Date().toISOString(),
      });
    }

    const jobRes = await db.collection('ai_jobs').add({
      data: {
        _openid: openid,
        album_id: albumId,
        type: 'meta',
        status: 'pending',
        stage: 'exif',
        progress: 0,
        batches,
        failed_photo_ids: [],
        payload: {},
        result_ref: null,
        error: null,
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    jobId = jobRes._id;
    job = { batches } as Record<string, unknown>;
  }

  const batches = (job?.batches || []) as Record<string, unknown>[];
  const done = batches.filter((b) => b.status === 'succeeded').length;
  const failed = batches.filter((b) => b.status === 'failed').length;

  return {
    code: 0,
    data: {
      job_id: jobId,
      status: job?.status || 'pending',
      batches: { total: batches.length, done, failed },
    },
  };
}

/** 查询 meta 任务进度（photo-review 轮询用） */
async function handleGetMetaJobStatus(openid: string, jobId: string) {
  if (!jobId) return { code: 40001, message: '缺少 job_id' };
  const db = cloud.database();

  // doc.get 对不存在的文档会抛异常而非返回空（wx-server-sdk 行为），必须捕获
  let job: Record<string, unknown> | null = null;
  try {
    const res = await db.collection('ai_jobs').doc(jobId).get();
    job = res.data as Record<string, unknown>;
  } catch (err) {
    job = null;
  }
  if (!job || job._openid !== openid) {
    return { code: 40301, message: '无权查看该任务' };
  }

  const batches = (job.batches || []) as Record<string, unknown>[];
  const done = batches.filter((b) => b.status === 'succeeded').length;
  const failed = batches.filter((b) => b.status === 'failed').length;

  return {
    code: 0,
    data: {
      job_id: jobId,
      status: job.status,
      progress: job.progress,
      batches: { total: batches.length, done, failed },
    },
  };
}

async function handleListPhotos(openid: string, albumId: string, groupId: string | null) {
  const db = cloud.database();
  const query: Record<string, unknown> = { album_id: albumId, _openid: openid, deleted: false };
  if (groupId) query.group_id = groupId;

  const { data: photos } = await db.collection('photos')
    .where(query)
    .orderBy('sort_index', 'asc')
    .get();

  // 获取临时 URL（getTempFileURL 单次上限 50 条，分批获取）
  const fileIds = photos.flatMap((p: Record<string, unknown>) => [p.file_id, p.thumb_file_id]).filter(Boolean);
  let urlMap: Record<string, string> = {};
  for (let i = 0; i < fileIds.length; i += 50) {
    const chunk = fileIds.slice(i, i + 50) as string[];
    const { fileList } = await cloud.getTempFileURL({ fileList: chunk });
    for (const f of fileList) {
      urlMap[f.fileID] = f.tempFileURL;
    }
  }

  return {
    code: 0,
    data: {
      photos: photos.map((p: Record<string, unknown>) => ({
        ...p,
        _temp_url: urlMap[p.file_id as string] || null,
        _thumb_url: urlMap[p.thumb_file_id as string] || null,
      })),
    },
  };
}

async function handleUpdateMeta(openid: string, event: CallEvent) {
  const db = cloud.database();
  const photoId = event.photo_id as string;

  const { data: photo } = await db.collection('photos').doc(photoId).get();
  if (!photo || photo._openid !== openid) {
    return { code: 40301, message: '无权操作该照片' };
  }

  const updates: Record<string, unknown> = {
    user_confirmed: true,
    updated_at: new Date().toISOString(),
  };

  // 用户明确「标记为未知」的字段
  const markUnknown = Array.isArray(event.mark_unknown) ? (event.mark_unknown as string[]) : [];

  // 拍摄时间
  if (markUnknown.includes('taken_at')) {
    updates.taken_at = null;
    updates.taken_at_source = 'unknown';
    updates.taken_at_confidence = 0;
  } else if (event.taken_at !== undefined) {
    if (event.taken_at) {
      updates.taken_at = event.taken_at as string;
      updates.taken_at_source = 'user';
      updates.taken_at_confidence = 1.0;
    } else {
      updates.taken_at = null;
      updates.taken_at_source = 'unknown';
      updates.taken_at_confidence = 0;
    }
  }

  // 地点
  // 注意：doc.update 对嵌套对象会展开成点路径（location.city），
  // 若数据库中 location 当前为 null 会报 "Cannot create field 'city' in element {location: null}"，
  // 因此必须用 db.command.set() 整体替换。
  if (markUnknown.includes('location')) {
    updates.location = db.command.set({
      lat: null,
      lng: null,
      city: null,
      district: null,
      poi: null,
      source: 'unknown',
      confidence: 0,
    });
  } else if (event.location !== undefined) {
    if (event.location === null) {
      updates.location = null;
    } else {
      const loc = event.location as Record<string, unknown>;
      const prev = (photo.location || {}) as Record<string, unknown>;
      updates.location = db.command.set({
        lat: loc.lat ?? prev.lat ?? null,
        lng: loc.lng ?? prev.lng ?? null,
        city: loc.city ?? prev.city ?? null,
        district: loc.district ?? prev.district ?? null,
        poi: loc.poi ?? prev.poi ?? null,
        source: 'user',
        confidence: 1.0,
      });
    }
  }

  await db.collection('photos').doc(photoId).update({ data: updates });
  return { code: 0, data: { ok: true } };
}

async function handleConfirmMeta(openid: string, albumId: string) {
  const db = cloud.database();

  // 前置校验
  const { data: album } = await db.collection('albums').doc(albumId).get();
  if (!album || album._openid !== openid) {
    return { code: 40301, message: '无权操作该相册' };
  }
  if (album.photo_count < 5) {
    return { code: 40001, message: '至少需要5张照片才能生成故事' };
  }

  // TODO: 聚类算法 + 生成事实库快照
  // 暂时返回占位
  return {
    code: 0,
    data: {
      fact_base_id: 'placeholder',
      meta_summary: { high: 0, low: 0, unknown: 0 },
    },
  };
}

async function handleReorder(openid: string, photoIds: string[]) {
  const db = cloud.database();

  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { code: 40001, message: '参数缺失' };
  }

  // 权限校验：所有照片必须属于当前用户（in 查询单次上限 20，分批）
  const found: Record<string, unknown>[] = [];
  for (let i = 0; i < photoIds.length; i += 20) {
    const chunk = photoIds.slice(i, i + 20);
    const { data } = await db.collection('photos')
      .where({ _id: db.command.in(chunk), deleted: false })
      .field({ _openid: true })
      .get();
    found.push(...data);
  }
  if (found.length !== photoIds.length) {
    return { code: 40301, message: '包含不存在或已删除的照片' };
  }
  if (found.some((p) => p._openid !== openid)) {
    return { code: 40301, message: '无权操作这些照片' };
  }

  for (let i = 0; i < photoIds.length; i++) {
    await db.collection('photos').doc(photoIds[i]).update({
      data: { sort_index: i },
    });
  }
  return { code: 0, data: { ok: true } };
}

async function handleDeletePhoto(openid: string, photoId: string) {
  const db = cloud.database();

  const { data: photo } = await db.collection('photos').doc(photoId).get();
  if (!photo || photo._openid !== openid) {
    return { code: 40301, message: '无权操作该照片' };
  }

  // 删云存储文件
  try {
    if (photo.file_id) await cloud.deleteFile({ fileList: [photo.file_id] });
    if (photo.thumb_file_id) await cloud.deleteFile({ fileList: [photo.thumb_file_id] });
  } catch (err) {
    console.warn('deleteFile failed', err);
  }

  // 删数据库记录（软删）
  await db.collection('photos').doc(photoId).update({
    data: { deleted: true },
  });

  // 更新相册计数
  await db.collection('albums').doc(photo.album_id).update({
    data: { photo_count: db.command.inc(-1) },
  });

  return { code: 0, data: { ok: true } };
}

async function handleGetPhotoFiles(openid: string, photoIds: string[]) {
  const db = cloud.database();
  const ids = Array.isArray(photoIds) ? photoIds.slice(0, 100) : [];
  if (ids.length === 0) {
    return { code: 0, data: { files: {} } };
  }

  // 云数据库 in 查询单次上限 20，分批查询
  const photos: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const { data } = await db.collection('photos')
      .where({ _id: db.command.in(chunk), _openid: openid, deleted: false })
      .field({ file_id: true, thumb_file_id: true })
      .get();
    photos.push(...data);
  }

  const files: Record<string, { file_id: string | null; thumb_file_id: string | null }> = {};
  for (const p of photos) {
    files[p._id as string] = {
      file_id: (p.file_id as string) || null,
      thumb_file_id: (p.thumb_file_id as string) || null,
    };
  }

  return { code: 0, data: { files } };
}
