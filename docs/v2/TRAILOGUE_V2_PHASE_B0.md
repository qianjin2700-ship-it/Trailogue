# Trailogue 2.0 — Phase B0 交付说明

> 目标：在**继续保证 1.0 零修改、零运行时影响**的前提下，把 V2 的共享渲染基础做扎实。
> 本阶段只动「2.0 新增的代码」，没有碰 1.0 的任何页面、接口、数据库、部署配置。

---

## 0. 一句话总结

Phase A 的 12 个纯 TS 文件从 `ios-app/src/features/v2/` 搬进了 monorepo 共享包
**`@trailogue/book`**（零运行时依赖），并补齐了三件 Phase A 缺的东西：
**正文不再被裁**（按句子分页）、**分隔页不再机械出现**（R1–R7 规则）、
**大幅照片不再被硬裁**（`cover` / `contain` 自适应）。
同时对 18 个 mock 场景做了确定性回归，前端还补了 V2 独立的 UI 状态组件与重试行为。

---

## 1. Phase A 验收后冻结的产品决策

| # | 决策 | 本阶段如何落地 |
|---|---|---|
| 1 | Book Preview 删除重复的 `Edit story`，Story 页面保留唯一编辑入口 | 属 iOS 页面改动，**本阶段不动**（留给 Phase C）；已记入待办 |
| 2 | 2.0 第一阶段 PDF 继续用 Letter，不加 A4 | `PAGE` 常量保持 Letter；`render` 输出 `@page{size:letter}`，测试锁定 |
| 3 | Chapter Divider 保留，但不得机械地每章插入 | 新增 `chapterDivider.ts`（R1–R7），见 §6 |
| 4 | Pro 首批能力 = Premium layouts + High-res PDF，只做 gate 不做支付 | 新增 `entitlements.ts`（纯函数，无网络），见 §9 |
| 5 | 继续零 analytics / crash telemetry | 本阶段没有引入任何统计、埋点、设备 ID、第三方 SDK |

---

## 2. 新 package 结构

```
packages/book/
├── package.json            @trailogue/book · type: module · 零 dependencies
├── tsconfig.json           继承 tsconfig.base，仅关闭 exactOptionalPropertyTypes（见 README）
├── README.md               复用说明 / 不变量 / 脚本
├── src/
│   ├── index.ts            唯一出口（显式导出，不用 export *）
│   ├── types.ts            文档模型（Story / Magazine 的块与页，纯数据）
│   ├── tokens.ts           设计令牌 + Letter 版心 + 印刷字号刻度
│   ├── format.ts           日期 / 内容量文案（不用 Intl，保证端上服务端一致）
│   ├── html.ts             HTML 转义与图片 URL 白名单
│   ├── layoutEngine.ts     照片分组、槽位几何、cover/contain 策略
│   ├── textFit.ts          ★ 新增：字符宽度估算 + 按句子分页
│   ├── source.ts           输入归一化（1.0 DTO → DocumentSource）
│   ├── storyDocument.ts    Story 编排（块序列）
│   ├── magazineDocument.ts Magazine 编排（页序列）
│   ├── chapterDivider.ts   ★ 新增：分隔页启用规则
│   ├── entitlements.ts     ★ 新增：Pro 能力 gate（无支付）
│   ├── storyRender.ts      Story → HTML
│   ├── magazineRender.ts   Magazine → HTML
│   └── mock.ts             内联 SVG 演示数据（离线可看）
├── test/
│   ├── fixtures/scenarios.ts   18 个确定性场景
│   ├── invariants.ts           排版不变量检查器
│   ├── scenarios.test.ts       场景 × 4 类断言
│   ├── layout-engine.test.ts   分组 / 几何 / 裁切
│   ├── text-fit.test.ts        行数估算 / 分页不丢字
│   ├── chapter-divider.test.ts R1–R7 + 显式覆盖
│   ├── entitlements.test.ts    Pro gate
│   └── render.test.ts          转义 / 伪协议 / 打印 vs 预览
└── dist/                   tsc 产物（ESM + .d.ts），被 iOS 与 api 消费
```

**依赖方向**：`@trailogue/book` 不依赖仓库内任何其他包，也不依赖 React / RN / DOM / 网络。
谁都可以依赖它，它不依赖谁。

---

## 3. 模块职责边界

| 层 | 做什么 | 不做什么 |
|---|---|---|
| `types.ts` | 描述「内容块 / 页面」 | 不出现任何像素、字号、坐标 |
| `source.ts` | 把 1.0 数据归一化成同一份 source | 不读数据库、不发请求 |
| `*Document.ts` | 决定**顺序**与**版式选择** | 不拼 HTML |
| `chapterDivider.ts` | 决定分隔页**是否出现** | 不关心分隔页长什么样 |
| `textFit.ts` | 判断文字**会不会超出页** | 不做真实字体测量（异步，不可靠） |
| `layoutEngine.ts` | 照片切块 / 槽位比例 / 裁切策略 | 不决定用哪个版式 |
| `*Render.ts` | 版式 → HTML/CSS | 不做内容决策，用户内容一律转义 |

