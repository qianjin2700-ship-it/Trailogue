// pages/failure/index.ts — 通用失败/失效页
interface PageData {
  errorType: string;
  message: string;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    errorType: 'task_failed',
    message: '操作失败，请重试',
  },

  onLoad(options: { type?: string; msg?: string }) {
    const errorType = options.type || 'task_failed';
    const messageMap: Record<string, string> = {
      task_failed: '任务执行失败，请稍后重试',
      link_expired: '链接已失效或不存在',
      network_error: '网络异常，请检查连接后重试',
    };
    this.setData({
      errorType,
      message: options.msg || messageMap[errorType] || '操作失败',
    });
  },

  onRetry() {
    wx.navigateBack();
  },

  onBackHome() {
    wx.reLaunch({ url: '/pages/index/index' });
  },
});
