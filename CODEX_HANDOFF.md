# Codex 交接文档

> **2026-10-23 current-state override:** Trailogue is iOS-first. The Mini Program and CloudBase material below is historical reference only. Phase B.1 has a Railway Fastify staging API at `https://trailogue-staging.up.railway.app`, an isolated migrated Neon PostgreSQL database, and a linked Expo team project at `@hardworkgirls-team/trailogue`. The latest recorded live health/readiness, anonymous bearer enforcement, and invalid Apple-token checks passed on 2026-10-21; a fresh 2026-10-23 network check was blocked by the local proxy and does not establish current availability. In-app Trip 401 cleanup was fixed locally, but the EAS preview API variable, signed build, and every real-iPhone login/session/Trip isolation gate remain open. Local commits are not yet synchronized to GitHub. Phase C is not ready. See `docs/26-phase-b1-staging-integration.md`; do not use the legacy deployment instructions below for the active iOS product.

> 本文档以「下一位开发者完全不知道 WorkBuddy 历史」为标准编写，目标是让你克隆本仓库后即可理解并继续开发。
> 项目当前是小程序，下一步计划基于同一套后端与业务逻辑开发 iOS App。**本仓库当前不包含任何 iOS 代码。**

---

## 1. 产品简介

**旅迹成书** 是一款「旅行照片 → AI 图文故事书」小程序。

用户上传 5～50 张旅行/活动照片，系统自动：

1. 读取照片 EXIF 拍摄时间与 GPS，结合腾讯位置服务逆地址解析出城市/地点；
2. 用视觉大模型理解每张照片的画面内容；
3. 按时间、地点、画面内容自动排序与分组；
4. 结合用户输入的主题、背景、文风提示词，逐章生成有故事性的图文相册；
5. 支持在线预览、逐章编辑、导出长图/PDF、生成带小程序码的海报分享。

已发布上线（v1.0.x）。核心 AI 链路端到端已打通。

## 2. 当前架构

- **前端**：微信原生小程序 + TypeScript（`strict` 全开，无第三方 UI 框架）。12 个页面、13 个组件（仅 5 个被使用）、7 个 service 层、6 个 utils。运行产物是编译出的 `.js`。
- **后端**：腾讯云 CloudBase 云函数（`wx-server-sdk`，Node.js 16）。12 个函数，业务函数（auth/album/photo/story/share/privacy/export）+ 内部函数（internal-init/internal-cleanup/internal-processMeta/internal-processVision/internal-generateStory）。
- **数据库**：CloudBase 文档型数据库（MongoDB）。11 个集合：`users / albums / photos / photo_groups / album_stories / ai_jobs / share_links / geo_cache / app_config / daily_usage / events`。
- **存储**：CloudBase 云存储，`cloud://` fileID 与环境绑定（换环境 fileID 全失效）。
- **AI 服务**：TokenHub（腾讯混元 MaaS），模型 `hy-vision-2.0-instruct`，端点 `https://tokenhub.tencentmaas.com/v1/chat/completions`，Bearer 鉴权，非流式，90s 超时。
- **地图服务**：腾讯位置服务 WebService API（逆地址解析 `apis.map.qq.com`），`TENCENT_LBS_KEY` 环境变量，无 key 时降级只存坐标。
- **登录**：微信云开发 `cloud.getWXContext().OPENID`（**不使用** `wx.login` / `code2Session`）。
- **支付**：**未实现**。`app_config` 中 `paymentEnabled=false`、`adsEnabled=false`，无任何支付/广告代码。

### 架构图（文字版）

```
微信小程序前端 (miniprogram/, TS)
   │  wx.cloud.callFunction (经 utils/request.ts)
   ▼
业务云函数 (auth/album/photo/story/share/privacy/export)
   │  读/写
   ▼
CloudBase 文档型数据库 (11 集合)  +  云存储 (cloud://)
   ▲
内部云函数 (internal-processMeta / internal-generateStory / internal-cleanup / internal-init)
   │  HTTP
   ├─ TokenHub (hy-vision-2.0-instruct)
   ├─ 腾讯位置服务 (逆地址解析)
   └─ 微信 API (access_token / getwxacodeunlimit)
```

> ⚠️ 长任务（internal-processMeta / internal-generateStory）由**前端拿到 job_id 后直调**，不是云端 fire-and-forget 自调用（原因见技术债务 #4）。

## 3. 核心业务流程

### 3.1 登录 / 建档
小程序启动 → `app.ts` `wx.cloud.init` + `onLaunch` 调 `services/auth.login` → 云函数 `auth` 用 `getWXContext().OPENID` 识别，老用户读取、新用户建档 → 前端存 `openid/userInfo/needPrivacyAgree` → 首次进入弹 `privacy-notice`，用户同意后调 `auth.agreePrivacy`。