---

## 4. 修改文件清单

### 新增

| 路径 | 说明 |
|---|---|
| `packages/book/**` | 共享包全部文件（见上） |
| `ios-app/src/features/v2-ui/{theme,Button,EmptyState,ErrorState,LoadingState,SectionHeader,MediaPlaceholder,index}.ts(x)` | V2 UI 基础组件 |
| `ios-app/__tests__/v2-ui-test.tsx` | UI 状态机测试（重试 / 禁用 / 空态） |
| `docs/v2/TRAILOGUE_V2_PHASE_B0.md` | 本文 |

### 移动（内容等价搬入共享包）

`ios-app/src/features/v2/{types,tokens,format,html,layoutEngine,source,storyDocument,magazineDocument,storyRender,magazineRender,mock}.ts`
→ `packages/book/src/`（导入路径改为 ESM 显式 `.js`）。

### 修改

| 路径 | 改动 |
|---|---|
| `ios-app/src/features/v2/index.ts` | 从「实现」改为「转发 `@trailogue/book`」，iOS 侧入口保持不变 |
| `ios-app/package.json` | 增加 `@trailogue/book: file:../packages/book` |
| `ios-app/__tests__/v2-magazine-document-test.ts` | 分隔页断言由「每章一页」改为规则驱动；页序 11 页；`splitPhotoRun(8)` → `[2,3,3]` |
| `ios-app/__tests__/v2-story-document-test.ts` | `stats` 改用 `toMatchObject`（新增 `textLength`） |
| `package.json`（根） | `build:packages` / `install:api` / `lint` / `typecheck` / `test` 纳入 `packages/book` |
| `scripts/render-v2-previews.mjs` | 改为消费 `packages/book/dist`，并多生成一份紧凑短途预览 |
| `docs/v2/TRAILOGUE_V2_MAGAZINE_DESIGN.md` | 分隔页规则、文件位置、页数、预览清单同步 |

### 删除

`ios-app/src/features/v2/` 下被搬走的 11 个实现文件（只保留 `index.ts` 转发）。

> **1.0 文件零改动**：`ios-app/src/app/**`、`features/{books,photos,stories,trips}/**`、
> `apps/api/**`、`packages/{contracts,domain,config,database}/**` 全部未修改。

---

## 5. 确定性排版：六条不变量与实现手段

| 不变量 | 实现 | 测试 |
|---|---|---|
| 不出现孤立尾图 | `splitPhotoRun` 余数排最前（1 张独立大图 / 2 张跨版），最后一页永远是满的 | `layout-engine.test.ts` 12 组取值 |
| 不发生文字溢出 | `textFit` 估算行数 + `splitTextIntoPages` 按句分页；每页正文都 ≤ 版心容量 | `text-fit.test.ts` + `scenarios.test.ts` |
| 不出现空白页面 | 空章节直接跳过；纯文字章节成 `image_text(text-only)` 页 | `invariants.ts` 空白页检查 |
| 不产生异常裁图 | `figureFit`：可见比例 < 0.6 时从 `cover` 切到 `contain`（留白而非硬裁） | `layout-engine.test.ts` + 每页 `data-fit` |
| Story 阅读顺序稳定 | 块序列 = 标题 → 序 →（章节 → 图组）* → 尾声 | `storyViolations` + 章节顺序断言 |
| Magazine 页序稳定 | 页序列按章节分组，章节不交错 | `magazineViolations` 的章节游程检查 |
| 同一输入结果完全一致 | 全程无 `Date.now()` / `Math.random()` / 迭代顺序依赖 | 每个场景都比对两次构建的 JSON 与 HTML |

### 文字为什么会溢出，以及为什么用估算

Magazine 是**固定页高**（Letter 279.4mm）。正文超出版心会被 CSS 裁掉 —— 用户丢内容。
WebView 里没有可靠的同步测量手段（等字体就变成异步、不确定），
所以用「CJK 1em / 拉丁 0.52em + 每行 em 宽度」估算行数，**只允许高估**：

- 估算偏大 → 提前分页，最多多一页白；
- 估算偏小 → 文字被裁，用户看到半句话。

分页时按「段落 → 句子 → 字符」三级降级，保证任何输入都能切开，
且**拼接回去等于原文**（测试断言字符数守恒）。

### 两个补充修正（视觉验收时发现，已固化）

