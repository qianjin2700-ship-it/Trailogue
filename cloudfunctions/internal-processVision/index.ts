// cloudfunctions/internal-processVision/index.ts — 混元视觉调用（内部函数）
import cloud from 'wx-server-sdk';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

interface CallEvent {
  album_id: string;
  meta_job_id: string;
}

exports.main = async (event: CallEvent) => {
  const db = cloud.database();
  const { album_id, meta_job_id } = event;
  const wxContext = cloud.getWXContext();

  // 归属校验：相册必须属于调用链用户（openid 经函数间调用透传）
  const callerOpenid = wxContext.OPENID;
  if (callerOpenid) {
    const { data: album } = await db.collection('albums').doc(album_id).get();
    if (!album || album._openid !== callerOpenid) {
      return { code: 40301, message: '无权操作该相册' };
    }
  }

  // 获取所有照片（vision.status = pending）
  const { data: photos } = await db.collection('photos')
    .where({ album_id, vision_status_check: db.command.exists(false) })
    .get();

  // 简化版：获取所有 photos 中 vision.status === 'pending' 的
  const pendingPhotos = photos.filter((p: Record<string, unknown>) => {
    const vision = p.vision as Record<string, unknown> | undefined;
    return !vision || vision.status === 'pending';
  });

  if (pendingPhotos.length === 0) {
    return { code: 0, data: { status: 'succeeded', message: '无待处理照片' } };
  }

  // 创建 vision 任务
  const batches = [];
  for (let i = 0; i < pendingPhotos.length; i += 5) {
    batches.push({
      batch_no: Math.floor(i / 5) + 1,
      photo_ids: pendingPhotos.slice(i, i + 5).map((p: Record<string, unknown>) => p._id),
      stage: 'vision',
      status: 'pending',
      attempts: 0,
      updated_at: new Date().toISOString(),
    });
  }

  const jobRes = await db.collection('ai_jobs').add({
    data: {
      _openid: wxContext.OPENID || '',
      album_id,
      type: 'vision',
      status: 'running',
      stage: 'vision',
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

  // 逐批处理（简化版，实际应自调用分批）
  for (const batch of batches) {
    await processVisionBatch(batch.photo_ids as string[]);
    // 更新批次状态
    const done = batches.indexOf(batch) + 1;
    await db.collection('ai_jobs').doc(jobRes._id).update({
      data: {
        batches: batches.map((b) =>
          b.batch_no <= batch.batch_no ? { ...b, status: 'succeeded', updated_at: new Date().toISOString() } : b
        ),
        progress: done / batches.length,
        updated_at: new Date().toISOString(),
      },
    });
  }

  // 完成任务
  await db.collection('ai_jobs').doc(jobRes._id).update({
    data: { status: 'succeeded', progress: 1, updated_at: new Date().toISOString() },
  });

  return { code: 0, data: { status: 'succeeded' } };
};

/**
 * 处理一批照片的视觉理解
 * TODO: 调用混元视觉模型（经环境变量配置）
 */
async function processVisionBatch(photoIds: string[]) {
  const db = cloud.database();
  // TODO:
  // 1. 获取照片临时 URL
  // 2. 调用混元视觉（MODEL_NAME, MODEL_ENDPOINT, SECRET_ID, SECRET_KEY 来自环境变量）
  // 3. 解析返回 → VisionFact[]
  // 4. 写回 photos.vision

  for (const photoId of photoIds) {
    await db.collection('photos').doc(photoId).update({
      data: {
        vision: {
          facts: [],
          status: 'pending',
          error: 'Vision processing not yet implemented',
        },
      },
    });
  }
}