### 3.2 创建相册
`pages/create-album` → `album.createAlbum`（文风/篇幅/编排策略等）→ 云函数 `album` 建 `albums` 文档 → 跳转上传页。

### 3.3 上传照片
`pages/upload`：`wx.chooseMedia`（`sizeType:['original']` 保 EXIF）→ 本地压缩 + 内容 hash → 原图 + 缩略图并发 `wx.cloud.uploadFile` → `photo.commitUpload` 登记 + 查重（重复弹 `duplicate-dialog`）。

### 3.4 解析元数据
`pages/photo-review` 调 `photo.requestMetaProcess`（建 `ai_jobs` meta 任务）→ 前端直调 `internal-processMeta` 解析 EXIF + 逆地址解析（geo_cache 缓存）→ 前端轮询 `photo.getMetaJobStatus` → 展示三级来源徽标，用户可手动补时间/地点 → `photo.confirmMeta`（当前为桩，聚类未落库）。

### 3.5 生成故事
`pages/story-generating` 调 `story.generateStory`（建 `ai_jobs` story 任务）→ 前端直调 `internal-generateStory` → 该函数内联视觉理解（TokenHub）+ 逐章生成故事 + JSON 解析容错 + 模板降级 + 聚类分组 → 写 `album_stories`（`kind:'story'`）→ 前端 `poll.ts` 轮询 `story.getJobStatus` → 完成跳 `story-preview`。

### 3.6 预览 / 编辑
`pages/story-preview` 读 `story.getStory` + 照片 fileID 换临时 URL，导出长图/PDF。`pages/story-edit` 编辑章节标题/正文/图说、锁定章节、单章重生成、拖拽排序、版本回退。

### 3.7 分享
`pages/share` 调 `share.createShare`（永久 token）→ 生成小程序码 + canvas 海报 → 游客通过 token/scene 进 `shared-view` 只读浏览。落地页**必须用 token 而非 album_id**（用 album_id 好友会 getAlbum 失败）。

### 3.8 导出 / 保存
长图（前端 canvas 渲染，`utils/album-export.ts`）；PDF（云函数 `export` 用 pdf-lib 合成，前端 `wx.openDocument` 打开）。

## 4. 核心代码位置

| 模块 | 位置 |
|---|---|
| **登录** | 前端 `miniprogram/app.ts`（`doLogin`）、`miniprogram/services/auth.ts`；后端 `cloudfunctions/auth/index.ts`（`getWXContext`） |
| **用户管理** | `cloudfunctions/auth/index.ts`（建档/昵称/隐私）；集合 `users` |
| **旅行（相册）数据** | `miniprogram/services/album.ts`、`cloudfunctions/album/index.ts`；集合 `albums` |
| **照片上传** | `miniprogram/pages/upload/index.ts`、`miniprogram/utils/compress.ts`、`cloudfunctions/photo/index.ts`；集合 `photos` |
| **照片分组** | 聚类逻辑在 `cloudfunctions/internal-generateStory/index.ts` 内存中（`photo_groups` 集合未落库） |
| **AI（视觉理解 + 文案生成）** | `cloudfunctions/internal-generateStory/index.ts`（`callChatModel` / `ensureVisionFacts` / 章节生成） |
| **AI 视觉（独立桩）** | `cloudfunctions/internal-processVision/index.ts`（空壳，勿依赖） |
| **地图/定位（逆地址解析）** | `cloudfunctions/internal-processMeta/index.ts`（`resolvePlace`）、集合 `geo_cache` |
| **书籍（故事）生成** | `cloudfunctions/internal-generateStory/index.ts`；集合 `album_stories`（`kind:'story'`） |
| **PDF 生成** | `cloudfunctions/export/index.ts`（pdf-lib）；前端 `miniprogram/utils/album-export.ts` |
| **支付** | **不存在**（未实现） |
| **数据库** | 集合创建见 `cloudfunctions/internal-init/index.ts`；数据模型见 `docs/04-database-models.md`、`miniprogram/types/index.ts` |
| **API（前端调用层）** | `miniprogram/services/*.ts`（统一 `utils/request.ts` → `wx.cloud.callFunction`）；契约见 `docs/05-api-contracts.md` |
| **异步任务编排** | 集合 `ai_jobs`；前端 `miniprogram/utils/poll.ts`；心跳防重入见 internal-processMeta / internal-generateStory |
| **分享** | `cloudfunctions/share/index.ts`（token + 小程序码）；前端 `pages/share`、`pages/shared-view`、`utils/share.ts` |
| **隐私/删除** | `cloudfunctions/privacy/index.ts`、`pages/privacy` |
| **清理任务** | `cloudfunctions/internal-cleanup/index.ts` |

## 5. 当前技术债务