1. **满幅页不渲染照片说明**：封面 / hero / 整版单图的下方同时承载书名、正文或页码，
   说明文字压上去必然重叠（实测在封面底部露出一条被裁掉的黑字）。
   现在只有「有独立图片框」的版式（文图分栏 / 双图跨版 / 三图拼版 / 尾页）才带说明。
2. **文图分栏的图片框按图片比例定高**（`imageTextFigureHeightMm`）：
   原来固定为整版高度，导致 2:3 竖图要嘛被裁一半、要嘛 `contain` 出一大片空白。
   现在高度 = `min(版心高, 栏宽 / 图片比例)`，竖图得到竖向图版、横图得到横向图版，
   既不裁也不空，垂直居中。

### 为什么不是所有照片都 `cover`

Letter 竖版页面的满幅槽位比例是 0.773。把 3:2 横图塞进去只能显示中间 51%，
主体经常被切掉。规则改成：可见比例 ≥ 0.6 用 `cover`，否则 `contain`。
代价是横图满幅页左右留白，收益是不再把人和景切两半。

---

## 6. Chapter Divider 最终规则

**结论：分隔页从「每章一页」改为「按内容量与页面节奏决定，最多 3 页」。**

| 规则 | 条件 | 结果 | 理由 |
|---|---|---|---|
| R1 | 章节数 = 1 | 不插 | 只有一章没有「章与章之间」 |
| R2 | 预计总页数 < 8 | 不插 | 短旅行应紧凑，7 页里插 2 页纯标题很空 |
| R3 | 全书照片 < 6 | 不插 | 内容太薄，分隔页会显得比内容还重 |
| R4 | 第 1 章 | 不插 | 封面 + 行程页 + 首章主图已经完成开场 |
| R5 | 该章照片 < 4 **且** 正文 < 700 字 | 不插 | 分量不够的章节不值得一整页 |
| R6 | 数量上限 | `min(3, ⌊章节数/2⌋, ⌊页数/8⌋)` | 分隔页永远只是少数页（≤ 1/8） |
| R7 | 距上一个分隔页 < 3 个内容页 | 冲突时保留分量更重的一章 | 避免两个分隔页挨在一起 |

阈值集中在 `DIVIDER_RULES`，测试逐条锁定（改阈值会立刻红）。

实测结果：

| 输入 | 页数 | 分隔页 | 说明 |
|---|---|---|---|
| 2 章 4 图（顺德短途） | 7 | 0 | R2 命中 |
| 4 章 9 图（示例旅行） | 11 | 1 | 只有 4 张照片的第 2 章过 R5，且 R6 上限为 1 |
| 8 章 24 图 | 22 | ≤3 | R6 三重上限同时生效 |
| 6 章 36 图（等分量） | — | 1 | R7 把相邻的那个砍掉 |

显式覆盖仍然保留：`chapterDividers: true` 强制每章一页（设计评审用），
`false` 全部关闭。默认 `undefined` 走规则。

---

## 7. 测试矩阵与结果

### 场景（`test/fixtures/scenarios.ts`）

1 张 / 2 张 / 3 张 / 4 张 / 8 张 / 12 张 / 24 张（20+）/ 全竖图 / 全横图 / 横竖混合 /
极短文字 / 极长正文 / 超长标题 / 缺 subtitle / 多章节 8 章 / 单章节大画册 /
无照片纯文字 / 英文长文。

每个场景 4 类断言：Magazine 不变量、Story 不变量、确定性、渲染契约。

### 结果

| 测试集 | 命令 | 用例数 | 结果 |
|---|---|---|---|
| `packages/book`（8 个文件，含 18 场景 × 4） | `npm --prefix packages/book test` | 113 | 全部通过 |
| `ios-app`（26 个 1.0 套件 + v2 集成 + v2-ui） | `npm --prefix ios-app test` | 110（27 套件） | 全部通过 |
| `apps/api`（未改动的回归基线） | `npm --prefix apps/api test` | 60 | 全部通过 |
| `ios-app` 类型检查 | `npx tsc --noEmit` | — | 通过 |
| `ios-app` / `packages/book` lint | `npx eslint .` | — | 通过 |

> iOS 侧的 v2 用例现在**真正经过包**：`@/features/v2` 只是转发，
> 用例跑的是 `packages/book/dist`，等于顺带验证了「包能被 iOS 工程消费」。

---

## 8. V2 UI primitives 与重试设计

新增 `ios-app/src/features/v2-ui/`（**未接入 `app/**` 正式路由**）：

| 组件 | 用途 |
|---|---|
| `Button` | 三态（primary/secondary/ghost）× 两尺寸；`loading` 时禁用并换文案 |
| `EmptyState` | 空列表；只说明现状 + 一个行动入口，不预置示例数据 |
| `ErrorState` | 失败态 + **明确的重试** |
| `LoadingState` | 单一转圈 + 一句说明 |
| `SectionHeader` | 区块标题 + 副标题 + 右侧操作 |
| `MediaPlaceholder` | 照片上传中 / 加载失败时占位，避免列表跳动 |

