# 03 — 页面与组件清单

## 1. 页面树（app.json pages）

```
pages
├── index/index              # 首页：相册列表
├── create-album/index       # 创建/编辑相册信息
├── album-detail/index       # 相册详情（照片墙 + 状态 + 入口）
├── upload/index             # 上传与处理进度
├── photo-review/index       # 元数据确认（三级降级交互）
├── story-generating/index   # 生成进度页（可离开）
├── story-preview/index      # 故事预览（成品阅读）
├── story-edit/index         # 故事编辑
├── share/index              # 分享设置
├── shared-view/index        # 分享浏览页（他人打开，只读）
├── privacy/index            # 隐私政策与数据管理
└── failure/index            # 通用失败/失效页（任务失败、链接失效）
```

TabBar：MVP 不设 TabBar（单线流程），首页即入口。

## 2. 页面详述

### 2.1 pages/index — 首页
- **元素**：头部（产品名 + 用户头像）、相册卡片列表（封面缩略图、名称、状态徽标、时间）、悬浮「+」按钮、空态插画+引导按钮
- **状态**：空态 / 正常 / 删除中的项置灰
- **交互**：下拉刷新；卡片点击进详情；长按卡片唤出删除/重命名

### 2.2 pages/create-album — 创建相册
- **元素**：相册名输入（必填 ≤ 20 字）、主题输入、活动背景（多行 ≤ 200 字）、人物关系（≤ 50 字）、强调内容（≤ 100 字）、希望避免的表达（≤ 100 字）、文风选择器（7 选 1：温暖纪实 / 轻松幽默 / 文艺克制 / 亲子成长 / 青春活力 / 简洁客观 / 自定义）
- **校验**：必填缺失时提交按钮置灰；字数实时统计
- **复用**：编辑模式（回填数据，提交走 updateAlbum）

### 2.3 pages/album-detail — 相册详情
- **元素**：相册信息区（名称/状态/统计）、照片宫格（含每张元数据徽标）、操作按钮组（继续上传 / 确认元数据 / 生成故事 / 查看故事 / 分享 / 删除）
- **状态驱动**（albums.status）：draft→显示上传+确认按钮；reviewing→确认入口高亮；generating→进度入口；done→故事+分享入口
- **交互**：宫格项点击进入单张照片元数据编辑

### 2.4 pages/upload — 上传与处理
- **元素**：已选照片列表（缩略图 + 进度条 + 状态角标 + 失败原因）、**实时计数器「已选择 X/50 张」**（顶栏常显）、总体进度（成功数/失败数/总数）、底部「继续添加」「重试失败项」「批量重试」「完成」按钮、隐私告知弹窗（首次）、**重复照片提示弹窗**
- **上传检查**：选择照片后自动检查格式（JPEG/PNG/HEIC）、大小（≤20MB）、损坏检测、重复检测；不通过项标红显示原因
- **状态**：等待 / 检查中 / 上传中(N%) / 失败(重试按钮+失败原因) / 已完成(处理中：解析中→图片理解中，阶段化进度展示)
- **数量约束**：达 50 张后「继续添加」点击弹出提示「已达 50 张上限，可删除或更换照片」，不进入选择器；系统不自动截断/丢弃/覆盖照片
- **交互**：离开页面不中断上传（后台任务提示）；删除照片后可继续补充上传

### 2.5 pages/photo-review — 元数据确认（核心交互页）
- **元素**：
  - 时间轴视图：按天分组的照片流，每张含时间、地点、来源徽标
  - 元数据卡片：照片 + 字段（时间/地点）+ 徽标（绿=EXIF、黄=推断、灰=未知、蓝=用户补充）+ 操作（采纳/修改/标为未知）
  - 置顶摘要条：`高置信 32 · 待确认 6 · 未知 2`
  - 底部「确认并生成」按钮
- **交互**：修改时间用 picker（日期+时间）；修改地点为城市+具体地点两级输入；未知项支持引导补填

