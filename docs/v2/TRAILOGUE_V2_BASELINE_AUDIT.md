# TRAILOGUE V2 — 基线审计（Baseline Audit）

> 阶段：Phase A（只读盘点 + 分支隔离 + 设计文档 + 纯新增前端组件）
> 生成时间：2026-11-05
> 审计对象：Trailogue 1.0 提交 App Store 审核的那份代码

---

## 0. 结论摘要

| 项 | 结论 |
|---|---|
| 1.0 待审基线 | 分支 `feature/ios-app`，commit `b469523`，与 GitHub 远端完全一致 |
| 2.0 开发分支 | 从 `b469523` 切出 `feature/v2`（本次新建，未推送远端） |
| 1.0 是否被改动 | **否**。本轮所有改动都是新增文件（`docs/v2/**`、`ios-app/src/features/v2/**`、新增测试），未修改任何 1.0 运行时代码 |
| 生产数据库 | 未触碰，无迁移 |
| `/v1` API 行为 | 未触碰 |
| Railway 部署 | 未触发 |
| EAS Build | 未触发 |

一句话：**2.0 现在是一条与 1.0 完全隔离的分支，1.0 的待审二进制、线上 API、数据库、R2 对象、分享链接全部保持原样。**

---

## 1. Git 基线

```
分支：feature/ios-app  →  b469523  feat(api): add public /privacy page
远端：origin/feature/ios-app = b469523（本地与远端一致）
工作区：干净（无未提交改动）
新分支：feature/v2（基于 b469523）
```

关键提交链（1.0 收口全过程）：

| Commit | 内容 |
|---|---|
| `bbb6116` | 发布版本锁定 1.0.0 |
| `c3b83d3` | EAS `appVersionSource: remote` |
| `e82513e` | 正式 App Icon 集成 |
| `c81e163` | 上线收口：分享所见即所得 / 文案 / 排版 / Draft / Sign out |
| `19b34f0` → `fcb3a74` | EAS submit profile 补 `ascAppId`（含一次层级修正） |
| `b469523` | 公开 `/privacy` 页 |

**1.0 基线冻结标记**：任何 2.0 分支上的改动都不得 merge 回 `feature/ios-app`，直到 1.0 审核结论落定。

---

## 2. 仓库拓扑

```
Trailogue/
├── apps/api/                  # 线上后端（Railway 部署的 Docker 镜像）
│   └── src/
│       ├── app.ts             # Fastify 装配：路由注册 / 鉴权 / 错误处理
│       ├── routes/            # HTTP 边界层（9 个文件）
│       ├── modules/           # 业务层（auth/photos/shares/stories/trips/users）
│       └── plugins/           # 基础设施（配置、日志、鉴权）
├── packages/
│   ├── config/                # 环境变量集中校验
│   ├── contracts/             # 前后端共享 DTO + zod 校验（单一事实源）
│   ├── database/              # drizzle schema / 仓储 / 连接池
│   └── domain/                # 纯领域规则（状态机、照片排序等）
├── ios-app/                   # Expo iOS 客户端（1.0 交付物）
│   └── src/
│       ├── app/               # expo-router 文件路由
│       ├── api/               # 类型化 HTTP 客户端（8 个模块）
│       ├── features/          # 业务渲染与算法（books/photos/stories/trips）
│       ├── composition/       # 依赖装配（services 单例）
│       ├── domain/            # 客户端领域模型
│       └── services/          # 平台能力（Apple 登录等）
├── cloudfunctions/            # 微信小程序云函数（1.0 iOS 不使用）
├── miniprogram/               # 微信小程序（历史资产，1.0 iOS 不使用）
├── docs/                      # 1.0 设计与运维文档（00~18）
└── Dockerfile                 # Railway 构建入口
```

**注意**：`cloudfunctions/` 与 `miniprogram/` 是更早的微信小程序形态，**与 1.0 iOS / Railway / Neon / R2 链路无关**。2.0 不在其上做任何工作，也不删除（避免无谓的仓库震荡）。

---

## 3. 运行时架构

```
┌──────────────────────────────┐
│  iOS App (Expo / React Native)│
│                              │
│  expo-router 页面             │
│    ↓                         │
│  features/* 渲染与算法         │
│    ↓                         │
│  composition/services（DI）    │
│    ↓                         │
│  api/* 类型化客户端            │
└───────────┬──────────────────┘
            │ HTTPS + Bearer session token
            ▼
┌──────────────────────────────┐
│  Fastify API (Railway/Docker)│
│  routes → modules → repositories
│    │              │          │
│    │              ├─→ Neon Postgres (drizzle)
│    │              └─→ Cloudflare R2 (presigned URL)
│    └─→ DeepSeek Chat Completions（故事生成）
└──────────────────────────────┘
            ▲
            │ GET /share/:token（公开 HTML，无鉴权）
            │
      分享链接接收者（手机浏览器）
```