### 重试行为（针对 Phase A 的「只有一行红字」）

1. 传了 `onRetry` 才渲染按钮 —— 没有可重试的动作时不给假按钮；
2. 点击立刻进入 `busy`（按钮禁用 + 文案变 `Retrying…`），**连点只触发一次**；
3. `onRetry` 可以返回 Promise，`resolve` / `reject` 后自动解除 busy；
4. 失败不吞错：组件保持挂载，错误文案由调用方决定是否更新；
5. 可同时提供次要出口（例如「返回书架」）。

`ios-app/__tests__/v2-ui-test.tsx` 覆盖：无回调不渲染、点一次触发一次、
busy 期间不可再点、失败后恢复可点、禁用按钮不触发、加载态阻止点击。

---

## 9. Pro 能力 gate（只做设计，不含支付）

`packages/book/src/entitlements.ts`：

```ts
type ProFeature = 'premium_magazine_layouts' | 'high_resolution_pdf';

isEntitled(entitlements, feature): boolean
magazineLayoutTier(entitlements): 'classic' | 'premium'
pdfResolution(entitlements): { longEdgePx: 1600 | 3200, targetDpi: 150 | 300 }
```

- 默认 `FREE_ENTITLEMENTS` = `{ tier: 'free' }`，全部 Pro 能力关闭；
- 支持 `features: [...]` 单项解锁（运营补偿 / 试用）；
- **零网络、零 StoreKit、零收据校验** —— 接入支付时只需把真实权益解析成
  `Entitlements`，业务判断不用改。

---

## 10. 与 1.0 的隔离

| 检查 | 结果 |
|---|---|
| `ios-app/src/app/**` 是否改动 | 否 |
| `features/{books,photos,stories,trips}` 是否改动 | 否 |
| `apps/api/**`（含分享页渲染）是否改动 | 否 |
| 数据库 / 迁移 | 未触碰 |
| EAS build / 部署 | 未触发 |
| iOS 侧唯一变化 | `features/v2` 从「实现」变「转发」，`package.json` 加 `file:` 依赖 |

`features/v2` 至今没有任何 `app/**` 引用，也没有进入打包路径；
`file:` 依赖只有被 import 时才会进 bundle。

---

## 11. 分工：谁继续做什么

### 可以继续交给 WorkBuddy

- 文档、设计规则、mock 预览的迭代（`docs/v2/**`、`scripts/render-v2-previews.mjs`）
- `packages/book` 的纯逻辑与测试（Node 侧可完整验证，不需要 Xcode / 真机）
- V2 UI 组件的样式微调与单元测试（jest + RNTL，不需要真机）
- 仓库治理：提交、分支、lockfile、根脚本一致性

### 明确留给 Codex

- `app/**` 路由接线（Book Preview 去掉重复 `Edit story`、Story 页面唯一编辑入口）
- expo-print 接入 V2 渲染器（PDF 页边距、分页、字体回退需要在真机验证）
- Metro / Hermes 下 `@trailogue/book` 的实际打包验证（WorkBuddy 只能验证 Node 与 jest）
- StoreKit / 收据校验 / Pro 权益落库
- Railway 服务端分享页切换到 V2 渲染器（涉及生产路由，本阶段禁止）
- EAS build 与 App Store 提审

### 需要用户手动完成

- 真机看视觉效果（`docs/v2/previews/*.html` 可先在电脑上过一遍）
- 决定 Pro 定价与订阅形态
- 确认 1.0 审核状态是否已放行（决定 2.0 什么时候开始动 `app/**`）

---

## 12. 已知限制

1. **文字行数是估算**，不是真实字体度量。极端窄字（如大量 `i`、`l`）会略多算，
   结果是提前分页 —— 不会溢出，但可能多一页。
2. **`contain` 会留白**。横图满幅页两侧有底色，这是刻意的取舍（宁可留白不切主体）；
   若设计上更想要满幅裁切，只需调 `MIN_VISIBLE_FRACTION`。
3. **iOS 侧已在 tsc / jest 下验证，但未在 Metro 下验证**。
   jest 通过 `moduleNameMapper` 把 `@trailogue/book` 指向 `packages/book/dist/index.js`
   （再补一条 `@babel/runtime` 映射，因为 dist 在仓库根下、解析不到 iOS 的 babel 运行时）。
   Expo 的 Metro 对 `file:` 包 + ESM `dist` 的真实打包结果需要在 dev client / 真机上确认。
4. **PDF 仍未经真机打印验证**：`@page{size:letter}` 依赖 expo-print 的实现，
   需要在 Phase C 用真机导出比对。
