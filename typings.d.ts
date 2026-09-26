/// <reference path="./node_modules/miniprogram-api-typings/index.d.ts" />

/** 全局 App 类型（app.ts 的 globalData 结构） */
interface IAppOption {
  globalData: {
    openid: string | null;
    userInfo: IUserInfo | null;
    cloudEnv: string;
    needPrivacyAgree: boolean;
    loginReady: Promise<void> | null;
  };
  /** 启动登录（app.onLaunch 调用，登录态写入 globalData） */
  doLogin(): Promise<void>;
}

interface IUserInfo {
  nickname: string | null;
  avatarUrl: string | null;
  retentionDays: number;
  privacyAgreedAt: string | null;
}
