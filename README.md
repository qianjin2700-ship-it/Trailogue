# 旅迹成书

上传 5～50 张旅行/活动照片，AI 自动读取拍摄时间与 GPS、理解画面内容，按时间与地点自动排序分组，再结合用户输入的主题、背景与文风提示词，生成一本有故事性的图文相册。支持在线预览、逐章编辑、导出长图/PDF、以及生成带小程序码的海报分享。

## 当前产品功能

- **登录 / 建档**：基于微信云开发 `getWXContext().OPENID`，无需 `wx.login`/`code2Session`；首次进入弹隐私告知。
- **相册管理**：创建 / 编辑 / 列表 / 删除（软删）相册，支持文风、篇幅、编排策略等个性化选项。
- **照片上传**：`wx.chooseMedia` 选原图（保 EXIF）→ 本地压缩 + 内容 hash 查重 → 原图 + 缩略图并发上传 → 查重弹窗。
- **元数据解析**：后端 `internal-processMeta` 解析 EXIF 拍摄时间与 GPS，调用腾讯位置服务逆地址解析（三级降级 + geo_cache 缓存），前端轮询 + 手动补时间/地点。
- **AI 故事生成**：`internal-generateStory` 内联视觉理解 + 调用 TokenHub（`hy-vision-2.0-instruct`）逐章生成图文故事，含 JSON 解析容错与模板降级，长任务心跳防重入。
- **故事编辑**：章节标题/正文/图说编辑、锁定章节、单章重生成、拖拽排序、版本回退。
- **导出**：长图（canvas 渲染）与 PDF（云函数 `export`，pdf-lib）。
- **分享**：永久/限时分享 token，游客只读浏览页 `shared-view`，生成带小程序码的海报。
- **隐私**：设置数据保留期（90 天 / 永久），二次确认后删除全部用户数据。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | 微信**原生小程序**（无第三方框架）+ TypeScript（`strict` 全开） |
| 后端框架 | 腾讯云 CloudBase **云函数**（`wx-server-sdk`，Node.js） |
| 数据库 | CloudBase **文档型数据库**（MongoDB），11 个集合 |
| 存储 | CloudBase 云存储（`cloud://` fileID） |
| AI 服务 | TokenHub `hy-vision-2.0-instruct`（端点 `https://tokenhub.tencentmaas.com/v1/chat/completions`） |
| 地图/定位 | 腾讯位置服务 WebService API（逆地址解析） |
| 第三方 API | 微信 API（access_token / getwxacodeunlimit 小程序码） |
| 输出校验 | AJV（`internal-generateStory` 的 `package.json` 已声明依赖，代码暂未使用） |

## 项目结构

```
lvji-chengshu/
├── miniprogram/                # 小程序前端（12 页 + 13 组件 + 7 service + 6 utils）
├── cloudfunctions/             # 12 个云函数
├── docs/                       # 设计/交付文档（00~19）
├── scripts/migrate/            # 云环境迁移脚本（部署/环境变量/fileID 重映射）
├── project.config.json         # 小程序工程配置（AppID wxdb87c970af346122）
├── cloudbaserc.json            # CloudBase CLI 配置（envId lvji-d6g41bt719c85fe54）
├── tsconfig.json / typings.d.ts
├── package.json / package-lock.json
├── .eslintrc.js / .prettierrc
├── .gitignore / .env.example
└── README.md / PROJECT_STRUCTURE.md / CODEX_HANDOFF.md / ...（交接文档）
```

详细目录说明见 [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)。

## 快速开始

### 1. 安装依赖

```bash
cd lvji-chengshu
npm install
```

### 2. 编译前端（必须）

前端源码是 TypeScript，上传/预览的是编译出的 `.js`（`miniprogram/**/*.js` 已被 `.gitignore` 忽略，需从 `.ts` 生成）：

```bash
npm run build      # 等价于 npx tsc -p tsconfig.json（带 emit）
# 或 npx tsc -p tsconfig.json
```

> ⚠️ `tsc` 零错误不等于产物最新，上传前请确认目标 `.js` 已生成（本项目多次因产物落后踩坑）。

### 3. 打开小程序工程

用微信开发者工具打开本目录（`project.config.json` 已配置 `appid: wxdb87c970af346122`、`miniprogramRoot: miniprogram/`、`cloudfunctionRoot: cloudfunctions/`）。

### 4. 云开发环境

- 云环境 ID 硬编码于 `miniprogram/app.ts` 的 `globalData.cloudEnv`，当前为 **`lvji-d6g41bt719c85fe54`**（个人版）。
- 换环境需同步修改 `app.ts`、`cloudbaserc.json`，并重新部署全部云函数。

### 5. 创建数据库集合

首次部署后，调用云函数 `internal-init`（云端测试）一次性创建 11 个集合与 `app_config` 种子文档：
`users / albums / photos / photo_groups / album_stories / ai_jobs / share_links / geo_cache / app_config / daily_usage / events`

### 6. 部署云函数

在开发者工具中右键 `cloudfunctions/` 下每个函数 →「上传并部署（云端安装依赖）」。**务必带云端安装依赖**（不带会报 `Cannot find module 'wx-server-sdk'`）。

### 7. 配置云函数环境变量

在云开发控制台 → 云函数 → 函数配置 → 环境变量，按 `.env.example` 与 `docs/11-env-vars.md` 配置（真实值严禁入库）：

| 云函数 | 环境变量 |
|---|---|
| `internal-generateStory` | `TOKENHUB_API_KEY`、`MODEL_NAME=hy-vision-2.0-instruct`、`MODEL_ENDPOINT=https://tokenhub.tencentmaas.com` |
| `internal-processMeta` | `TENCENT_LBS_KEY`（可留空，留空则跳过地名解析） |
| `share` | `WX_APP_ID`、`WX_APP_SECRET` |

### 8. 配置云函数超时

`config.json` 里的 timeout **不生效**，需在控制台改：`internal-generateStory`=300s、`internal-processMeta`=300s、`export`=60s、`share`=20s。

## 构建 / 检查命令

```bash
npm run build     # tsc 编译（产出 miniprogram/**/*.js）
npm run tsc       # 仅类型检查（--noEmit）
npm run lint      # eslint miniprogram --ext .ts
npm run format    # prettier 格式化
```

## 环境变量配置

变量清单见 [.env.example](./.env.example)，详细说明见 [docs/11-env-vars.md](./docs/11-env-vars.md)。

## 当前已知问题

见 [CODEX_HANDOFF.md](./CODEX_HANDOFF.md) 的「技术债务」与 [CURRENT_FEATURES.md](./CURRENT_FEATURES.md) 的「部分完成 / 未接线」小节。要点：

- 13 个组件中 8 个未接线/废弃（caption-editor、chapter-card、confirm-sheet、job-progress、long-image-canvas、photo-card、style-picker、upload-item）。
- `photo_groups` 集合与「事实库快照」(`fact_base`) 设计存在但代码未落地，聚类在生成函数内存中完成、不落库。
- `internal-processVision` 是空壳桩，视觉理解实际内联在 `internal-generateStory`。
- 云函数 `common.ts` 在 6 处复制粘贴，改动需同步多处。
- 删除相册的级联清理不完整（仅软删 albums，依赖 internal-cleanup 异步清理且未覆盖全部子集合）。

## 开发状态

已发布上线（v1.0.x），AI 端到端链路已打通。详细功能完成度见 [CURRENT_FEATURES.md](./CURRENT_FEATURES.md)。
