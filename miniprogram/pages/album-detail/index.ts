// pages/album-detail/index.ts — 相册详情
import { getAlbum, deleteAlbum } from '../../services/album';
import { errText } from '../../utils/request';
import { GetAlbumResult } from '../../types';

interface PageOption {
  album_id: string;
}

interface PageData {
  albumId: string;
  data: GetAlbumResult | null;
  loading: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    albumId: '',
    data: null,
    loading: true,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ albumId: options.album_id || '' });
  },

  onShow() {
    if (this.data.albumId) this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const data = await getAlbum(this.data.albumId);
      this.setData({ data, loading: false });
    } catch (err) {
      console.error('getAlbum failed', err);
      this.setData({ loading: false });
      wx.showToast({ title: errText(err, '加载失败'), icon: 'none' });
    }
  },

  onContinueUpload() {
    wx.navigateTo({ url: `/pages/upload/index?album_id=${this.data.albumId}` });
  },

  /** 编辑相册信息（跳创建页的编辑模式） */
  onEdit() {
    const album = this.data.data?.album;
    if (!album) return;
    const params = [
      `album_id=${this.data.albumId}`,
      `name=${encodeURIComponent(album.name || '')}`,
      `theme=${encodeURIComponent(album.theme || '')}`,
      `background=${encodeURIComponent(album.background || '')}`,
      `relations=${encodeURIComponent(album.relations || '')}`,
      `highlights=${encodeURIComponent(album.highlights || '')}`,
      `avoid_expressions=${encodeURIComponent(album.avoid_expressions || '')}`,
      `style=${album.style || 'warm_documentary'}`,
      `style_custom=${encodeURIComponent(album.style_custom || '')}`,
      `content_length=${album.content_length || 'medium'}`,
      `arrangement=${album.arrangement || 'timeline'}`,
    ].join('&');
    wx.navigateTo({ url: `/pages/create-album/index?${params}` });
  },

  onConfirmMeta() {
    wx.navigateTo({ url: `/pages/photo-review/index?album_id=${this.data.albumId}` });
  },

  onGenerate() {
    wx.navigateTo({ url: `/pages/story-generating/index?album_id=${this.data.albumId}` });
  },

  onViewStory() {
    wx.navigateTo({ url: `/pages/story-preview/index?album_id=${this.data.albumId}` });
  },

  onShare() {
    wx.navigateTo({ url: `/pages/share/index?album_id=${this.data.albumId}` });
  },

  onDelete() {
    const album = this.data.data?.album;
    if (!album) return;
    wx.showModal({
      title: '删除相册',
      content: `确定删除「${album.name}」？所有照片和故事将永久删除，不可恢复。`,
      confirmColor: '#d64545',
      success: async (res) => {
        if (res.confirm) {
          try {
            await deleteAlbum(this.data.albumId);
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
          } catch (err) {
            console.error('deleteAlbum failed', err);
            wx.showToast({ title: '删除失败', icon: 'error' });
          }
        }
      },
    });
  },
});
