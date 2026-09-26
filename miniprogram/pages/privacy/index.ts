// pages/privacy/index.ts — 隐私与数据管理
import { deleteAllUserData } from '../../services/privacy';
import { agreePrivacy } from '../../services/auth';
// IAppOption 为全局类型（typings.d.ts）

interface PageData {
  retentionDays: number;
  showDeleteConfirm: boolean;
  deleteInput: string;
  deleting: boolean;
}

Page<PageData, WechatMiniprogram.IAnyObject>({
  data: {
    retentionDays: 90,
    showDeleteConfirm: false,
    deleteInput: '',
    deleting: false,
  },

  onLoad() {
    const app = getApp<IAppOption>();
    this.setData({ retentionDays: app.globalData.userInfo?.retentionDays || 90 });
  },

  async onSelectRetention(e: WechatMiniprogram.TouchEvent) {
    // wxml dataset 属性值是字符串，必须转数字（否则选中态高亮和云端存储都会出错）
    const days = Number(e.currentTarget.dataset.days);
    if (days !== 90 && days !== -1) return;
    this.setData({ retentionDays: days });
    try {
      await agreePrivacy(days);
      wx.showToast({ title: '已设置', icon: 'success' });
    } catch (err) {
      console.error('agreePrivacy failed', err);
    }
  },

  onShowDeleteConfirm() {
    this.setData({ showDeleteConfirm: true, deleteInput: '' });
  },

  onDeleteInput(e: WechatMiniprogram.Input) {
    this.setData({ deleteInput: e.detail.value });
  },

  async onConfirmDelete() {
    if (this.data.deleteInput !== '删除') {
      wx.showToast({ title: '请输入"删除"确认', icon: 'none' });
      return;
    }

    this.setData({ deleting: true });
    try {
      const result = await deleteAllUserData(this.data.deleteInput);
      wx.showModal({
        title: '删除完成',
        content: `已删除 ${result.deleted.albums} 个相册、${result.deleted.photos} 张照片、${result.deleted.stories} 个故事、${result.deleted.files} 个文件。`,
        showCancel: false,
        success: () => {
          wx.reLaunch({ url: '/pages/index/index' });
        },
      });
    } catch (err) {
      console.error('deleteAllUserData failed', err);
      wx.showToast({ title: '删除失败', icon: 'error' });
    } finally {
      this.setData({ deleting: false, showDeleteConfirm: false });
    }
  },

  onCancelDelete() {
    this.setData({ showDeleteConfirm: false });
  },
});