### 2.6 pages/story-generating — 生成进度
- **元素**：阶段进度条（上传 → 解析 → 图片理解 → 排序与分组 → 生成故事 → 生成相册）、当前阶段说明、「正在分析第 X/Y 批照片」、预计处理时间（不承诺固定完成时间）、离开提示
- **交互**：允许返回首页，完成后服务通知/角标提示（MVP 用页面内轮询 + 首页状态刷新）

### 2.7 pages/story-preview — 故事预览
- **元素**：标题、序言、章节卡片（章标题 + 正文 + 照片横滑/瀑布 + 图说）、结尾、底部操作栏（编辑 / 分享 / 生成长图）
- **展示**：事实来源徽标仅在编辑模式显示，阅读模式纯净展示

### 2.8 pages/story-edit — 故事编辑
- **元素**：章节列表（可折叠）、每章（标题输入、正文多行编辑、图说编辑、重生成按钮、照片排序开关、**锁定开关**）、全局操作（整体重生成 / 恢复上一版本）
- **交互**：单段重生成显示 loading 遮罩；版本号展示；锁定段在整体重生成时跳过；恢复上一版本时保留用户手动修改标记

### 2.9 pages/share — 分享设置
- **元素**：有效期选择（7 天 / 30 天 / 永久）、当前链接状态（有效/已撤销）、开启分享按钮、撤销按钮、长图生成按钮、分享卡片预览

### 2.10 pages/shared-view — 分享浏览页（只读）
- **元素**：与 story-preview 阅读模式一致 + 底部「我也要做一本」转化引导
- **鉴权**：凭 share token 访问，无需登录（游客可读）；token 校验失败 → failure 页

### 2.11 pages/privacy — 隐私与数据管理
- **元素**：隐私政策全文、数据保存期限设置（90 天/永久）、原图管理说明、「删除全部数据」红色入口（滚动确认 + 输入「删除」）

### 2.12 pages/failure — 通用失败页
- **参数化**：错误类型（任务失败/链接失效/网络异常）+ 对应操作按钮

## 3. 共享组件清单

| 组件 | Props | 用途 |
|------|-------|------|
| `photo-card` | photo, showMeta, editable | 照片卡：缩略图 + 元数据徽标 + 选择态 |
| `meta-badge` | source: 'exif'\|'inferred'\|'user'\|'unknown', confidence? | 来源徽标（绿/黄/蓝/灰），推断附置信度百分比 |
| `upload-item` | photo, progress, status, failReason, onRetry, onBatchRetry | 上传列表项（进度条+失败原因+单张/批量重试） |
| `duplicate-dialog` | photos[], onKeep, onRemove | 重复照片提示弹窗（逐张选择保留或删除） |
| `chapter-card` | chapter, mode: 'read'\|'edit', onRegenerate, onLock, locked | 章节卡片（阅读/编辑双模式 + 锁定开关） |
| `caption-editor` | value, photoId, onSave | 图说行内编辑器 |
| `job-progress` | job: {stage, percent, message} | 异步任务阶段进度 |
| `confirm-sheet` | title, items[], danger | 危险操作确认底部弹层（列出删除项） |
| `empty-state` | icon, text, actionText, onAction | 空态占位 |
| `style-picker` | value, options, onChange | 文风选择卡片组 |
| `long-image-canvas` | story, canvasId | 长图离屏渲染（type=2d） |
| `privacy-notice` | visible, onAgree | 首次上传隐私告知弹窗 |

## 4. 前端目录结构（骨架阶段实现）

```
miniprogram/
├── app.ts / app.json / app.wxss
├── pages/...（上表）
├── components/...（上表）
├── services/          # API 调用层（按云函数域拆分）
│   ├── album.ts / photo.ts / story.ts / share.ts / privacy.ts
├── types/             # 与云函数共享的类型定义（见 04/05/06）
├── utils/
│   ├── exif-hint.ts   # 本地时间兜底读取（文件时间）
│   ├── compress.ts    # 缩略图压缩
│   └── poll.ts        # 任务轮询（指数退避）
└── assets/
cloudfunctions/        # 见 05 API 契约
```
