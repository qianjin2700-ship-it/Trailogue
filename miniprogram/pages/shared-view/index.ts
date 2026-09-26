// pages/shared-view/index.ts — 分享浏览页（只读，游客可访问）
import { getSharedStory } from '../../services/share';
import { enableShare, safeTitle } from '../../utils/share';
import { StoryOutput } from '../../types';

interface PageData {
  token: string;
  story: StoryOutput | null;
  albumName: string;
  expireAt: string | null;
  loading: boolean;
  failed: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    token: '',
    story: null,
    albumName: '',
    expireAt: null,
    loading: true,
    failed: false,
  },

  onLoad(options: { token?: string; scene?: string }) {
    // 开启转发/朋友圈按钮（未调用 → 右上角菜单里两个按钮不显示或置灰）
    enableShare();

    // 支持两种入口：普通转发/复制链接（token 参数）、小程序码（scene 参数，值为 token）
    let token = options.token || '';
    if (!token && options.scene) {
      token = decodeURIComponent(options.scene);
    }
    if (!token) {
      this.setData({ loading: false, failed: true });
      return;
    }
    this.setData({ token });
    this.loadSharedStory();
  },

  async loadSharedStory() {
    try {
      const res = await getSharedStory(this.data.token);
      this.setData({
        story: res.story,
        albumName: res.album_name,
        expireAt: res.expire_at,
        loading: false,
      });
    } catch (err) {
      console.error('getSharedStory failed', err);
      this.setData({ loading: false, failed: true });
    }
  },

  onMakeOwn() {
    wx.reLaunch({ url: '/pages/index/index' });
  },

  /** 游客可继续转发给好友/群聊 */
  onShareAppMessage() {
    console.log('[SHARE_DIAG] shared-view onShareAppMessage called');
    try {
      return {
        title: safeTitle(this.data.story?.title, '旅迹成书 · 旅行故事'),
        path: `/pages/shared-view/index?token=${this.data.token}`,
      };
    } catch (err) {
      console.error('[shared-view] onShareAppMessage error', err);
      return { title: '旅迹成书', path: '/pages/index/index' };
    }
  },

  /** 游客可分享到朋友圈（单页模式查看） */
  onShareTimeline() {
    console.log('[SHARE_DIAG] shared-view onShareTimeline called');
    try {
      return {
        title: safeTitle(this.data.story?.title, '旅迹成书 · 旅行故事'),
        query: `token=${this.data.token}`,
      };
    } catch (err) {
      console.error('[shared-view] onShareTimeline error', err);
      return { title: '旅迹成书', query: '' };
    }
  },
});