1. **云环境硬编码**：`miniprogram/app.ts` 的 `globalData.cloudEnv = 'lvji-d6g41bt719c85fe54'`。换环境需改此处 + `cloudbaserc.json` + 重部署全部云函数（fileID 与环境绑定）。
2. **`common.ts` 6 处复制粘贴**：album/auth/photo/story/share/internal-generateStory 各一份几乎相同的 `loadAppConfig` + `writeEvent`，改动需同步 6 处。
3. **视觉理解内联 + 独立桩并存**：视觉理解在 `internal-generateStory` 内联完成，`internal-processVision` 是空壳，容易误导。
4. **云端 fire-and-forget 被冻结的架构妥协**：`internal-processMeta` / `internal-generateStory` 由前端直调（photo-review / story-generating / story-edit 三处 `wx.cloud.callFunction` 直呼 internal-*），依赖「幂等 + 心跳」自愈，链路脆弱，前端无法感知服务端最终结果。
5. **事实库快照 / photo_groups 未落地**：`photo.confirmMeta` 返回占位 `fact_base_id`；聚类在内存中完成不落库。设计文档 04/06 有相关描述，代码没有。
6. **删除级联不完整**：删相册仅软删 albums，`photo_groups/album_stories/share_links/ai_jobs` 的级联清理未实现。
7. **错误码不一致**：`album/index.ts` 返回 `code:40002`，但 `types/index.ts` 的 `ErrorCode` 枚举与 `utils/request.ts` 的 `errorMessage` 映射没有 40002。
8. **内部字段/查询小瑕疵**：`internal-processVision` 查询了不存在的 `vision_status_check` 字段；`internal-cleanup` 的 `cutoff` 变量计算后未使用；`updateStory` 用 `_id: undefined` 展开依赖 SDK 隐式忽略。
9. **无 TTL 清理**：`events` / `geo_cache` / `daily_usage` 均无过期清理逻辑。
10. **密钥环境变量冗余**：`scripts/migrate/set-fn-env-yaomiao.js` 给 generateStory/processMeta 注入了 `TENCENT_CLOUD_SECRET_ID/KEY`，但源码不读取（旧混元平台遗留）。
11. **迁移脚本残留**：`scripts/migrate/` 中 `deploy-yaomiao.ps1`、`set-fn-env-yaomiao.js`、`internal-remap/` 指向已放弃的 `yaomiao` 环境（PostgreSQL 型，微信小程序不支持接入）。这些是历史遗留，不影响当前 lvji 运行，可保留或清理。
12. **未接线组件**：13 个组件中 8 个未使用（见 CURRENT_FEATURES.md），属死代码。

## 6. 不要修改的部分（关键模块）

> 以下模块牵一发动全身，**在没有充分理解前不要动**：

1. **`miniprogram/utils/request.ts` 的信封与错误处理契约**：所有 service 依赖 `code!==0` 抛错、`errText` 提取服务端真实原因。前端大量页面据此显示错误，改动会破坏「失败提示带真实原因」这一修复。
2. **`miniprogram/utils/share.ts` 的 `enableShare` + 能力探测**：朋友圈分享按平台/版本探测（`wx.canIUse('showShareMenu.menus.shareTimeline')`），鸿蒙不支持朋友圈是平台限制，不要为兼容加 UI 入口（历史上加按钮被否）。
3. **长任务「前端直调 + 心跳防重入」机制**：`internal-processMeta` / `internal-generateStory` 的幂等与心跳逻辑，是绕过「云端 fire-and-forget 被冻结」的既定方案，不要改回云端自调用。
4. **`app.ts` 的 `cloudEnv` 与 `cloudbaserc.json` 的 `envId`**：需保持一致，且换环境会牵连 fileID、云函数部署、环境变量、超时、索引权限。
5. **数据库集合名与字段**：11 个集合及核心字段被多个云函数共享（见 `internal-init` 与 `types/index.ts`），改动字段需全链路同步。
6. **生成故事至少 5 张照片的规则**：`photo.confirmMeta` 校验 `photo_count < 5` 返回 40001，前端也有前置拦截，属产品规则，勿改。
7. **`internal-cleanup` 的清理语义**：过期原图（删原图保留缩略图）、软删物理清理、僵尸任务回收，涉及数据安全，改动需谨慎。

## 7. 构建与部署速查

```bash
npm install                 # 安装前端依赖
npm run build               # tsc 编译（产出 miniprogram/**/*.js）
npm run tsc / lint / format # 类型检查 / lint / 格式化
```

- 前端上传的是 `.js` 产物，`.ts` 是源码（`.js` 被 .gitignore 忽略）。
- 云函数目录内 `.js` 是编译产物，**已随仓库提交**，可直接「上传并部署（云端安装依赖）」。
- 详细部署见 `docs/12-deploy-manual.md`，环境变量见 `.env.example` 与 `docs/11-env-vars.md`。
