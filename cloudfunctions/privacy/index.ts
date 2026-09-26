// cloudfunctions/privacy/index.ts — 数据删除管理
import cloud from 'wx-server-sdk';

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

interface CallEvent {
  action: string;
  [key: string]: unknown;
}

exports.main = async (event: CallEvent) => {
  const { action } = event;

  switch (action) {
    case 'deleteAllUserData':
      return handleDeleteAll(cloud.getWXContext().OPENID, event.confirm_text as string);
    default:
      return { code: 40001, message: `未知 action: ${action}` };
  }
};

async function handleDeleteAll(openid: string, confirmText: string) {
  if (confirmText !== '删除') {
    return { code: 40001, message: '请输入"删除"确认' };
  }

  const db = cloud.database();
  let deletedAlbums = 0;
  let deletedPhotos = 0;
  let deletedStories = 0;
  let deletedFiles = 0;

  // 1. 查找所有相册
  const { data: albums } = await db.collection('albums')
    .where({ _openid: openid, deleted: false })
    .get();

  for (const album of albums) {
    // 2. 查找照片
    const { data: photos } = await db.collection('photos')
      .where({ album_id: album._id, _openid: openid })
      .get();

    // 3. 删云存储文件
    const fileIds: string[] = [];
    for (const photo of photos) {
      if (photo.file_id) fileIds.push(photo.file_id);
      if (photo.thumb_file_id) fileIds.push(photo.thumb_file_id);
    }
    if (fileIds.length > 0) {
      try {
        await cloud.deleteFile({ fileList: fileIds });
        deletedFiles += fileIds.length;
      } catch (err) {
        console.warn('deleteFile failed', err);
      }
    }

    // 4. 删照片记录
    for (const photo of photos) {
      await db.collection('photos').doc(photo._id).remove();
    }
    deletedPhotos += photos.length;

    // 5. 删分组
    await db.collection('photo_groups').where({ album_id: album._id, _openid: openid }).remove();

    // 6. 删故事
    const { data: stories } = await db.collection('album_stories')
      .where({ album_id: album._id, _openid: openid })
      .get();
    for (const story of stories) {
      await db.collection('album_stories').doc(story._id).remove();
    }
    deletedStories += stories.length;

    // 7. 删分享链接
    await db.collection('share_links').where({ album_id: album._id, _openid: openid }).remove();

    // 8. 删任务
    await db.collection('ai_jobs').where({ album_id: album._id, _openid: openid }).remove();

    // 9. 删相册
    await db.collection('albums').doc(album._id).remove();
    deletedAlbums++;
  }

  // 10. 删用户文档
  await db.collection('users').where({ _openid: openid }).remove();

  return {
    code: 0,
    data: {
      deleted: {
        albums: deletedAlbums,
        photos: deletedPhotos,
        stories: deletedStories,
        files: deletedFiles,
      },
    },
  };
}
