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

```ts
import {
  sourceFromStory,       // 1.0 StoryContentDTO → DocumentSource
  buildStoryDocument,
  buildMagazineDocument,
  renderStoryHtml,
  renderMagazineHtml,
} from '@trailogue/book';

const source = sourceFromStory(story.content, photos, { coverPhotoId, startDate, endDate });
const storyHtml = renderStoryHtml(buildStoryDocument(source), { preview: true });
const magazineHtml = renderMagazineHtml(buildMagazineDocument(source), { preview: false });
```

Magazine 的分隔页决策可以单独拿出来看（调试 / 埋点 / 文档用）：

```ts
const plan = planMagazine(source);
plan.dividerPlan.chapterIds;   // 哪些章节插了分隔页
plan.dividerPlan.skipped;      // 其余章节为什么没插
```

## 不变量（由测试保证）

- **确定性**：同一份 `DocumentSource` 产出逐字节相同的 HTML；
- **不裁字**：Magazine 固定页高，正文超出单页容量时按句子分页（`splitTextIntoPages`）；
- **不异常裁图**：槽位与照片比例差异过大时改用 `object-fit: contain`（`figureFit`）；
- **无孤立尾图**：照片按 1/2/3 分组，余数排最前（`splitPhotoRun`）；
- **用户内容全转义**：标题 / 正文 / 说明一律 `escapeHtml`，`javascript:` 伪协议被拦截。

## 脚本

```bash
npm --prefix packages/book run build      # tsc → dist（ESM + .d.ts）
npm --prefix packages/book run typecheck
npm --prefix packages/book run lint
npm --prefix packages/book test          # node:test + tsx
```

> `ios-app` 与 `apps/api` 通过 `dist` 消费本包，**改完源码要先 build**。
> 根目录 `npm run build:packages` 已经包含本包，`npm test` 会先构建再跑测试。

## 注意

`tsconfig.json` 里关掉了 `exactOptionalPropertyTypes`（其余包保持开启）。
原因：文档模型的字段大多是「可缺省」的（`subtitle`、`caption`、`eyebrow` …），
编排器里大量出现 `title: source.subtitle` 这种如实透传 `undefined` 的写法，
开启该选项只会逼出一堆 `...(x ? {a:x} : {})` 的噪音，
而这一层的安全性由测试（转义、容量、顺序）而不是类型系统兜底。
