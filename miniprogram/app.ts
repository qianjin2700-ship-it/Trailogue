// app.ts — 旅迹成书 小程序入口
// IAppOption / IUserInfo 为全局类型（typings.d.ts）
import { login } from './services/auth';

App<IAppOption>({
  globalData: {
    openid: null,
    userInfo: null,
    // 云开发环境 ID
    cloudEnv: 'lvji-d6g41bt719c85fe54',
    needPrivacyAgree: false,
    loginReady: null,
  },

  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.cloudEnv || undefined,
        traceUser: true,
      });
    }
    // 启动即登录（auth.login 幂等：老用户读取，新用户建档）
    this.globalData.loginReady = this.doLogin();
    // 版本更新：静默检查，新包就绪后询问用户重启（不做强制更新）
    setupUpdateManager();
  },

  async doLogin() {
    try {
      const res = await login();
      this.globalData.openid = res.openid;
      this.globalData.userInfo = {
        nickname: res.user.nickname,
        avatarUrl: null,
        retentionDays: res.user.retention_days,
        privacyAgreedAt: res.user.privacy_agreed_at,
      };
      this.globalData.needPrivacyAgree = res.need_privacy_agree;
    } catch (err) {
      console.error('login failed', err);
    }
  },
});

/** 静默更新管理：下载完成弹窗询问，失败静默（下次启动再试） */
function setupUpdateManager() {
  if (!wx.getUpdateManager) return; // 低版本基础库无此 API
  const manager = wx.getUpdateManager();
  manager.onUpdateReady(() => {
    wx.showModal({
      title: '更新提示',
      content: '新版本已经准备好，是否重启应用？',
      confirmText: '立即重启',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) manager.applyUpdate();
      },
    });
  });
  manager.onUpdateFailed(() => {
    // 下载失败不打扰用户，下次冷启动会重新检查
    console.warn('update download failed, will retry on next launch');
  });
}

export {};