三条**独立**的产物输出路径（这是 2.0 必须正视的现状）：

| 输出 | 渲染位置 | 技术 |
|---|---|---|
| App 内 Story / Magazine 预览 | 客户端 | `WebView` + 本地生成的 HTML 字符串 |
| PDF 画册 | 客户端 | `expo-print` 的 `printToFileAsync` → `expo-sharing` |
| 分享网页 | 服务端 | Fastify 直接返回 HTML 字符串 |

> 关键结论：**同一份视觉设计目前存在 4 处实现**（`storyReading.ts`、`bookLayout.ts` 的 CSS、后端 `renderSharedStoryHtml`、后端 `renderSharedMagazineHtml`）。2.0 的组件化首先要解决的就是这个「四处实现、各自漂移」的问题。

---

## 4. 客户端架构

### 4.1 路由表（expo-router）

| 路由 | 文件 | 职责 |
|---|---|---|
| `(auth)/login` | `app/(auth)/login.tsx` | Sign in with Apple 入口 |
| `(app)/index` | `app/(app)/index.tsx` | 启动分流（已登录 → My Trips） |
| `(app)/trips` | `trips/index.tsx` | My Trips 列表（顶部 Create trip / Settings） |
| `(app)/trips/new` | `trips/new.tsx` | 新建旅行 |
| `(app)/trips/[id]` | `trips/[id].tsx` | 旅行详情 + 照片列表 + 每张照片操作 |
| `(app)/trips/edit` | `trips/edit.tsx` | 编辑旅行信息 |
| `(app)/trips/creative` | `trips/creative.tsx` | 创作要求 & 触发生成 |
| `(app)/trips/story` | `trips/story.tsx` | 故事编辑器（CURRENT V1 术语、逐章编辑） |
| `(app)/trips/story-versions` | `trips/story-versions.tsx` | 版本历史与对比 |
| `(app)/trips/book` | `trips/book.tsx` | **Book Preview**：Story \| Magazine 切换 + Export PDF + Share |
| `(app)/settings` | `settings.tsx` | 资料 / 照片保留期 / 隐私同意 / Sign out / 删除账号 |

### 4.2 分层约束（实际代码中的形态）

- `api/*` 只负责 HTTP + 错误规范化（`AppError`），不含业务判断。
- `features/*` 是纯逻辑或纯渲染（`bookLayout.ts`、`photoGeometry.ts`、`pdfExport.ts`、`storyReading.ts`），**不直接依赖 React 状态**，因此可以被单元测试直接覆盖 —— 这是 2.0 组件系统可以沿用的最大优点。
- `composition/services.ts` 做单例装配，页面只 import `services`，不 new 客户端。
- 页面组件（`app/**`）同时承担 UI 与编排，**没有独立的 `components/` 目录** —— 这是 2.0 要补的第一层结构。

### 4.3 当前 Story / Magazine 的真实实现

`book.tsx` 第 51-56 行有一条**首发期硬约束**：

```ts
// 首发版只提供 Magazine 一种画册排版：不读取历史保存的暖回忆/极简布局，
const magazineBook: BookPreviewDTO = { ...nextBook, bookStyle: 'travel_magazine', layout: {} };
```

含义：

- 线上 1.0 **只会**渲染 `travel_magazine` 一种画册风格；
- 数据库里 `warm_memoir` / `minimalist` 两套 CSS 与版式引擎代码**仍然存在**（`bookLayout.ts` 约 600 行仍保留三套分支），但用户不可达；
- 因此 2.0 清理旧模板时，**删除的是死代码，不是功能**。这是安全的，但要等 1.0 过审后再做（避免影响待审二进制的可复现性）。

---

## 5. API 架构

### 5.1 端点清单（23 条）

| 分组 | 端点 |
|---|---|
| 系统 | `GET /health`、`GET /ready`、`GET /privacy` |
| 鉴权 | `POST /v1/auth/apple`、`GET /v1/users/me`、`DELETE /v1/users/me` |
| 旅行 | `GET /v1/trips`、`POST /v1/trips`、`GET/PATCH/DELETE /v1/trips/:id`、`PATCH /v1/trips/:id/cover`、`PUT /v1/trips/:id/creative-requirements` |
| 照片 | `GET /v1/trips/:tripId/photos`、`POST .../photos/uploads`、`POST .../photos/:photoId/complete`、`PATCH .../photos/:photoId`、`DELETE .../photos/:photoId`、`PUT .../photos/order` |
| 故事 | `GET .../story`、`POST .../story/generate`、`GET/POST .../stories`、`POST .../stories/:storyId/restore` |
| 画册 | `GET .../book`、`PUT .../book/layout` |
| 分享 | `POST /v1/trips/:tripId/shares`、`DELETE /v1/shares/:shareId`、`GET /v1/shared/:token` |
| 公开网页 | `GET /share/:token?view=story|magazine` |

