// internal-remap — 临时云函数：把数据库里的旧环境 cloud:// fileID 替换为新环境 fileID
//
// 为什么需要：cloud:// 文件 ID 与环境绑定。数据导入新环境后，
//   photos.file_id / photos.thumb_file_id / albums.cover_file_id / album_stories.pdf_file_id
//   仍指向旧的 lvji 环境，照片会全部加载不出来。
//
// 用法：
//   1. 复制本文件到 cloudfunctions/internal-remap/index.js（含 package.json）
//   2. 部署到新环境（--r，首次失败需部署两次），超时设为 300s
//   3. 云端测试调用：
//      { "dryRun": true, "mapping": { "cloud://lvji-xxx/a.jpg": "cloud://yaomiao-yyy/a.jpg" } }
//      先用 dryRun 看统计，确认无误后 "dryRun": false 实际写入
//   4. 用完后删除该函数
//
// 分页：一次最多处理 limit 条（默认 100），返回 nextOffset，
//       用 { "offset": <nextOffset> } 继续，直到 done=true

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const TARGETS = [
  { coll: 'photos', fields: ['file_id', 'thumb_file_id'] },
  { coll: 'albums', fields: ['cover_file_id'] },
  { coll: 'album_stories', fields: ['pdf_file_id'] },
];

/** 判断一个值是否是 cloud:// fileID */
function isCloudFileId(v) {
  return typeof v === 'string' && v.indexOf('cloud://') === 0;
}

exports.main = async (event) => {
  const mapping = event.mapping || {};
  const dryRun = event.dryRun !== false; // 默认试运行，避免误改
  const limit = Math.min(Number(event.limit) || 100, 100);
  const offset = Number(event.offset) || 0;

  if (Object.keys(mapping).length === 0) {
    return { ok: false, error: 'mapping is empty' };
  }

  const result = {
    dryRun,
    offset,
    scanned: 0,
    matched: 0,
    updated: 0,
    missing: [],      // 旧 fileID 在映射表里找不到（备份漏文件）
    alreadyNew: 0,    // 已经是新环境 fileID，跳过
    errors: [],
    done: false,
  };

  for (const t of TARGETS) {
    const coll = db.collection(t.coll);
    const { data: docs } = await coll.skip(offset).limit(limit).get();

    for (const doc of docs) {
      result.scanned += 1;
      const patch = {};
      let needUpdate = false;

      for (const f of t.fields) {
        const old = doc[f];
        if (!isCloudFileId(old)) continue;

        // 已经是新环境（不在映射表的 key 里，但也不是旧环境）→ 跳过
        if (old.indexOf('cloud://lvji-') !== 0) {
          result.alreadyNew += 1;
          continue;
        }

        const nu = mapping[old];
        if (!nu) {
          if (result.missing.length < 20) {
            result.missing.push({ coll: t.coll, _id: doc._id, field: f, fileId: old });
          }
          continue;
        }

        patch[f] = nu;
        needUpdate = true;
      }

      if (needUpdate) {
        result.matched += 1;
        if (!dryRun) {
          try {
            await coll.doc(doc._id).update({ data: patch });
            result.updated += 1;
          } catch (e) {
            result.errors.push({ coll: t.coll, _id: doc._id, error: String(e && e.message) });
          }
        }
      }
    }

    if (docs.length < limit) result.done = true;
  }

  result.nextOffset = offset + limit;
  return { ok: true, ...result };
};
