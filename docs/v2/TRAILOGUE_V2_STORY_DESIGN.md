# TRAILOGUE V2 — Story 设计

> 目标：**一篇舒服、稳定、好读的旅行图文文章。**
> 不是画册，不是时间线组件库，也不是可以随便拼的自由画布。

---

## 1. 设计立场

1. Story 是**阅读**形态。判断标准只有一个：一个普通人在手机上愿不愿意读完。
2. 视觉必须**退后**。照片是叙事的证据，不是主角；主角是文字与顺序。
3. 版式**只有一种**。不给用户模板选择，避免「选哪个更好看」的决策成本。
4. 排版**确定性**：同一份内容任何时候渲染结果一致。

与 1.0 的差别（这是 2.0 要解决的问题）：

| 维度 | 1.0 | 2.0 |
|---|---|---|
| 照片位置 | 每章文字之后，所有照片平铺 | 按 1/2/3 张切块，穿插在章节内 |
| 版式实现 | `renderStoryReadingHtml` 内联字符串 | 块模型 + 渲染器（`features/v2`） |
| 分享网页 | 服务端另写一份 `renderSharedStoryHtml` | 复用同一份文档模型（同一套 CSS） |
| 行长 | 760px | 700px（16.5px 字号下约 42 个汉字 / 行） |

---

## 2. 阅读刻度

| 项 | 值 | 说明 |
|---|---|---|
| 正文字号 | 16.5px | 与 1.0 收口后一致，避免用户感知突变 |
| 行高 | 1.75 | 中文长文舒适区 1.7–1.8 |
| 行长 | 700px | 超过 800px 单行字太多，回行容易丢行 |
| 段间距 | 18px | 约 1.1 倍行高，段落可辨但不散 |
| 章节间距 | 40px + 1px 分隔线 | 章节是硬边界，必须有视觉停顿 |
| 照片间距 | 24–26px | 与段落间距同量级，避免「图片海报化」 |
| H1 | 1.8rem / 1.22 | 标题层不变（用户已确认不改标题层级） |
| H2 | 1.32rem / 1.3 | 章节标题 |
| meta / eyebrow | 0.8rem、字重 700、字距 0.04–0.06em | 日期 · 地点 |

移动端（≤520px）：字号降为 16px，并排图与图组自动降为单列，避免小图上出现「邮票页」。

---

## 3. 块类型（Block）

| 块 | CSS class | 何时出现 | 视觉规则 |
|---|---|---|---|
| Header | `.story-header` | 永远第一个 | 日期 eyebrow + H1 + 斜体副标题 |
| Paragraph | `.copy` | 序言 | 单栏正文 |
| Section | `.chapter` | 每一章 | 分隔线 + eyebrow + H2 + 正文 |
| Figure · large | `.figure-large` | 该块只有 1 张照片 | 通栏，圆角 10px |
| Figure · pair | `.figure-pair` | 该块 2 张照片 | 两列等宽，3:4 裁切（竖构图友好） |
| Figure · gallery | `.figure-gallery` | 该块 3 张照片 | 三列正方形，图片墙 |
| Quote | `.pull` | 有高光引语时 | 左侧 3px 强调线 + 衬线大字 |
| Closing | `.closing` | 有尾声时 | 顶部细线 + 正文 |

所有照片都是 `<img width:100% height:auto>`，**不做裁切**（Story 里不裁照片，只有 Magazine 才裁）。
例外：`.figure-pair` / `.figure-gallery` 用 `object-fit:cover` 做统一比例，否则网格会歪。

---

## 4. 编排规则（`buildStoryDocument`）

```
header(标题, 日期区间, 副标题)
paragraph(序言)                 ← 有才输出
for each chapter:
    section(标题, eyebrow, 正文)
    for each chunk of photos:   ← splitPhotoRun(数量)
        figure(layout = 1→large / 2→pair / 3→gallery)
    quote(高光)                  ← 有候选才输出
closing(尾声)                    ← 有才输出
```