### 5.2 鉴权

- Apple identity token 由 `jose` 校验（JWKS + nonce），`appleIdentityVerifier` 只信 JWT 里的 claim。
- 命中 `user_identities(provider, provider_user_id)` 则复用用户，否则建新用户。
- 会话：服务端只存 `sessions.token_hash`（sha256），明文 token 只回给客户端一次。Bearer 中间件比对 hash。
- **未做 Apple token revoke**（已记录为技术债，本轮不动）。

### 5.3 错误与日志

- 类型化 `AppError` + Fastify 全局错误处理，客户端只看到 `{ error: { code, message } }`。
- 结构化日志并携带 request id（Fastify 内置）。

---

## 6. 数据库（Neon Postgres / drizzle）

9 张表，全部以 `user_id` 为外键并 `ON DELETE CASCADE`：

| 表 | 作用 | 关键列 |
|---|---|---|
| `users` | 账号 | `display_name`、`email`、`retention_days`、`privacy_agreed_at` |
| `user_identities` | 第三方身份 | `provider`、`provider_user_id`（Apple sub）、唯一索引 |
| `sessions` | 会话 | `token_hash`、`expires_at`、`revoked_at` |
| `trips` | 旅行 | `status`(draft/…)、`destination_*`、`start_date`/`end_date`、`creative_requirements`(jsonb)、`writing_style` |
| `photos` | 照片 | `storage_key`、`thumbnail_key`、`width`/`height`、`sort_order`、`vision`(jsonb)、`caption`、`location_name` |
| `stories` | 故事版本 | `content`(jsonb = `StoryContentDTO`)、`version`、`actual_language`、`locked_chapter_ids` |
| `books` | 画册 | `book_style`、`layout`(jsonb)、`pdf_storage_key`（当前未使用） |
| `share_links` | 分享 | `token_hash`、`expires_at`、`revoked_at`、`visit_count` |
| `jobs` | 异步任务 | `type`、`payload`、`status`、`attempts`、`run_after` |

**2.0 相关的重要事实**：

- `photos.width/height` 已存在 → 版式引擎可以**基于真实宽高比**做构图决策，不需要新增列。
- `stories.content` 是 JSONB，`StoryContentDTO` 结构演进**不需要 DDL**（新增可选字段即可），这是 2.0 内容模型能低成本扩展的前提。
- `books.book_style` 当前只有 `travel_magazine` 可达（见 4.3）。
- `books.pdf_storage_key` 从未写入 —— PDF 全程在客户端生成，服务端不存 PDF。

---

## 7. 存储（Cloudflare R2）

- 上传：客户端向 API 申请 presigned PUT，直传 R2，再调 `.../complete` 落库。API 不经手文件字节。
- 读取：`storage.createReadUrl(storageKey, ttl)` 生成 presigned GET，TTL 短时效。
- 删除：账号删除时 `listStorageKeysForUser` 枚举 `storage_key` + `thumbnail_key`，每批 5 个删除。
- **风险点（已知）**：删 R2 与删 DB 不在同一事务，先 R2 后 DB。已记录为技术债。

---

## 8. AI 链路

```
creative requirements (trips.creative_requirements)
  + trip 元信息（标题/目的地/日期/背景/人物/亮点）
  + 照片元信息（时间、地点、vision 描述，若模型支持）
        ↓
prompt builder（含语言策略、事实约束、标点约束）
        ↓
DeepSeek Chat Completions（JSON 输出）
        ↓
zod 校验 → StoryContentDTO（title/subtitle/preface/chapters/epilogue/shareSummary/meta）
        ↓
stories.content（jsonb，版本自增）
```

- `meta.visionAvailable` 决定是否降级（仅用元信息生成），降级时 `degraded=true`，UI 有提示条。
- `meta.actualLanguage` 是**创建旅行时输入语言**的结果，不是自动猜的（用户已确认这是预期行为，2.0 不改）。
- **2.0 原则**：AI 只输出**内容**（段落、引语候选、图片分组建议），**不输出像素级版式**。版式由前端引擎根据内容 + 照片宽高比决定。

---

## 9. 分享链路

