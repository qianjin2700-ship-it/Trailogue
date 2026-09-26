# iOS 迁移分析（仅分析，不实施）

> 本文只分析「哪些代码能搬到 iOS、哪些必须重写、用什么技术栈」，**不写任何 iOS 代码**。结论供后续开发者（Codex）参考。

---

## 一、代码资产分类

### A. 可直接复用（后端 + 纯逻辑）

| 资产 | 位置 | 复用方式 |
|---|---|---|
| 后端全部云函数 | `cloudfunctions/*` | 完全复用，无需改动（登录/相册/照片/AI 生成/分享/导出/隐私） |
| 数据库模型 | 11 个集合 + `miniprogram/types/index.ts` | 完全复用 |
| AI 服务 | `internal-generateStory`（TokenHub） | 完全复用 |
| 地图/逆地址解析 | `internal-processMeta`（腾讯位置服务） | 完全复用 |
| 分享 token 机制 | `share` 云函数 + `share_links` | 完全复用（iOS 用深链替代小程序码） |
| PDF 生成 | `export` 云函数（pdf-lib） | 完全复用 |
| 纯 TS 工具逻辑 | `utils/compress.ts`（hash/格式常量）、部分 `utils/album-export.ts`（分页/版式计算） | 高比例复用（非 `wx.*` 部分） |
| 数据/类型/枚举 | `miniprogram/types/index.ts` | 直接复用（TS 生态） |

### B. 部分复用（页面逻辑 / 状态 / 组件逻辑）

| 资产 | 位置 | 说明 |
|---|---|---|
| 页面业务流程逻辑 | `pages/*` 中「非 UI、非 `wx.*`」的部分 | 流程顺序、状态流转、数据转换可移植 |
| service 层调用契约 | `miniprogram/services/*.ts` | 逻辑可复用，但底层 `wx.cloud.callFunction` 需换成 HTTP 调用 |
| 工具函数 | `utils/poll.ts`（轮询退避）、`utils/exif-hint.ts`（日期格式化）、`utils/share.ts`（safeTitle） | 纯逻辑，高复用 |
| 组件交互逻辑 | `sortable-grid`（拖拽）、`meta-badge`（来源徽标） | 交互逻辑可参考，UI 重写 |

### C. 必须重写

| 资产 | 位置 | 原因 |
|---|---|---|
| 全部 WXML/WXSS UI | `miniprogram/**/*.wxml` / `.wxss` | 微信渲染层，无法复用 |
| 微信登录 | `app.ts` + `auth`（依赖 OPENID） | 换 Apple 登录 / 账号体系 |
| 微信分享 | `utils/share.ts`、`onShareAppMessage/onShareTimeline` | 换系统分享 + 深链 |
| 微信支付/订阅消息 | 无（未实现） | iOS 用 IAP / APNs 全新实现 |
| 微信相册/文件 API | `wx.chooseMedia` 等 | 换 PHPicker / Photos / FileManager |
| 云存储调用 | `wx.cloud.uploadFile/downloadFile/getTempFileURL` | 换对象存储（COS / CloudBase Web SDK）或 HTTP |
| 小程序生命周期 | `onLoad/onShow/onUnload` 等 | 换 React/SwiftUI 生命周期 |
| Canvas 渲染（长图/海报） | `utils/album-export.ts`、`pages/share` | 换 CoreGraphics / Canvas 重写 |

---

## 二、技术栈选型分析

候选：**React Native / Expo**、**Flutter**、**SwiftUI**。

| 维度 | Expo (React Native) | Flutter | SwiftUI |
|---|---|---|---|
| 前端 TS 逻辑复用 | ⭐⭐⭐ 最高（types/service/utils 近乎 1:1） | ⭐ 低（Dart 重写） | ⭐ 低（Swift 重写） |
| 后端复用 | ✅ 完全 | ✅ 完全 | ✅ 完全 |
| 云开发 SDK 生态 | ⚠️ 无官方 RN SDK，需走 HTTP 网关/REST | ✅ 官方 Flutter SDK | ✅ 官方 Swift SDK |
| 原生体验 / App Store | 良好（Expo 足够） | 良好 | ⭐⭐⭐ 最佳 |
| 跨平台（顺带 Android） | ✅ | ✅ | ❌ 仅 iOS |
| 单人开发 + AI 协作效率 | ⭐⭐⭐（TS，Codex 最熟） | ⭐⭐ | ⭐⭐ |
| Apple 登录 / IAP / APNs | 需要桥接/第三方库 | 需第三方库 | ⭐⭐⭐ 原生一等公民 |

### 推荐结论

**首选 Expo（React Native + TypeScript）**，理由：

1. **复用最大化**：本项目最有价值的 TypeScript 资产（`types/`、`services/` 契约、`utils/` 纯逻辑、后端全部）能最大比例保留，重写的只有 UI 与 `wx.*` 适配层。
2. **后端零改动**：云函数、数据库、AI 服务原样复用，只需把「前端直调 `wx.cloud.callFunction`」替换为「HTTP 调用云函数」（可开 CloudBase 云函数 HTTP 访问服务，或加一层 REST API 网关）。
3. **AI 协作效率**：全程 TypeScript，与 Codex/Cursor 等 AI 编程工具配合最顺，契合「靠 AI 辅助开发」的工作方式。
4. **可选跨平台**：未来要 Android，同一套代码基本可用。

**备选**：
- **SwiftUI**：若把「原生体验、Apple 生态一体化（登录/IAP/APNs）」放第一位、且不介意全量重写前端，选它（CloudBase 有 Swift SDK）。
- **Flutter**：若确定要 Android 且想用 CloudBase 官方 SDK，选它（代价是 TS 逻辑全部重写为 Dart）。

---

## 三、迁移的关键前置动作（给 Codex 的路径）

1. **抽象网络层**：把 `utils/request.ts` 里 `wx.cloud.callFunction` 抽成可替换的 transport，前端/小程序与 iOS 共用同一套 `services/*` 契约。
2. **后端暴露 HTTP 入口**：给云函数开「HTTP 访问服务」或新增一个 API 网关层（CloudBase 支持 HTTP 触发云函数），让 iOS 用标准 HTTPS 调用，绕过 `wx-server-sdk` 的微信绑定。
3. **登录改造**：后端 `auth` 从「依赖 `getWXContext().OPENID`」改为「支持外部传入的 user id + 校验」，以兼容 Apple 登录。
4. **存储改造**：`cloud://` fileID 换为对象存储 key/URL（CloudBase 存储同样支持 COS 协议与临时密钥 STS）。

> 以上均为**规划性结论**，本阶段未实施，也未修改任何现有代码。
