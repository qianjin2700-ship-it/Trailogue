// pages/story-preview/index.ts — 故事预览（阅读模式）
import { getStory } from '../../services/story';
import { getPhotoFiles } from '../../services/photo';
import { createShare } from '../../services/share';
import { StoryOutput } from '../../types';
import { exportLongImage, exportPdf, ExportCancelError, getErrMsg } from '../../utils/album-export';
import { enableShare, safeTitle } from '../../utils/share';
import { errText } from '../../utils/request';

interface PageData {
  albumId: string;
  story: StoryOutput | null;
  version: number;
  degraded: boolean;
  loading: boolean;
  exporting: boolean;
  /** 预览用永久分享 token，供转发/朋友圈的落地页指向游客可读页 */
  shareToken: string;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    story: null,
    version: 0,
    degraded: false,
    loading: true,
    exporting: false,
    shareToken: '',
  },

  onLoad(options: { album_id?: string; token?: string }) {
    // 落地页兜底：转发卡片/朋友圈带 token 进来说明当前是访客，
    // 本页读故事需要本人身份，直接转交游客可读的 shared-view 页。
    if (options.token && !options.album_id) {
      wx.redirectTo({ url: `/pages/shared-view/index?token=${options.token}` });
      return;
    }
    this.setData({ albumId: options.album_id || '' });
    this.loadStory();
  },

  /** 每次页面显示时重新拉取最新故事，避免返回旧页面时看到过期版本 */
  onShow() {
    // 转发给朋友 + 分享到朋友圈都开启。
    // 朋友圈落地页固定是「当前页 + query」，所以下面 onShareTimeline 带的是 token，
    // 由 onLoad 兜底转交 shared-view，游客才不会看到加载失败。
    enableShare();

    const now = Date.now();
    if (this.data.albumId && !this.data.loading && now - (this.lastLoadedAt || 0) > 3000) {
      this.loadStory();
    }
  },

  async loadStory() {
    this.setData({ loading: true });
    this.lastLoadedAt = Date.now();
    try {
      const res = await getStory(this.data.albumId);
      const story = await this.resolvePhotoUrls(res.story);
      this.setData({
        story,
        version: res.version,
        degraded: res.degraded,
        loading: false,
      });
      // 渲染完再准备分享 token，不阻塞首屏
      void this.prepareShare();
    } catch (err) {
      console.error('getStory failed', err);
      this.setData({ loading: false });
      wx.showToast({ title: errText(err, '加载失败'), icon: 'none' });
    }
  },

  /**
   * 预先取到（或复用）永久分享 token。
   * 有了 token，转发卡片和朋友圈的落地页才能指向游客可读的 shared-view，
   * 否则好友点开只能看到「加载失败」。
   */
  async prepareShare() {
    if (this.data.shareToken || !this.data.albumId) return;
    try {
      const res = await createShare({ album_id: this.data.albumId, expire_days: -1 });
      if (res?.token) this.setData({ shareToken: res.token });
    } catch (err) {
      console.warn('[story-preview] prepareShare failed', err);
    }
  },

  /**
   * 把章节 photo_ids（照片记录ID）映射为可渲染的 cloud:// fileID。
   * 故事数据本身保持照片ID语义，仅渲染层替换，不影响编辑/重生成。
   */
  async resolvePhotoUrls(story: StoryOutput): Promise<StoryOutput> {
    try {
      const ids = Array.from(
        new Set((story.chapters || []).flatMap((ch) => ch.photo_ids || []))
      );
      if (ids.length === 0) return story;

      const { files } = await getPhotoFiles(ids);
      const clone = JSON.parse(JSON.stringify(story)) as StoryOutput;
      for (const ch of clone.chapters) {
        ch.photo_ids = (ch.photo_ids || []).map(
          (pid) => files[pid]?.thumb_file_id || files[pid]?.file_id || pid
        );
      }
      return clone;
    } catch (err) {
      console.warn('resolvePhotoUrls failed', err);
      return story;
    }
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/story-edit/index?album_id=${this.data.albumId}` });
  },

  onShare() {
    wx.navigateTo({ url: `/pages/share/index?album_id=${this.data.albumId}` });
  },

  /** 导出入口：长图保存相册 / PDF 预览 */
  async onExport() {
    if (this.data.exporting) return;
    const choice = await showExportSheet();
    if (choice === undefined) return;

    this.setData({ exporting: true });
    try {
      if (choice === 0) {
        await this.runLongImageExport();
      } else {
        await this.runPdfExport();
      }
    } finally {
      this.setData({ exporting: false });
    }
  },

  /** 保存长图到相册（单张） */
  async runLongImageExport() {
    wx.showLoading({ title: '生成长图中...', mask: true });
    try {
      await exportLongImage(this, this.data.albumId);
      wx.hideLoading();
      wx.showToast({ title: '长图已保存到相册', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      if (err instanceof ExportCancelError) {
        // 用户主动取消（授权弹窗 / PC 端保存路径弹窗），轻提示收场
        if (err.toast) wx.showToast({ title: err.toast, icon: 'none' });
        return;
      }
      console.error('exportLongImage failed', err);
      wx.showModal({ title: '导出失败', content: getErrMsg(err), showCancel: false });
    }
  },

  /** 生成 PDF 预览 */
  async runPdfExport() {
    wx.showLoading({ title: '渲染页面中...', mask: true });
    try {
      await exportPdf(this, this.data.albumId, {
        onProgress: (done, total) => {
          wx.showLoading({ title: `渲染中 ${done}/${total}`, mask: true });
        },
        onUpload: () => {
          wx.showLoading({ title: '合成 PDF 中...', mask: true });
        },
      });
      wx.hideLoading();
    } catch (err) {
      wx.hideLoading();
      console.error('exportPdf failed', err);
      wx.showModal({ title: '导出失败', content: getErrMsg(err), showCancel: false });
    }
  },

  onShareAppMessage() {
    console.log('[SHARE_DIAG] story-preview onShareAppMessage called');
    const token = this.data.shareToken;
    try {
      return {
        title: safeTitle(this.data.story?.title),
        // 有 token 就直达游客可读的故事页；token 还没取到时退回分享页
        path: token
          ? `/pages/shared-view/index?token=${token}`
          : `/pages/share/index?album_id=${this.data.albumId}`,
      };
    } catch (err) {
      // 分享函数抛异常会静默表现为「点了没反应」，这里兜底成最简单的分享
      console.error('[story-preview] onShareAppMessage error', err);
      return { title: '旅迹成书', path: '/pages/index/index' };
    }
  },

  /** 朋友圈：落地页固定为「本页 + query」，所以带 token，由 onLoad 兜底转交 shared-view */
  onShareTimeline() {
    console.log('[SHARE_DIAG] story-preview onShareTimeline called');
    const token = this.data.shareToken;
    try {
      return {
        title: safeTitle(this.data.story?.title),
        query: token ? `token=${token}` : `album_id=${this.data.albumId}`,
      };
    } catch (err) {
      console.error('[story-preview] onShareTimeline error', err);
      return { title: '旅迹成书', query: '' };
    }
  },

});

/** ActionSheet 选择导出方式，取消返回 undefined */
function showExportSheet(): Promise<number | undefined> {
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList: ['保存长图到相册', '生成 PDF 预览'],
      success: (res) => resolve(res.tapIndex),
      fail: () => resolve(undefined),
    });
  });
}
