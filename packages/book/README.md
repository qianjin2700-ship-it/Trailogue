# @trailogue/book

Trailogue 2.0 的**共享排版引擎**：Story / Magazine 的文档模型、确定性编排、HTML 渲染器。

纯 TypeScript，**零运行时依赖**，不 import React / React Native / DOM / 网络。
同一套代码同时服务五个消费者：

| 消费者 | 调用方式 |
| --- | --- |
| iOS Story 预览（WebView） | `renderStoryHtml(buildStoryDocument(src), { preview: true })` |
| iOS Magazine 预览（WebView） | `renderMagazineHtml(buildMagazineDocument(src), { preview: true })` |
| expo-print 导出 PDF | 同上，`preview: false` |
| Railway 服务端 Story 分享页 | `import { buildStoryDocument, renderStoryHtml } from '@trailogue/book'` |
| Railway 服务端 Magazine 分享页 | 同上 |

## 为什么单独成包

Phase A 时这些文件住在 `ios-app/src/features/v2/`，虽然已经是纯 TS，
但位置暗示「这是 iOS 的东西」。服务端要复用同一套版式时，
只能复制代码 —— 而复制出来的渲染器一定会和客户端漂移，
「所见即所得」就失效了。抽包之后只有一份实现。

## 用法

完整字段与保证见 [`CONTRACT.md`](./CONTRACT.md)，这里只给四条最短路径。

### 1. 从 1.0 的数据直接出 Story 网页

```ts
import { sourceFromStory, buildStoryDocument, renderStoryHtml } from '@trailogue/book';

const source = sourceFromStory(story.content, photos, { coverPhotoId, startDate, endDate });
const html = renderStoryHtml(buildStoryDocument(source), { preview: true });
// html 直接丢给 <WebView source={{ html }} />
```

### 2. Magazine 预览与 PDF 用同一份文档

```ts
import { buildMagazineDocument, renderMagazineHtml } from '@trailogue/book';

const document = buildMagazineDocument(source);
const preview = renderMagazineHtml(document, { preview: true });   // 带投影的预览
const print = renderMagazineHtml(document, { preview: false });    // 交给 expo-print
```

### 3. 服务端分享页（Node）

```ts
import { planMagazine, renderMagazineHtml } from '@trailogue/book';

const plan = planMagazine(source);
res.type('html').send(renderMagazineHtml(plan.document, { pageNumbers: true }));
```

### 4. 调试分隔页决策

```ts
const plan = planMagazine(source);
plan.dividerPlan.chapterIds;   // 哪些章节插了分隔页
plan.dividerPlan.skipped;      // 其余章节为什么没插（reason 可枚举）
plan.dividerPlan.maxDividers;  // 本书允许的上限
```

### 跑一遍看效果

```bash
npm --prefix packages/book run build
node packages/book/examples/render.mjs
# → 临时目录下的 story.html / magazine.html / magazine.print.html
```

## API 一览

| 分类 | 导出 | 用途 |
| --- | --- | --- |
| 输入 | `createDocumentSource` / `sourceFromStory` | 归一化内容，剔除失效照片引用 |
| 编排 | `buildStoryDocument` / `buildMagazineDocument` / `planMagazine` | 顺序、分页、分隔页决策 |
| 渲染 | `renderStoryHtml` / `renderMagazineHtml` | 完整 HTML（含内联 CSS） |
| 几何 | `figureFit` / `pageSlotAspects` / `imageTextFigureHeightMm` | 槽位比例与裁切策略 |
| 分组 | `splitPhotoRun` / `chunkPhotos` / `planPlates` | 照片如何分页 |
| 文字 | `splitTextIntoPages` / `estimateLineCount` / `magazineTextCapacity` | 不裁字的容量控制 |
| 规则 | `planChapterDividers` / `DIVIDER_RULES` | 分隔页 R1–R8 |
| 权益 | `isEntitled` / `pdfResolution` / `FEATURE_CATALOG` | Pro gate（无支付、无网络） |
| 示例数据 | `createMockSource` / `createCompactMockSource` / `placeholderPhoto` | 测试与预览 |

## 不变量（由测试保证）

结构与内容：

- **确定性**：同一份 `DocumentSource` 产出逐字节相同的 HTML；
- **不裁字**：Magazine 固定页高，正文超出单页容量时按句子分页（`splitTextIntoPages`）；
- **无孤立尾图**：照片按 1/2/3 分组，余数排最前（`splitPhotoRun`）；
- **用户内容全转义**：标题 / 正文 / 说明一律 `escapeHtml`，`javascript:` 伪协议被拦截。

版式（Phase B1 新增，对应 mock preview 里真实踩过的坑）：

- **不出现信箱化空框**：满幅页（封面 / hero / 整版）的可见比例下限是 0.34，
  有图框的版式是 0.45；只有全景 / 超长竖图才留白，且留白照片不得超过全书 20%；
- **同页不混排方向**：三张一组里既有竖图又有横图时拆成「1 张整版 + 2 张同页」，
  避免横图被塞进 0.56 的竖槽（可见 37%，上下各一条白边）；
- **双图页按比例分行**：上下分栏的行高 = 1/宽高比，两张图的裁切比例相同；
- **分隔页是呼吸不是骨架**：任何两个分隔页之间至少 3 个内容页，且不超过全书 1/8。

## 脚本

```bash
npm --prefix packages/book run build      # tsc → dist（ESM + .d.ts）
npm --prefix packages/book run typecheck
npm --prefix packages/book run lint
npm --prefix packages/book test           # node:test + tsx（183 个用例）

node scripts/render-v2-previews.mjs       # 生成 docs/v2/previews/*.html
node scripts/divider-rhythm.mjs           # 打印分隔页节奏表（文档引用）
node packages/book/examples/render.mjs    # 最小可运行示例
```

> `ios-app` 与 `apps/api` 通过 `dist` 消费本包，**改完源码要先 build**。
> 根目录 `npm run build:packages` 已经包含本包，`npm test` 会先构建再跑测试。

## 注意

`tsconfig.json` 里关掉了 `exactOptionalPropertyTypes`（其余包保持开启）。
原因：文档模型的字段大多是「可缺省」的（`subtitle`、`caption`、`eyebrow` …），
编排器里大量出现 `title: source.subtitle` 这种如实透传 `undefined` 的写法，
开启该选项只会逼出一堆 `...(x ? {a:x} : {})` 的噪音，
而这一层的安全性由测试（转义、容量、顺序）而不是类型系统兜底。
