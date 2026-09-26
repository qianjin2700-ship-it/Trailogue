# 微信小程序依赖识别

> 本文件用于评估「把当前小程序改造成 iOS App」时，微信专属 API 的替换成本。
> **只做识别与说明，不重写。**

---

## 1. 登录

- **功能**：用户识别、建档
- **代码位置**：`miniprogram/app.ts`（`wx.cloud.init` + `doLogin`）、`miniprogram/services/auth.ts`、`cloudfunctions/auth/index.ts`
- **当前微信实现**：完全依赖云开发 `cloud.getWXContext().OPENID`，**不使用** `wx.login` / `code2Session`
- **是否可复用**：❌ 登录方式不可直接复用（依赖微信云开发环境与 OPENID 注入）；后端 `users` 集合结构与建档逻辑可复用
- **iOS 如何替换**：改用 Apple 登录（Sign in with Apple）或账号体系（邮箱/手机号）；后端需新增非微信鉴权，`getWXContext().OPENID` 要替换为自有 user id

## 2. 分享（转发朋友 / 朋友圈）

- **功能**：右上角转发、朋友圈、海报
- **代码位置**：`miniprogram/utils/share.ts`（`enableShare` / `safeTitle`）、`pages/index` / `story-preview` / `share` / `shared-view` 的 `onShareAppMessage` / `onShareTimeline`、`cloudfunctions/share/index.ts`
- **当前微信实现**：`wx.showShareMenu` + `wx.canIUse('showShareMenu.menus.shareTimeline')` 探测；`onShareAppMessage` / `onShareTimeline`；分享 token 走游客页 `shared-view`
- **是否可复用**：❌ 微信分享菜单/朋友圈 API 不可复用；✅ 后端「分享 token + 游客只读」机制可复用
- **iOS 如何替换**：改用系统分享（UIActivityViewController / ShareSheet）+ 深链（universal link）；分享 token 校验后端可保留

## 3. 微信支付

- **功能**：支付 / 广告变现
- **代码位置**：无（`app_config` 中 `paymentEnabled=false`、`adsEnabled=false`）
- **当前微信实现**：未实现
- **是否可复用**：—
- **iOS 如何替换**：未来接入 IAP（StoreKit）或 Apple Pay，需全新实现（注意 Apple 审核对虚拟商品强制 IAP）

## 4. 地图 / 定位

- **功能**：将照片 GPS 逆解析为城市/地点
- **代码位置**：`cloudfunctions/internal-processMeta/index.ts`（`resolvePlace`）、`miniprogram/app.json`（`scope.userLocation` 声明）
- **当前微信实现**：定位靠 EXIF GPS（后端），**前端无** `wx.getLocation` / `wx.chooseLocation`；`scope.userLocation` 仅声明未使用；逆地址解析走腾讯位置服务 HTTP
- **是否可复用**：✅ 后端逆地址解析 + `geo_cache` 完全可复用；❌ 小程序定位授权声明无对应
- **iOS 如何替换**：iOS 端如需用户定位，用 CoreLocation（用户授权），但当前产品逻辑不依赖前端定位，基本无需替换

## 5. 相册 / 选图 / 文件系统

- **功能**：选照片、压缩、读文件、存文件、保存到相册
- **代码位置**：`pages/upload/index.ts`（`wx.chooseMedia`）、`utils/compress.ts`（`wx.getImageInfo` / `wx.compressImage` / `getFileSystemManager().readFile`）、`utils/exif-hint.ts`（`getFileSystemManager().stat`）、`utils/album-export.ts`（`wx.saveImageToPhotosAlbum` / `getFileSystemManager().saveFile`）、`pages/share/index.ts`（`writeFileSync`）
- **当前微信实现**：`wx.chooseMedia`、`wx.getImageInfo`、`wx.compressImage`、`wx.getFileSystemManager`（readFile/stat/saveFile/writeFileSync/unlinkSync）、`wx.saveImageToPhotosAlbum`、`wx.cloud.uploadFile/downloadFile/getTempFileURL`
- **是否可复用**：❌ 全部 `wx.*` 文件/相册 API 不可复用；✅ 压缩/hash/EXIF 提示的**业务逻辑**（`computeFileHash` FNV-1a、格式常量等）可复用
- **iOS 如何替换**：PHPickerViewController（选图）、Photos 框架（保存到相册）、FileManager（文件）、URLSession（上传下载）；EXIF 解析建议用后端（当前已是后端解析）

## 6. 文件存储（云存储）

- **功能**：照片/缩略图/PDF 上传下载、临时 URL
- **代码位置**：`pages/upload`、`utils/album-export.ts`、`cloudfunctions/export`、`cloudfunctions/share`
- **当前微信实现**：`wx.cloud.uploadFile` / `downloadFile` / `getTempFileURL`，`cloud://` fileID 与环境绑定
- **是否可复用**：❌ `wx.cloud.*` 存储 API 不可复用（依赖微信云开发）；✅ 后端存储逻辑（fileID、缩略图路径约定）可复用
- **iOS 如何替换**：改用通用对象存储（如腾讯云 COS / CloudBase Web SDK / S3 兼容），需处理鉴权（临时密钥 STS）；`cloud://` fileID 需替换为对象存储 URL/key

## 7. 订阅消息

- **功能**：任务完成等通知
- **代码位置**：无
- **当前微信实现**：未实现（全项目无 `wx.requestSubscribeMessage`）
- **是否可复用**：—
- **iOS 如何替换**：如需推送，用 APNs；当前无此需求

## 8. 其他微信 API

| API | 位置 | iOS 替换 |
|---|---|---|
| `wx.getUpdateManager`（版本更新检查） | `app.ts` | 无（App Store 自动更新） |
| `wx.vibrateShort`（震动反馈） | `components/sortable-grid` | UIImpactFeedbackGenerator |
| `wx.canvasToTempFilePath`（画布导出） | `utils/album-export.ts`、`pages/share` | 用 CoreGraphics/Canvas 重写 |
| `wx.getWindowInfo` / `wx.getSystemInfoSync` | 多处 | UIScreen / device info |
| `wx.env.USER_DATA_PATH` | `utils/album-export.ts`、`pages/share` | FileManager 沙盒目录 |
| `wx.openDocument`（打开 PDF） | `utils/album-export.ts` | QLPreviewController / PDFKit |
| `wx.cloud.callFunction` | `utils/request.ts` 及 3 处页面直调 | 后端改 HTTP/REST API 后，前端换网络层 |

---

## 结论（对 iOS 迁移）

- **可复用**：后端云函数业务逻辑、数据库模型、AI 服务、逆地址解析、分享 token 机制、压缩/hash 等纯 TS 工具。
- **必须替换**：所有 `wx.*` API（登录、分享、支付、相册、文件、存储、画布、系统能力）。
- **关键动作**：把「前端直调云函数」的 `wx.cloud.callFunction` 抽象成独立网络层，是 iOS 迁移的第一前提（详见 `IOS_MIGRATION_ANALYSIS.md`）。
