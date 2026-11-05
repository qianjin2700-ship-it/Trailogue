# TRAILOGUE V2 — UI / UX 架构

> 阶段：Phase A（审计 + 目标结构 + 决策记录）
> 前提：只审计与设计，**不改 1.0 页面**。

---

## 1. 现状导航图

```
(auth)/login
    │ Sign in with Apple
    ▼
(app)/index  ──►  (app)/trips                     [My Trips]
                     │  ├─ Create trip ─► trips/new
                     │  └─ Settings    ─► settings
                     │
                     ├─ 卡片点击 ─► trips/[id]        [Trip]
                     │                ├─ Edit trip   ─► trips/edit
                     │                ├─ Delete trip
                     │                ├─ Set creative requirements ─► trips/creative
                     │                ├─ Open current story ─► trips/story
                     │                └─ 照片列表（每张 5 个操作）
                     │
trips/creative ── 生成 ──► trips/story            [Travel Story]
                              ├─ Edit story（就地进入编辑态）
                              ├─ Book preview ─► trips/book
                              ├─ History & compare ─► trips/story-versions
                              └─ Adjust requirements & regenerate ─► trips/creative
                              │
trips/book ── [Book Preview]  [Story | Magazine]
                              ├─ Edit story ─► trips/story      ← 与上一行的按钮同名
                              ├─ Export PDF
                              └─ Share
```

导航实现：单个 `Stack`，`headerBackTitle: 'Back'`，页面标题固定为 `My Trips / Trip / Travel Story / Book Preview / Settings`。

---

## 2. 审计结论

### 2.1 已确认待办：重复的 Edit story 入口

| 位置 | 当前标签 | 实际行为 |
|---|---|---|
| `trips/book.tsx:253` | `Edit story` | `router.push('/trips/story')` → 进入**只读**故事页 |
| `trips/story.tsx:121` | `Edit story` | `setEditing(true)` → **真正**进入编辑态 |

用户实际要**点两次同一个名字的按钮**才能开始改字。这是 1.0 收口时把 `Edit story text` 改成 `Edit story` 后暴露出来的（原本两个名字不同，尚可分辨）。

**2.0 建议方案（推荐 A）**

| 方案 | 做法 | 优点 | 代价 |
|---|---|---|---|
| **A（推荐）** | Book Preview 移除编辑入口；Story 页按钮保留一个 `Edit`，Book Preview 顶部返回即可回到 Story | 职责清晰：Book Preview = 成品查看/导出/分享，Story = 内容生产 | 用户在 Book Preview 想改字需返回一步 |
| B | Book Preview 保留唯一入口，直达编辑态（`?mode=edit`）；Story 页不再显示 Edit | 少一次点击 | Story 页从其它路径进入时没有编辑入口，需要额外分支 |

> 若选 A，需同步改 1 个 UI 测试（`book-preview-screen-test.tsx` 断言了 `Edit story` 存在）。

### 2.2 页面级问题清单

| # | 页面 | 问题 | 严重度 | 2.0 处理 |
|---|---|---|---|---|
| 1 | Book Preview | `Story` 视图中 `14 photos · story text` 语义含糊（"story text" 不是用户语言） | 中 | 改为 `14 photos · 6 chapters` |
| 2 | Book Preview | `Magazine` 视图显示 `N pages`，与 Story 视图信息类型不一致 | 低 | 统一为「内容量」表达，如 `6 chapters · 14 photos` |
| 3 | Book Preview | 首屏 `error && !book` 只渲染一行红字，**无 Retry** | 中 | 补一个 `Retry` 按钮（与 trip detail 一致） |
| 4 | Book Preview | 每次点 Share 都新建一条 `share_links` 记录（同一旅行可产生多条） | 低（数据噪音） | 2.0 复用「当前有效链接」 |
| 5 | Travel Story | `CURRENT V1 · 1 SAVED VERSION` 是开发术语 | 中 | 改为 `Version 1 of 1` 或移入 History 页 |
| 6 | Travel Story | 只读态与编辑态共用同一批样式，编辑态无「未保存」提示 | 中 | 编辑态加脏标记与离开确认 |
| 7 | Travel Story | 空状态标题 `Turn these photos into a story` 是好文案，但按钮文案 `Set requirements & generate` 偏工程 | 低 | 改为 `Create story` |
| 8 | Trip | 每张照片下 5 个操作（Delete / Add note / Add place / Set as cover / 日期） | — | **保持现状**（用户已裁定：方便单张修改） |
| 9 | My Trips | 顶部 `Create trip` + `Settings` 两个裸文字链接 | — | **保持现状**（用户已裁定：喜欢简洁） |
| 10 | Trip | `Delete trip` 与 `Edit trip` 同排且同为边框按钮，危险操作无视觉隔离 | 中 | Delete 移入二次确认 + 红色文字按钮 |
| 11 | 全局 | 无统一组件目录，按钮/空态/错误态在各页面重复实现（8+ 处） | 高 | 建 `components/v2`（本轮先建渲染层，UI 组件下一轮） |
| 12 | 全局 | 加载态全是裸 `ActivityIndicator`，无骨架/占位 | 低 | 2.0 中期引入骨架屏 |

### 2.3 状态覆盖检查

| 页面 | Loading | Empty | Error | 备注 |
|---|---|---|---|---|
| My Trips | ✅ | ✅ | ✅（含刷新失败条） | 完整 |
| Trip | ✅ | ✅ | ✅（含 Retry） | 完整 |
| Travel Story | ✅ | ✅（引导生成） | ✅ | 缺「未保存」态 |
| Book Preview | ✅ | — | ⚠️ 首屏错误无 Retry | 需补 |
| Settings | ✅ | — | ✅ | 完整 |

