# 当前功能完成度

> 依据实际代码盘点（已排除文档宣称但代码未实现的部分），供后续开发者判断可继续做什么、哪些不能动。

## ✅ 已完成（完整实现）

### 后端（云函数）
- **auth**：登录建档、更新昵称、隐私同意（保留期校验）
- **album**：相册创建 / 编辑 / 列表 / 详情 / 删除（软删）
- **photo**：上传登记 + 内容 hash 查重、meta 任务编排、照片列表、改元数据、排序、删除、取文件
- **internal-processMeta**：EXIF 解析（拍摄时间/GPS）+ 逆地址解析（腾讯位置服务，三级降级 + `geo_cache`）
- **internal-generateStory**：视觉理解（内联）+ TokenHub 整本故事生成 + JSON 解析容错 + 模板降级 + 聚类分组
- **story**：故事生成 / 查询 / 编辑 / 单章重生成 / 版本管理 / 限流
- **share**：分享创建 / 撤销 / 游客读取 / 小程序码生成（openapi 优先 + HTTP 降级）
- **export**：页图合成 PDF（pdf-lib）
- **privacy**：删除全部用户数据
- **internal-init**：建 11 集合 + 种子 `app_config`
- **internal-cleanup**：过期原图清理 + 软删物理清理 + 僵尸任务回收

### 前端
- 12 个页面全部接线；7 个 service 层封装完整；登录、相册、上传、元数据确认、生成、预览、编辑、分享、隐私全链路可用
- 导出长图 / PDF、海报绘制（canvas + 小程序码）、朋友圈/转发分享（`enableShare` + 能力探测）
- 拖拽排序（`sortable-grid`）、查重弹窗、隐私告知、三级元数据来源徽标

## ⚠️ 部分完成（桩 / 半成品）

| 位置 | 说明 |
|---|---|
| `cloudfunctions/photo/index.ts` `handleConfirmMeta` | 返回 `fact_base_id: 'placeholder'`，`// TODO: 聚类算法 + 生成事实库快照`；事实库快照未落库 |
| `cloudfunctions/internal-processVision/index.ts` | 空壳桩：`processVisionBatch` 内 `// TODO` + 写死 `error: 'Vision processing not yet implemented'`；视觉理解实际在 internal-generateStory 内联完成 |
| `cloudfunctions/album/index.ts` `handleDelete` | 仅软删 albums，`// TODO: 级联删除…由 internal-cleanup 异步处理`（cleanup 未覆盖全部子集合） |
| `pages/story-edit` `onRegenerateAll` | 「整体重生成」`// TODO` → toast「功能开发中」 |
| `pages/story-generating` `onRetryFailed`/`onRemoveFailed` | `// TODO` → toast「重试/移除功能开发中」 |
| `components/long-image-canvas` | `// TODO: 完整渲染逻辑`，仅渲染标题 |

## 🧱 仅 UI（未接线 / 废弃）

13 个组件中 **8 个未使用**（死代码，不影响运行）：

- `caption-editor`（图说行内编辑器）
- `chapter-card`（章节卡片）
- `confirm-sheet`（危险操作底部确认层）
- `job-progress`（异步任务进度，内容空壳）
- `long-image-canvas`（长图离屏渲染，桩）
- `photo-card`（照片卡）
- `style-picker`（文风选择，create-album 页内自己实现了一套）
- `upload-item`（上传列表项，upload.wxml 里只是 CSS class 非组件）

实际被使用的 5 个：`empty-state`、`privacy-notice`、`duplicate-dialog`、`sortable-grid`、`meta-badge`。

## 📌 TODO（代码内显式标记）

- 聚类算法 + 事实库快照生成（photo `handleConfirmMeta`）
- 视觉理解独立函数落地（internal-processVision）
- 相册删除的完整级联清理
- 整体重生成 / 失败重试 / 移除失败照片（story-generating / story-edit）
- 长图完整渲染逻辑（long-image-canvas）

## 🗑 已废弃 / 设计未落地

- `photo_groups` 集合：**从未写入**，仅在 album 读取、privacy 删除；聚类在 internal-generateStory 内存中完成、不落库
- `fact_base` / `fact_base_snapshot_id`：**从未写入**（始终 null/占位），「事实库快照」概念未实现
- `internal-generateStory` 的 `ajv` 依赖：`package.json` 声明但代码未使用
- 前端 `scope.userLocation` 权限：已声明，但无 `wx.getLocation`/`wx.chooseLocation`（定位靠 EXIF GPS）
- 订阅消息（`requestSubscribeMessage`）：完全未实现
- 文档 `04/06/13` 描述的部分设计（photo_groups 落库、fact_base、独立视觉函数）与代码不符

## 相关说明

- 限流配置（`generationLimitEnabled` 等）代码已实现但默认 `false`（休眠），用量记录（daily_usage/events）始终写入。
- 长任务触发已从「云端 fire-and-forget 自调用」改为「前端直调 internal-*」（见 CODEX_HANDOFF.md 技术债务 #4）。