```
POST /v1/trips/:tripId/shares  → 生成随机 token，落库 sha256(token_hash)，返回明文 URL
客户端拼 ?view=story|magazine → 调 iOS 系统 Share Sheet
接收者打开 /share/:token
  → resolve(token)：hash 比对 → 校验 revoked_at / expires_at → visit_count++
  → view=magazine ? renderSharedMagazineHtml : renderSharedStoryHtml
  → 返回 text/html（无鉴权、无 Cookie、无 JS 依赖）
```

约束（2.0 必须保持）：

- URL 形态 `/{host}/share/{token}` 不变；
- `view` 为**新增可选 query**，缺省 = story（向后兼容 1.0 已发出的链接）；
- 分享页**不得**依赖登录、Cookie 或客户端 JS 才能看内容。

---

## 10. PDF 链路

```
book.tsx  exportPdf()
  1. 重新拉照片（20s 超时）
  2. materializeBookPhotos()：逐张下载 → 压缩到长边 1600 / q0.72 → data URI（并发 3，超时兜底）
  3. renderBookHtml(document, photos) → 完整 HTML（@page Letter，215.9×279.4mm）
  4. expo-print printToFileAsync → 缓存 PDF
  5. expo-sharing shareAsync（系统 Share Sheet：AirDrop / Mail / Files / 微信…）
```

- 页面尺寸固定 Letter（非 A4），2.0 若要改尺寸会改变已有 PDF 观感 —— **列为破坏性变更，需显式决策**。
- 单张失败会被跳过并在 UI 提示「N 张照片未能包含」，不阻塞整体导出。

---

## 11. 1.0 冻结约束（2.0 不得越界）

| 约束 | 说明 |
|---|---|
| Bundle ID | `com.qianjin2700.trailogue` 不变 |
| 版本号 | 1.0.0 不变（2.0 才升 2.0.0） |
| 生产数据库 | Phase A 不做任何 DDL |
| `/v1` 行为 | 不删除、不改名、不改语义；只允许**新增可选字段** |
| 分享 URL | `/share/{token}` 契约不变 |
| R2 key 布局 | 不变 |
| Apple 登录 / 删号 | 不改（revoke 缺失是已登记的待办） |
| Railway | 不重新部署 |
| EAS | 不触发 production build |

---

## 12. 2.0 可安全改动的边界（本轮已执行的部分）

✅ 允许且已做：

- 新建 `docs/v2/**` 设计文档；
- 新建 `ios-app/src/features/v2/**` 纯前端、纯函数模块（**未被任何 1.0 页面引用**）；
- 新增测试文件；
- 新增 mock 数据。

❌ 明确没做：

- 没改 `app/**` 任何页面；
- 没改 `features/books/*`（1.0 正在用）；
- 没改 `packages/contracts`（1.0 二进制依赖其类型与校验）；
- 没改 `apps/api`；
- 没提交任何迁移。

> 「没被任何 1.0 页面引用」这一点可验证：`grep -r "features/v2" ios-app/src/app` 无结果。

---

## 13. 已登记的技术债（本轮不处理）

| # | 事项 | 影响 | 状态 |
|---|---|---|---|
| 1 | Apple token revoke 缺失（5.1.1(v)） | 审核风险，非功能问题 | 用户已确认暂缓，等指令 |
| 2 | 删号 R2/DB 非事务 | 极端情况下数据不一致 | 同上 |
| 3 | 视觉设计 4 处重复实现 | 改一次要改四处，易漂移 | **2.0 组件系统要解决的核心问题** |
| 4 | `bookLayout.ts` 三套模板中两套不可达 | 死代码约 300 行 | 1.0 过审后清理 |
| 5 | `books.pdf_storage_key` 未使用 | 无功能影响 | 2.0 决定是否做服务端 PDF |

---

## 14. Phase A 交付物清单

| 文件 | 说明 |
|---|---|
| `docs/v2/TRAILOGUE_V2_BASELINE_AUDIT.md` | 本文 |
| `docs/v2/TRAILOGUE_V2_PRODUCT_SPEC.md` | 产品定位与范围 |
| `docs/v2/TRAILOGUE_V2_UI_ARCHITECTURE.md` | UI/UX 审计与目标结构 |
| `docs/v2/TRAILOGUE_V2_STORY_DESIGN.md` | Story 2.0 组件系统 |
| `docs/v2/TRAILOGUE_V2_MAGAZINE_DESIGN.md` | Magazine 2.0 组件系统 |
| `docs/v2/TRAILOGUE_V2_MONETIZATION_PLAN.md` | 商业化预留 |
| `docs/v2/TRAILOGUE_V2_V1_COMPATIBILITY_CHECKLIST.md` | 与 1.0 的兼容红线 |
| `ios-app/src/features/v2/**` | Story / Magazine 组件系统基础代码（纯新增） |
| `ios-app/__tests__/v2-*.test.ts` | 组件系统测试 |