### 2.4 不得回退的功能（Phase A 冻结）

以下都是「看起来可删、实际有人用」的东西，2.0 重构时**只允许改视觉，不允许删能力**：

- 照片级 5 个操作（备注、地点、封面、删除、拍摄日期）
- 故事版本历史与对比
- 创作要求（写作风格 / 长度 / 编排 / 避免表达）
- 分享链接撤销（Revoke）
- 账号删除（含 R2 清理）

---

## 3. 目标结构（2.0）

### 3.1 分层

```
app/**                    ← 路由与编排（薄）
  └─ components/v2/**     ← 可复用 UI 组件（Button / EmptyState / ErrorState / Skeleton）
       └─ features/v2/**  ← 文档模型 + 版式引擎 + HTML 渲染（纯函数，可测）
            └─ features/books/**  ← 1.0 遗留实现（逐步退场）
```

约束：

- `features/v2/**` **不得 import 任何 React / React Native**，必须是纯 TS 函数。
  理由：这样才能同时服务三条输出（WebView、PDF、分享页），并且能用 jest 直接断言。
- `app/**` 不直接拼 HTML 字符串。

### 3.2 一套模型，三种输出

```
StoryContentDTO + Photo[]
        │
        ▼  compose（确定性版式引擎）
  StoryDocument / MagazineDocument   （纯 JSON，可存库、可 diff、可测试）
        │
        ├─► renderHtml(document)  ──► WebView 预览
        ├─► renderHtml(document)  ──► expo-print → PDF
        └─► renderHtml(document)  ──► 分享页（服务端复用同一套引擎）
```

这是 2.0 最重要的一条架构决策：**视觉只写一次**。1.0 里同一套设计写了四遍（App Story、App Magazine、分享 Story、分享 Magazine），任何一次微调都要改四处，且已经出现漂移（App 正文 16.5px / 分享网页 16.5px 是巧合对齐，靠人工同步）。

### 3.3 Book Preview 目标布局

```
┌────────────────────────────────────────┐
│  ← Book Preview                         │
├────────────────────────────────────────┤
│   [  Story  ][  Magazine  ]  ← 分段控件 │
├────────────────────────────────────────┤
│  6 chapters · 14 photos                 │
│                                         │
│         （内容预览区，占满剩余高度）        │
│                                         │
├────────────────────────────────────────┤
│  [   Export PDF   ]   [   Share   ]     │
└────────────────────────────────────────┘
```

- 分段控件吸顶，切换不重载数据（1.0 已做到，保留）。
- 内容元信息随形态变化但表达统一。
- 主操作用实心按钮（Export PDF），次操作用描边（Share）—— 保持 1.0 已有的视觉权重。
- 编辑入口按 2.2 方案 A 移除。

---

## 4. 设计令牌（与 1.0 视觉同源）

取自 1.0 代码中的高频色值，2.0 沿用，不做品牌换血：

| Token | 值 | 用途 |
|---|---|---|
| `paper` | `#F7F4EE` | 页面底色 |
| `paperAlt` | `#EAE3D8` | 预览背板 |
| `surface` | `#F4EFE7` | 控件区 |
| `ink` | `#24211D` | 主文字 / 主按钮 |
| `inkSoft` | `#39342E` | 正文 |
| `muted` | `#8B8177` | 次要信息 |
| `leather` | `#7D5C3C` | 强调 / 次级按钮描边 |
| `leatherDeep` | `#5D4631` | 选中态 |
| `vermillion` | `#A33B2B` | 错误 / 危险 |
| `rule` | `#D8CDBE` | 分隔线 |
| `magazineInk` | `#14283B` | Magazine 封面底色 |
| `magazineAccent` | `#D7643D` | Magazine 强调条 |

字号（App 内 UI）：标题 36/28/25、章节标题 25、正文 17、次要 13、微 12。
字号（Story 阅读：见 STORY_DESIGN）：正文 16.5、行高 1.75。

---

## 5. 决策记录

| # | 决策 | 依据 | 日期 |
|---|---|---|---|
| D1 | 只保留 Story / Magazine 两种形态 | 产品定位 | 2026-11-05 |
| D2 | 视觉只实现一次（文档模型 + 渲染器） | 现状 4 处重复实现 | 2026-11-05 |
| D3 | `features/v2/**` 禁止 import React | 需服务 WebView/PDF/分享三端 | 2026-11-05 |
| D4 | 照片 5 个操作保留 | 用户裁定（2026-11-03） | 2026-11-03 |
| D5 | My Trips 顶部保持两个文字链接 | 用户偏好简洁 | 2026-11-03 |
| D6 | 故事语言跟随创建时输入语言 | 用户裁定：非 bug | 2026-11-03 |
| D7 | Phase A 不动 1.0 页面 | 1.0 正在审核 | 2026-11-05 |

---

## 6. Phase A 实际交付的 UI 工作

| 项 | 状态 |
|---|---|
| 导航结构审计 | ✅ 本文第 1–2 节 |
| 状态覆盖审计 | ✅ 本文 2.3 |
| 设计令牌固化 | ✅ 本文第 4 节 + `features/v2/tokens.ts` |
| 页面级改动 | ⛔ **未做**（1.0 审核中，且要求不扩大范围） |
| 组件系统代码 | ✅ Story / Magazine 文档模型 + 渲染器（未接入路由） |
| 页面预览 | ✅ `docs/v2/previews/*.html`（静态可打开） |
