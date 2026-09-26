# 项目结构说明

> 本文件描述「旅迹成书」的主要目录与文件用途，供后续开发者快速定位代码。

## 顶层

| 路径 | 用途 |
|---|---|
| `miniprogram/` | 微信小程序前端（TS 源码 + WXML/WXSS/JSON） |
| `cloudfunctions/` | 12 个云函数（后端，各含独立 `package.json` 与 `tsconfig.json`） |
| `docs/` | 设计 / 交付文档（00 索引、PRD、数据模型、API 契约、部署手册等） |
| `scripts/migrate/` | 云环境迁移脚本（批量部署 / 环境变量 / fileID 重映射） |
| `node_modules/` | 前端依赖（已被 .gitignore 忽略） |
| `project.config.json` | 小程序工程配置（appid、miniprogramRoot、cloudfunctionRoot、编译设置） |
| `project.private.config.json` | 开发者本机私有配置（libVersion 等，无敏感信息） |
| `cloudbaserc.json` | CloudBase CLI 配置（envId） |
| `tsconfig.json` | 前端 TS 编译配置（strict，outDir=miniprogram，rootDir=miniprogram） |
| `typings.d.ts` | 全局类型（`IAppOption`、`IUserInfo`） |
| `package.json` / `package-lock.json` | 前端依赖与脚本 |
| `.eslintrc.js` / `.prettierrc` | Lint / 格式化配置 |
| `.gitignore` / `.env.example` | Git 忽略规则 / 环境变量模板 |

## miniprogram/ 前端

```
miniprogram/
├── app.ts / app.json / app.wxss   # 全局入口：云初始化、登录、全局样式、页面注册表
├── sitemap.json                   # 微信收录规则（首页 / shared-view / * 允许）
├── pages/                         # 12 个页面
│   ├── index/                     # 首页 · 相册列表
│   ├── create-album/              # 创建 / 编辑相册
│   ├── album-detail/              # 相册详情（分组/任务/各操作入口）
│   ├── upload/                    # 照片上传（选原图→压缩→查重→并发上传）
│   ├── photo-review/              # 元数据确认（轮询 meta、三级降级徽标、手动补时间地点）
│   ├── story-generating/          # 生成进度（轮询任务）
│   ├── story-preview/             # 故事阅读（预览 + 导出入口 + 预取分享 token）
│   ├── story-edit/                # 故事编辑（章节/图说/单章重生成/拖拽排序/版本回退）
│   ├── share/                     # 分享设置（token + 海报 + 小程序码）
│   ├── shared-view/               # 游客只读浏览（token/scene 入口）
│   ├── privacy/                   # 隐私与数据管理（保留期 / 删除全部数据）
│   └── failure/                   # 通用失败页（静态）
├── components/                    # 13 个组件（实际仅 5 个被使用，见 CURRENT_FEATURES.md）
├── services/                      # API 调用层（7 个，统一走 utils/request.ts）
│   ├── auth.ts / album.ts / photo.ts / story.ts / share.ts / export.ts / privacy.ts
├── utils/                         # 工具（6 个）
│   ├── request.ts                 # 云函数调用封装（信封解包 / 错误码→文案 / errText）
│   ├── poll.ts                    # 任务轮询（指数退避 2s→10s，180s 超时，可取消）
│   ├── compress.ts                # 缩略图压缩 / 内容 hash（FNV-1a）
│   ├── exif-hint.ts               # 本地文件 mtime 兜底 / 日期格式化
│   ├── album-export.ts            # 导出核心（长图/PDF 版式、canvas 渲染、存相册、开 PDF）
│   └── share.ts                   # enableShare（showShareMenu + 朋友圈能力探测）/ safeTitle
└── types/index.ts                 # 共享类型 / 枚举 / API 出入参（编译产物 index.js）
```

## cloudfunctions/ 后端（12 个）

| 函数 | 职责 |
|---|---|
| `auth` | 登录建档 / 更新昵称 / 隐私同意（保留期校验） |
| `album` | 相册 CRUD（软删） |
| `photo` | 上传登记 + 查重 / meta 任务编排 / 列表 / 改元数据 / 排序 / 删除 / 取文件 |
| `story` | 生成 / 查询 / 编辑故事、任务状态、单章重生成、限流 |
| `share` | 分享链接 CRUD / 读分享 / 生成小程序码 |
| `privacy` | 删除全部用户数据 |
| `export` | 页图合成 PDF（pdf-lib） |
| `internal-init` | 一次性建 11 集合 + 种子 `app_config` |
| `internal-cleanup` | 定时清理（过期原图 / 软删物理清理 / 僵尸任务回收） |
| `internal-processMeta` | EXIF 解析 + 逆地址解析（三级降级 + geo_cache） |
| `internal-processVision` | 视觉理解（**空壳桩**，视觉理解实际内联在 generateStory） |
| `internal-generateStory` | 视觉理解（内联）+ 整本故事生成（TokenHub）+ 模板降级 + 聚类 |

每个云函数目录内含：`index.ts`（入口）、`index.js`（编译产物，用于部署）、`package.json` / `package-lock.json`（依赖）、`tsconfig.json`；部分含 `common.ts/js`（`loadAppConfig` + `writeEvent`，6 处复制）、`config.json`（`export`/`share` 的权限与超时声明）、`test/`、`usage.ts/js`。

## scripts/migrate/

| 文件 | 用途 |
|---|---|
| `deploy-all.ps1` / `deploy-yaomiao.ps1` | 批量部署云函数（PowerShell，含中文路径内联限制说明） |
| `set-fn-env-yaomiao.js` | 批量配置云函数环境变量 + 超时（密钥从本机环境变量读取） |
| `internal-remap/` | 旧环境 `cloud://lvji-*` fileID → 新环境的迁移云函数 |

## docs/ 设计文档

`00-INDEX.md`（索引）、`01-PRD`、`02-user-flows`、`03-pages-components`、`04-database-models`、`05-api-contracts`、`06-ai-schemas`、`07-metadata-degradation`、`08-mvp-tasklist`、`09-acceptance-tests`、`10-platform-checklist`、`11-env-vars`、`12-deploy-manual` / `12-launch-audit`、`13-launch-gap-analysis`、`14-ops-manual`、`15-regression-checklist`、`16-ip-and-compliance`、`17-app-feasibility`、`18-overseas-ios`、`19-cloud-env-migration`。

> ⚠️ 部分设计文档（04/06/13 等）描述的 `photo_groups` 落库、`fact_base` 事实库快照、独立 `internal-processVision` 视觉函数，在代码中**尚未落地**（见 CURRENT_FEATURES.md），阅读时以代码为准。
