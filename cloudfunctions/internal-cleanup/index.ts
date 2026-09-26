// cloudfunctions/internal-cleanup/index.ts — 定时清理任务
import cloud from 'wx-server-sdk';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 定时触发器配置（在云函数管理后台设置）:
// triggerType: timer
// cron: 0 0 3 * * * *  (每天凌晨 3 点)

exports.main = async (event: Record<string, unknown>) => {
  console.log('internal-cleanup triggered', event);

  const db = cloud.database();
  const now = new Date();
  const results = {
    expired_photos: 0,
    soft_deleted: 0,
    zombie_jobs: 0,
  };

  // 1. 过期原图清理（retention_days 到期）
  await cleanupExpiredPhotos(db, now, results);

  // 2. 软删物理清理（deleted=true 超过 24h）
  await cleanupSoftDeleted(db, now, results);

  // 3. 僵尸任务回收（running 超过 30 分钟）
  await cleanupZombieJobs(db, now, results);

  console.log('cleanup results', results);
  return { code: 0, data: results };
};

async function cleanupExpiredPhotos(db: ReturnType<typeof cloud.database>, now: Date, results: Record<string, number>) {
  // 查找 retention_days != -1 的用户
  const { data: users } = await db.collection('users')
    .where({ retention_days: db.command.neq(-1) })
    .get();

  for (const user of users) {
    const expireDate = new Date(now.getTime() - (user.retention_days as number) * 86400000);
    // 查找过期照片
    const { data: photos } = await db.collection('photos')
      .where({
        _openid: user._openid,
        created_at: db.command.lt(expireDate.toISOString()),
        deleted: false,
      })
      .get();

    for (const photo of photos) {
      // 删原图，保留缩略图
      if (photo.file_id) {
        try {
          await cloud.deleteFile({ fileList: [photo.file_id] });
        } catch (err) {
          console.warn('deleteFile failed', err);
        }
      }
      // 标记原图已清理
      await db.collection('photos').doc(photo._id).update({
        data: { file_id: null },
      });
      results.expired_photos++;
    }
  }
}

async function cleanupSoftDeleted(db: ReturnType<typeof cloud.database>, now: Date, results: Record<string, number>) {
  const cutoff = new Date(now.getTime() - 24 * 3600000); // 24h 前

  // 软删照片物理清理
  const { data: photos } = await db.collection('photos')
    .where({ deleted: true })
    .get();

  for (const photo of photos) {
    // 删云存储
    const fileIds = [photo.file_id, photo.thumb_file_id].filter(Boolean);
    if (fileIds.length > 0) {
      try {
        await cloud.deleteFile({ fileList: fileIds });
      } catch (err) {
        console.warn('deleteFile failed', err);
      }
    }
    await db.collection('photos').doc(photo._id).remove();
    results.soft_deleted++;
  }

  // 软删相册物理清理
  const { data: albums } = await db.collection('albums')
    .where({ deleted: true })
    .get();

  for (const album of albums) {
    await db.collection('albums').doc(album._id).remove();
  }
}

async function cleanupZombieJobs(db: ReturnType<typeof cloud.database>, now: Date, results: Record<string, number>) {
  const cutoff = new Date(now.getTime() - 30 * 60000); // 30 分钟前

  const { data: jobs } = await db.collection('ai_jobs')
    .where({
      status: 'running',
      updated_at: db.command.lt(cutoff.toISOString()),
    })
    .get();

  for (const job of jobs) {
    await db.collection('ai_jobs').doc(job._id).update({
      data: {
        status: 'failed',
        error: '任务超时（僵尸回收）',
        updated_at: now.toISOString(),
      },
    });
    results.zombie_jobs++;
  }
}
