// pages/story-generating/index.ts — 生成进度页
import { generateStory, getJobStatus } from '../../services/story';
import { JobStatusResponse } from '../../types';
import { pollJobStatus, PollHandle } from '../../utils/poll';

interface PageData {
  albumId: string;
  jobId: string;
  stages: { label: string; key: string }[];
  currentStage: string;
  progress: number;
  stageMessage: string;
  batches: { total: number; done: number; failed: number };
  failedPhotoIds: string[];
  status: string;
  error: string | null;
}

const STAGES = [
  { label: '上传', key: 'upload' },
  { label: '解析', key: 'exif' },
  { label: '图片理解', key: 'vision' },
  { label: '排序与分组', key: 'cluster' },
  { label: '生成故事', key: 'factbase' },
  { label: '生成相册', key: 'summary' },
];

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    jobId: '',
    stages: STAGES,
    currentStage: '',
    progress: 0,
    stageMessage: '准备中...',
    batches: { total: 0, done: 0, failed: 0 },
    failedPhotoIds: [],
    status: 'pending',
    error: null,
  },

  /** 轮询句柄（onUnload 时取消） */
  pollHandle: null as PollHandle | null,
  /** 页面是否已卸载 */
  destroyed: false,

  async onLoad(options: { album_id: string }) {
    this.setData({ albumId: options.album_id });

    try {
      // generateStory 幂等：已有进行中任务时直接返回该 job（从中断处恢复轮询）
      const res = await generateStory(options.album_id);
      this.setData({ jobId: res.job_id, status: 'running' });

      // 触发方式变更（2026-08-29）：云端 fire-and-forget 调 internal-generateStory 会被运行时冻结，
      // 改由前端直调触发。客户端 callFunction 超时不影响云端继续执行（函数超时 300s），
      // 失败静默——轮询超时后用户重进页面会再次触发（幂等 + 心跳防重入）。
      wx.cloud.callFunction({
        name: 'internal-generateStory',
        data: { job_id: res.job_id },
      }).catch(() => undefined);

      this.startPolling(res.job_id);
    } catch (err) {
      console.error('generateStory failed', err);
      this.setData({ status: 'failed', error: '任务启动失败' });
    }
  },

  onUnload() {
    this.destroyed = true;
    if (this.pollHandle) {
      this.pollHandle.cancel();
      this.pollHandle = null;
    }
  },

  startPolling(jobId: string) {
    const handle = pollJobStatus(jobId, {
      onUpdate: (status: JobStatusResponse) => {
        this.setData({
          currentStage: status.stage,
          progress: status.progress,
          stageMessage: status.stage_message,
          batches: status.batches,
          failedPhotoIds: status.failed_photo_ids,
          status: status.status,
          error: status.error,
        });
      },
    });
    this.pollHandle = handle;
    handle
      .then((status) => {
        if (this.destroyed) return;
        if (status.status === 'succeeded') {
          wx.redirectTo({ url: `/pages/story-preview/index?album_id=${this.data.albumId}` });
        } else {
          this.setData({ status: status.status, error: status.error });
        }
      })
      .catch((err) => {
        if (this.destroyed) return;
        console.error('pollJobStatus failed', err);
        this.setData({ status: 'failed', error: '轮询超时' });
      });
  },

  /** 失败/超时后重试：重新触发执行（幂等 + 心跳防重入）并恢复轮询 */
  onRetryGenerate() {
    if (!this.data.jobId) return;
    this.setData({ status: 'running', error: null, stageMessage: '准备中...' });
    wx.cloud.callFunction({
      name: 'internal-generateStory',
      data: { job_id: this.data.jobId },
    }).catch(() => undefined);
    this.startPolling(this.data.jobId);
  },

  onRetryFailed() {
    // TODO: 调用 requestMetaProcess 重试失败批次
    wx.showToast({ title: '重试功能开发中', icon: 'none' });
  },

  onRemoveFailed() {
    // TODO: 移除失败照片
    wx.showToast({ title: '移除功能开发中', icon: 'none' });
  },

  onBackHome() {
    // ⚠️ 本项目未配置 tabBar，wx.switchTab 必然失败；且它不传回调时返回 Promise（truthy），
    // 会短路掉右侧的 reLaunch 兜底，导致点了完全没反应。统一用 reLaunch 回首页。
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
