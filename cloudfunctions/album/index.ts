// cloudfunctions/album/index.ts — 相册 CRUD
import cloud from 'wx-server-sdk';
import { writeEvent } from './common';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

interface CallEvent {
  action: string;
  [key: string]: unknown;
}

exports.main = async (event: CallEvent) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  switch (action) {
    case 'createAlbum':
      return handleCreate(openid, event);
    case 'updateAlbum':
      return handleUpdate(openid, event);
    case 'listAlbums':
      return handleList(openid, event);
    case 'getAlbum':
      return handleGet(openid, event.album_id as string);
    case 'deleteAlbum':
      return handleDelete(openid, event.album_id as string);
    default:
      return { code: 40001, message: `未知 action: ${action}` };
  }
};

async function handleCreate(openid: string, event: CallEvent) {
  const db = cloud.database();
  const now = new Date().toISOString();

  const album = {
    _openid: openid,
    name: event.name,
    theme: event.theme || '',
    background: event.background || '',
    relations: event.relations || '',
    highlights: event.highlights || '',
    style: event.style || 'warm_documentary',
    style_custom: event.style_custom || null,
    avoid_expressions: event.avoid_expressions || null,
    content_length: ['short', 'medium', 'long'].includes(String(event.content_length))
      ? event.content_length
      : 'medium',
    arrangement: ['timeline', 'location', 'event'].includes(String(event.arrangement))
      ? event.arrangement
      : 'timeline',
    status: 'draft',
    photo_count: 0,
    fact_base_snapshot_id: null,
    story_id: null,
    cover_file_id: null,
    created_at: now,
    updated_at: now,
    deleted: false,
  };

  const res = await db.collection('albums').add({ data: album });

  // 行为事件：album_create
  await writeEvent(openid, 'album_create', {
    album_id: res._id,
    arrangement: String(album.arrangement),
    style: String(album.style),
    content_length: String(album.content_length),
  });

  return { code: 0, data: { album_id: res._id, status: 'draft' } };
}

async function handleUpdate(openid: string, event: CallEvent) {
  const db = cloud.database();
  const albumId = event.album_id as string;

  // 权限校验
  const { data } = await db.collection('albums').doc(albumId).get();
  if (!data || data._openid !== openid) {
    return { code: 40301, message: '无权操作该相册' };
  }

  // 枚举字段合法性校验
  if (event.content_length !== undefined && !['short', 'medium', 'long'].includes(String(event.content_length))) {
    return { code: 40002, message: '无效的篇幅设置' };
  }
  if (event.arrangement !== undefined && !['timeline', 'location', 'event'].includes(String(event.arrangement))) {
    return { code: 40002, message: '无效的编排策略' };
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['name', 'theme', 'background', 'relations', 'highlights', 'style', 'style_custom', 'avoid_expressions', 'content_length', 'arrangement']) {
    if (event[key] !== undefined) updates[key] = event[key];
  }

  await db.collection('albums').doc(albumId).update({ data: updates });
  return { code: 0, data: { ok: true } };
}

async function handleList(openid: string, event: CallEvent) {
  const db = cloud.database();
  const limit = (event.limit as number) || 20;

  const { data } = await db.collection('albums')
    .where({ _openid: openid, deleted: false })
    .orderBy('updated_at', 'desc')
    .limit(limit)
    .get();

  // 封面：取每个相册第一张照片的缩略图 fileID。
  // albums.cover_file_id 自创建后从未被赋值（恒为 null），列表封面一直是空白；
  // 这里按 sort_index 取首图兜底。相册数受 limit(≤20) 约束，逐个查询开销可接受。
  const covers: Record<string, string> = {};
  for (const a of data as Record<string, unknown>[]) {
    const aid = String(a._id);
    if (Number(a.photo_count) <= 0) continue;
    try {
      const { data: ps } = await db.collection('photos')
        .where({ album_id: aid, deleted: false })
        .orderBy('sort_index', 'asc')
        .limit(1)
        .get();
      if (ps.length > 0) {
        const p = ps[0] as Record<string, unknown>;
        covers[aid] = String(p.thumb_file_id || p.file_id || '');
      }
    } catch (err) {
      // 单个相册取封面失败不影响列表返回
      console.warn('cover lookup failed', aid, err);
    }
  }

  return {
    code: 0,
    data: {
      items: data.map((a: Record<string, unknown>) => ({
        album_id: a._id,
        name: a.name,
        status: a.status,
        photo_count: a.photo_count,
        cover_thumb_url: covers[String(a._id)] || null,
        updated_at: a.updated_at,
      })),
      next_cursor: null,
    },
  };
}

async function handleGet(openid: string, albumId: string) {
  const db = cloud.database();

  const { data: album } = await db.collection('albums').doc(albumId).get();
  if (!album || album._openid !== openid) {
    return { code: 40401, message: '相册不存在或无权访问' };
  }

  const { data: groups } = await db.collection('photo_groups')
    .where({ album_id: albumId, _openid: openid })
    .orderBy('sort_index', 'asc')
    .get();

  // 活跃任务
  const { data: jobs } = await db.collection('ai_jobs')
    .where({ album_id: albumId, status: db.command.in(['pending', 'running']) })
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  return {
    code: 0,
    data: {
      album,
      groups: groups.map((g: Record<string, unknown>) => ({
        _id: g._id,
        title: g.title,
        photo_ids: g.photo_ids,
        location_label: g.location_label,
      })),
      meta_summary: { high: 0, low: 0, unknown: 0 },
      active_job: jobs.length > 0 ? { job_id: jobs[0]._id, type: jobs[0].type, progress: jobs[0].progress } : null,
    },
  };
}

async function handleDelete(openid: string, albumId: string) {
  const db = cloud.database();

  // 权限校验
  const { data } = await db.collection('albums').doc(albumId).get();
  if (!data || data._openid !== openid) {
    return { code: 40301, message: '无权操作该相册' };
  }

  // 软删
  await db.collection('albums').doc(albumId).update({
    data: { deleted: true, updated_at: new Date().toISOString() },
  });

  // TODO: 级联删除照片/分组/故事/分享链接 + 云存储文件（由 internal-cleanup 异步处理）

  return { code: 0, data: { ok: true } };
}
