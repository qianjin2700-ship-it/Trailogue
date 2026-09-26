// pages/index/index.ts — 首页：相册列表
import { listAlbums, deleteAlbum } from '../../services/album';
import { agreePrivacy } from '../../services/auth';
import { errText } from '../../utils/request';
import { enableShare, safeTitle } from '../../utils/share';
import { AlbumListItem, AlbumStatus } from '../../types';

/** 首页展示用相册项：statusText 为中文状态，coverUrl 为可渲染的临时 URL */
type DisplayAlbum = AlbumListItem & { statusText: string; coverUrl: string };

interface PageData {
  albums: DisplayAlbum[];
  loading: boolean;
  empty: boolean;
  showPrivacyNotice: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albums: [],
    loading: true,
    empty: false,
    showPrivacyNotice: false,
  },

  async onShow() {
    // 开启右上角「发送给朋友 / 分享到朋友圈」（未在页面调用则不显示）
    enableShare();

    // 等待启动登录完成（app.onLaunch 发起）
    const app = getApp<IAppOption>();
    if (app.globalData.loginReady) {
      await app.globalData.loginReady;
    }
    // 首次使用：弹出隐私告知
    if (app.globalData.needPrivacyAgree) {
      this.setData({ showPrivacyNotice: true });
    }
    this.loadAlbums();
  },

  /** 转发整个小程序给好友/群，落地首页 */
  onShareAppMessage() {
    console.log('[SHARE_DIAG] index onShareAppMessage called');
    try {
      return {
        title: safeTitle('旅迹成书 · 把旅行照片变成一本故事书'),
        path: '/pages/index/index',
      };
    } catch (err) {
      console.error('[index] onShareAppMessage error', err);
      return { title: '旅迹成书', path: '/pages/index/index' };
    }
  },

  /** 分享到朋友圈，落地首页（新用户会走登录引导） */
  onShareTimeline() {
    console.log('[SHARE_DIAG] index onShareTimeline called');
    try {
      return {
        title: safeTitle('旅迹成书 · 把旅行照片变成一本故事书'),
        query: '',
      };
    } catch (err) {
      console.error('[index] onShareTimeline error', err);
      return { title: '旅迹成书', query: '' };
    }
  },

  /** 相册状态英文值 → 中文展示（原实现直接渲染 status，界面会显示 "11张 · done"） */
  statusText(status: string): string {
    const map: Record<string, string> = {
      draft: '待上传',
      uploading: '上传中',
      ready: '待生成',
      generating: '生成中',
      done: '已完成',
      failed: '生成失败',
    };
    return map[status] || status;
  },

  async loadAlbums() {
    this.setData({ loading: true });
    try {
      const res = await listAlbums();
      const albums: DisplayAlbum[] = (res.items || []).map((a) => ({
        ...a,
        statusText: this.statusText(String(a.status || '')),
        coverUrl: '',
      }));

      // 封面 fileID（cloud://）不能直接给 image src，需批量换临时 URL（单次上限 50，列表 limit 20 内）
      const fileIds = albums
        .map((a) => a.cover_thumb_url)
        .filter((id): id is string => Boolean(id));
      if (fileIds.length > 0) {
        try {
          const urlRes = await wx.cloud.getTempFileURL({ fileList: fileIds });
          const urlMap: Record<string, string> = {};
          (urlRes.fileList || []).forEach((f) => {
            if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
          });
          albums.forEach((a) => {
            if (a.cover_thumb_url) a.coverUrl = urlMap[a.cover_thumb_url] || '';
          });
        } catch (err) {
          console.warn('cover temp url failed (ignored)', err);
        }
      }

      this.setData({
        albums,
        empty: albums.length === 0,
        loading: false,
      });
    } catch (err) {
      console.error('loadAlbums failed', err);
      this.setData({ loading: false });
      wx.showToast({ title: errText(err, '加载失败'), icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.loadAlbums().then(() => wx.stopPullDownRefresh());
  },

  onTapAlbum(e: WechatMiniprogram.TouchEvent) {
    const albumId = e.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/album-detail/index?album_id=${albumId}` });
  },

  onLongPressAlbum(e: WechatMiniprogram.TouchEvent) {
    const albumId = e.currentTarget.dataset.id as string;
    const album = this.data.albums.find((a) => a.album_id === albumId);
    if (!album) return;

    wx.showActionSheet({
      itemList: ['删除相册'],
      itemColor: '#d64545',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.confirmDelete(albumId, album.name);
        }
      },
    });
  },

  confirmDelete(albumId: string, name: string) {
    wx.showModal({
      title: '删除相册',
      content: `确定删除「${name}」？所有照片和故事将永久删除，不可恢复。`,
      confirmColor: '#d64545',
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteAlbum(albumId);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadAlbums();
          } catch (err) {
            console.error('deleteAlbum failed', err);
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      },
    });
  },

  onTapCreate() {
    wx.navigateTo({ url: '/pages/create-album/index' });
  },

  /** 同意隐私告知（默认保存期 90 天，可在 privacy 页修改） */
  async onAgreePrivacy() {
    try {
      await agreePrivacy(90);
      const app = getApp<IAppOption>();
      app.globalData.needPrivacyAgree = false;
      if (app.globalData.userInfo) {
        app.globalData.userInfo.privacyAgreedAt = new Date().toISOString();
        app.globalData.userInfo.retentionDays = 90;
      }
      this.setData({ showPrivacyNotice: false });
    } catch (err) {
      console.error('agreePrivacy failed', err);
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },

  /** 不同意：关闭弹窗，下次启动再次提示 */
  onDisagreePrivacy() {
    this.setData({ showPrivacyNotice: false });
    wx.showToast({ title: '同意后才能使用完整功能', icon: 'none' });
  },
});
