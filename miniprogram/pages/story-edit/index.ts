// pages/story-edit/index.ts — 故事编辑
import { getStory, updateStory, regenerateSection, getJobStatus } from '../../services/story';
import { errText } from '../../utils/request';
import { listPhotos, reorderPhotos } from '../../services/photo';
import { StoryOutput, Chapter } from '../../types';
import { Photo } from '../../types/index';

interface PageData {
  albumId: string;
  story: StoryOutput | null;
  version: number;
  loading: boolean;
  regeneratingChapterId: string | null;
  photos: Photo[];
  photosLoading: boolean;
  savingOrder: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    story: null,
    version: 0,
    loading: true,
    regeneratingChapterId: null,
    photos: [],
    photosLoading: true,
    savingOrder: false,
  },

  onLoad(options: { album_id: string }) {
    this.setData({ albumId: options.album_id });
    this.loadStory();
    this.loadPhotos();
  },

  onUnload() {
    if (this.regenTimer) {
      clearInterval(this.regenTimer);
      this.regenTimer = null;
    }
  },

  /** 重生成任务轮询定时器（卸载时清理） */
  regenTimer: null as ReturnType<typeof setInterval> | null,

  async loadStory() {
    this.setData({ loading: true });
    try {
      const res = await getStory(this.data.albumId);
      this.setData({ story: res.story, version: res.version, loading: false });
    } catch (err) {
      console.error('getStory failed', err);
      this.setData({ loading: false });
    }
  },

  /** 加载相册照片（云函数已按 sort_index 升序返回） */
  async loadPhotos() {
    this.setData({ photosLoading: true });
    try {
      const res = await listPhotos(this.data.albumId);
      this.setData({ photos: res.photos || [], photosLoading: false });
    } catch (err) {
      console.error('listPhotos failed', err);
      this.setData({ photos: [], photosLoading: false });
    }
  },

  /**
   * 照片拖拽排序结果写回服务端。
   * 失败时重新拉一次列表，把界面回滚到服务端的真实顺序，
   * 避免「界面看着换了、实际没保存成功」这种最难排查的不一致。
   */
  async onPhotosOrderChange(e: WechatMiniprogram.CustomEvent) {
    const detail = e.detail as unknown as { photo_ids: string[] };
    const photoIds = detail.photo_ids || [];
    if (photoIds.length === 0 || this.data.savingOrder) return;

    this.setData({ savingOrder: true });
    try {
      await reorderPhotos(photoIds);

      // 本地数据源跟着重排，保持与服务端一致
      const orderMap: Record<string, number> = {};
      photoIds.forEach((id, i) => {
        orderMap[id] = i;
      });
      const rank = (id: string): number =>
        orderMap[id] === undefined ? Number.MAX_SAFE_INTEGER : orderMap[id];
      const photos = this.data.photos.slice().sort((a, b) => rank(a._id) - rank(b._id));

      this.setData({ photos, savingOrder: false });
      wx.showToast({ title: '顺序已保存', icon: 'success' });
    } catch (err) {
      console.error('reorderPhotos failed', err);
      this.setData({ savingOrder: false });
      wx.showToast({ title: '保存顺序失败', icon: 'none' });
      await this.loadPhotos();
    }
  },

  /** 等待重生成任务完成：每 3s 轮询，最长 120s；完成/失败/超时都 resolve（由调用方刷新） */
  waitJobDone(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      let attempts = 0;
      this.regenTimer = setInterval(async () => {
        attempts += 1;
        try {
          const res = await getJobStatus(jobId);
          if (res.status === 'succeeded' || res.status === 'failed' || attempts > 40) {
            clearInterval(this.regenTimer!);
            this.regenTimer = null;
            resolve();
          }
        } catch (err) {
          // 轮询瞬时失败忽略，仍走次数上限保护
          if (attempts > 40) {
            clearInterval(this.regenTimer!);
            this.regenTimer = null;
            resolve();
          }
        }
      }, 3000);
    });
  },

  onInputTitle(e: WechatMiniprogram.Input) {
    this.setData({ 'story.title': e.detail.value });
  },

  onInputChapterTitle(e: WechatMiniprogram.Input) {
    const index = e.currentTarget.dataset.index as number;
    this.setData({ [`story.chapters[${index}].title`]: e.detail.value });
  },

  onInputNarrative(e: WechatMiniprogram.Input) {
    const index = e.currentTarget.dataset.index as number;
    this.setData({
      [`story.chapters[${index}].narrative`]: e.detail.value,
      [`story.chapters[${index}].user_edited`]: true,
    });
  },

  onToggleLock(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index as number;
    const chapter = this.data.story!.chapters[index];
    this.setData({ [`story.chapters[${index}].locked`]: !chapter.locked });
  },

  async onRegenerateChapter(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index as number;
    const chapter = this.data.story!.chapters[index];
    if (chapter.locked) {
      wx.showToast({ title: '该章节已锁定', icon: 'none' });
      return;
    }

    this.setData({ regeneratingChapterId: chapter.chapter_id });
    try {
      const res = await regenerateSection({
        album_id: this.data.albumId,
        chapter_id: chapter.chapter_id,
      });

      // 触发方式变更（2026-08-29）：云端 fire-and-forget 会被运行时冻结，改由前端直调触发；
      // 触发后轮询任务状态直到完成（成功/失败/超时），再刷新故事
      wx.cloud.callFunction({
        name: 'internal-generateStory',
        data: { job_id: res.job_id, mode: 'regen_section' },
      }).catch(() => undefined);
      await this.waitJobDone(res.job_id);

      // 刷新故事
      await this.loadStory();
      wx.showToast({ title: '已重新生成', icon: 'success' });
    } catch (err) {
      console.error('regenerateSection failed', err);
      wx.showToast({ title: '重生成失败', icon: 'error' });
    } finally {
      this.setData({ regeneratingChapterId: null });
    }
  },

  async onRegenerateAll() {
    // 跳过 locked 段
    wx.showModal({
      title: '整体重生成',
      content: '已锁定的段落将被保留，其余重新生成。确定继续？',
      success: async (res) => {
        if (!res.confirm) return;
        // TODO: 调用 generateStory 或新接口
        wx.showToast({ title: '功能开发中', icon: 'none' });
      },
    });
  },

  async onRestoreVersion() {
    wx.showModal({
      title: '恢复上一版本',
      content: '将回退到上一版本，用户手动修改会保留。确定？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const prev = await getStory(this.data.albumId, this.data.version - 1);
          this.setData({ story: prev.story, version: prev.version });
          wx.showToast({ title: '已恢复', icon: 'success' });
        } catch (err) {
          wx.showToast({ title: '已是最早版本', icon: 'none' });
        }
      },
    });
  },

  async onSave() {
    if (!this.data.story) return;
    wx.showLoading({ title: '保存中...' });
    try {
      const res = await updateStory({
        album_id: this.data.albumId,
        patch: {
          title: this.data.story.title,
          chapters: this.data.story.chapters.map((ch) => ({
            chapter_id: ch.chapter_id,
            title: ch.title,
            narrative: ch.narrative,
            captions: ch.captions,
          })),
        },
      });
      this.setData({ version: res.version });
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('updateStory failed', err);
      wx.showToast({ title: errText(err, '保存失败'), icon: 'none' });
    }
  },
});