照片切块规则（`splitPhotoRun`）：

| 张数 | 切块 | 理由 |
|---|---|---|
| 1 | `[1]` | 大图 |
| 2 | `[2]` | 并排 |
| 3 | `[3]` | 图组 |
| 4 | `[1,3]` | 先给一张主图，再给图组 |
| 5 | `[2,3]` | 并排 + 图组 |
| 6 | `[3,3]` | 两组 |
| 7 | `[1,3,3]` | 主图 + 两组 |
| 8 | `[3,3,2]` | — |

原则：**不留孤立单图**（`[3,1]` 这种结尾会显得残缺），余数为 1 时先切主图。

照片缺失（被用户删除 / 加载失败）时**静默丢弃**，故事文本照常可读 —— 不能因为一张图让整篇白屏。

---

## 5. 与 AI 的边界

| AI 负责 | 程序负责 |
|---|---|
| 标题、副标题、序言、章节标题、章节正文、尾声 | 段落顺序、行长、字号、照片位置与尺寸 |
| 引语候选（未来） | 引语块的位置与样式 |

**AI 永远不输出**：页码、版式名、图片尺寸、坐标、CSS、模板 ID。
理由：不可测试、不可复现、换一次模型就换一本书。

---

## 6. 代码映射

| 文件 | 职责 |
|---|---|
| `src/features/v2/source.ts` | 1.0 数据归一化为 `DocumentSource`（照片缺失过滤、日期、语言） |
| `src/features/v2/storyDocument.ts` | 编排：内容 → 块序列（纯函数，无 DOM） |
| `src/features/v2/storyRender.ts` | 块序列 → HTML（唯一一处写 CSS） |
| `src/features/v2/layoutEngine.ts` | 切块与宽高比判断 |
| `src/features/v2/tokens.ts` | 颜色与刻度常量 |

调用方式：

```ts
const source = sourceFromStory(book.story, photos, {
  coverPhotoId: book.coverPhotoId,
  startDate: book.startDate,
  endDate: trip.endDate,
});
const html = renderStoryHtml(buildStoryDocument(source), { preview: true });
```

`preview: true` 会注入与 1.0 Book Preview 相同的 `photo-error` / `preview-ready` 协议，
因此替换 1.0 的 `renderStoryReadingHtml` 时**不需要改 `book.tsx` 的 WebView 消息处理**。

---

## 7. 测试覆盖

| 断言 | 文件 |
|---|---|
| 首个块是 header 且带日期区间 | `__tests__/v2-story-document-test.ts` |
| 章节顺序与输入一致 | 同上 |
| 9 张照片全部进入图示块，无丢图 | 同上 |
| 4 张切 `[1,3]`、2 张切 `[2]` | 同上 |
| 失联照片被丢弃但文本仍在 | 同上 |
| 引语插入到对应章节之后 | 同上 |
| 两次构建结果完全一致（确定性） | 同上 |
| 输出 700px 行长 / 16.5px 正文 | `__tests__/v2-render-test.ts` |
| 标题里的 `<script>` 被转义 | 同上 |
| `javascript:` 图片地址不会进入 src | 同上 |

---

## 8. 迁移到 1.0 的路径（等 1.0 过审后再做）

1. `book.tsx` 的 `previewHtml` 分支：`renderStoryReadingHtml(...)` → `renderStoryHtml(buildStoryDocument(sourceFromStory(...)), { preview: true })`；
2. 服务端 `renderSharedStoryHtml` 改为消费同一份 `StoryDocument`（把 `features/v2` 抽成 workspace 包，前后端共用）；
3. 验证：分享链接打开后的排版与 App 内**像素级接近**；
4. 保留旧函数一个版本作为回滚点，不直接删除。

风险：服务端复用需要把 `features/v2` 从 `ios-app/src` 移到 `packages/`（否则 API 引用客户端目录）。
这一步**不在 Phase A**，是 2.0 实施阶段的第一个结构动作。
