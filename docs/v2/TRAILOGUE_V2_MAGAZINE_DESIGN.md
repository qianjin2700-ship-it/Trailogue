# TRAILOGUE V2 — Magazine 设计

> 目标：**一本拿得出手的旅行杂志。**
> 它是 2.0 的核心视觉卖点，也是「这份东西值得打印」的理由。

---

## 1. 设计立场

1. **AI 内容理解 + 程序化版式引擎**。AI 只给内容（标题、正文、图片分组、引语候选、时间线），
   **不决定任何像素**。同一份内容永远得到同一本画册。
2. **版式是固定的组件，不是自由布局**。10 个页面组件，每个都有自己的构图规则，
   渲染器只负责「选组件 + 填空」。
3. **页面是硬边界**。每页固定 Letter 尺寸，`overflow:hidden`，内容超出即裁切——
   宁可少字，不可溢出。这是 PDF 不出现「半页文字」的前提。
4. **多主题留给 Pro**。1.0 只有 `travel_magazine` 一套，2.0 维持一套高完成度版式。

---

## 2. 页面规格

| 项 | 值 | 说明 |
|---|---|---|
| 页面尺寸 | **215.9 × 279.4 mm（Letter）** | 与 1.0 已导出 PDF 一致，改尺寸属破坏性变更 |
| 外边距 | 16mm | 满幅页（cover / hero / full_width / two_spread）例外 |
| 栏间距 | 3–9mm | 拼版 3mm，文图分栏 9mm |
| @page | `size:letter; margin:0` | 由 `expo-print` 直接消费 |
| 分页 | `.page{break-after:page}` | 每页强制分页 |
| 页码 | 右下 9mm，两位数字 | 封面无页码 |

---

## 3. 十个页面组件

| # | 组件 | `kind` | 构图 | 何时使用 |
|---|---|---|---|---|
| 1 | Cover | `cover` | 整版照片 + 底部渐隐 + 左下书名/日期/副标题 | 永远第一页 |
| 2 | Trip info | `trip_info` | 深色页，四格事实（日期 / 地点 / 照片数 / 章节数）+ 橙色短横 | 第二页（可关） |
| 3 | Chapter divider | `chapter_divider` | 纯文字，大号章节号 + H2 + eyebrow + 短横 | 每章开头（可关） |
| 4 | Hero | `hero` | 满幅横构图 + 底部渐隐 + 标题/正文压底 | 章节主图是横构图 |
| 5 | Image + text | `image_text` | 左右分栏（1.06 : 0.94），竖构图主图占一栏 | 章节主图是竖构图；或纯文字章节 |
| 6 | Full width | `full_width` | 整版单图 + 底部渐隐说明 | 章节剩余照片为 1 张 |
| 7 | Two-image spread | `two_spread` | 左右各占半版，通高 | 剩余 2 张 |
| 8 | Three-image collage | `three_collage` | 1 大（跨两行）+ 2 小 | 剩余 3 张 |
| 9 | Quote | `quote` | 浅橙底 + 衬线大字 + 短横 + 出处 | 有引语候选时 |
| 10 | Closing | `closing` | 顶部两图 + 中段尾声 + 底部 `Trailogue` 署名 | 永远最后一页 |

> 这 10 个就是 V2 的全部。**不新增第 11 个**，除非先改本文档。

---

## 4. 编排规则（`buildMagazineDocument`）

```
cover
trip_info                    ← options.tripInfo !== false
for each chapter:
    chapter_divider          ← options.chapterDividers !== false
    lead page:
        photos.length === 0        → image_text(text-only)
        lead aspect < 1.05 (竖)    → image_text
        else                       → hero
    remaining photos → chunkPhotos():
        1 → full_width
        2 → two_spread
        3 → three_collage
    quote                    ← 有候选才插
closing
```

**为什么主图按宽高比二选一**：竖构图照片放进满幅横版会被裁掉上下 40% 以上（人脸/建筑顶会被切），
换成分栏页后照片保留完整高度，这是 1.0 里最明显的「照片被截断」问题来源。

`align` 在文图页里按章节序号奇偶交替（`left` / `right`），避免连续三页都是「左图右文」的呆板节奏。

---

## 5. 视觉系统

| 元素 | 规则 |
|---|---|
| 底色 | 纸色 `#f3eee6`；封面/行程页深墨 `#14283b` |
| 强调色 | 橙 `#d7643d`，只用于短横、页码、eyebrow、引语底 |
| 标题字体 | `Iowan Old Style / Songti SC / Georgia`（衬线，杂志感） |
| 正文字体 | 系统无衬线（10.5pt / 1.72）——正文用衬线在小字号下会糊 |
| 封面 H1 | 48pt，字距 -1.4px |
| 章节页 H2 | 38pt |
| Hero H2 | 30pt |
| 引语 | 26pt / 1.34，浅橙底 `#f6e7dd` |
| 图注 | 7.5pt，白字 + 底部渐隐 |
| 页码 | 8pt，橙色，右下 |

文字溢出防护（这是 1.0 偶发「灰色异常区域」的根因之一）：

- `.hero .copy` 限 7 行；`.image_text .copy` 限 18 行；`-webkit-line-clamp` + `overflow:hidden`；
- 每页 `overflow:hidden`，任何越界内容被裁切而不是把页面撑开；
- 照片容器有底色，图片加载失败时是**纸色块**而不是灰块（`.photo-missing`）。

---

## 6. 与 PDF 的关系

```
buildMagazineDocument(source)  →  renderMagazineHtml(doc)  →  expo-print  →  Share Sheet
```

- **不嵌 PDF**：分享出去的是 HTML 网页，PDF 只在用户点 Export PDF 时生成。
- 同一份 HTML 在两处使用：WebView 预览（`preview:true`）与打印（`preview:false`），
  差别只有视口、投影、外边距，**页面本身完全一致** —— 这就是「预览即所得」。
- 打印时图片必须是 data URI（`materializeBookPhotos` 已有能力），否则 WebView 打印会出现空白图。

---

## 7. 明确禁止（对应需求第九条）

| 禁止 | 原因 |
|---|---|
| 新增版式 / 主题 | 1.0 已冻结，2.0 只做两套组件的完成度 |
| AI 直接给像素级排版指令 | 不可测、不可复现 |
| 调整整体设计语言 | 与 1.0 品牌不连续 |
| 引入新的 AI 排版逻辑 | 同上 |
| 改 Letter 尺寸 | 破坏已导出 PDF 的一致性 |

允许修（对应需求第九条）：

- 明显拉伸 / 主体被截断 → 由 `pickLead` + `coverVisibleFraction` 处理；
- 文字溢出 → `line-clamp` + `overflow:hidden`；
- 页面渲染失败 / 空白页 / 灰块 → `.photo-missing` 纸色占位 + 章节无图时保留文字页。

---

## 8. 代码映射

| 文件 | 职责 |
|---|---|
| `src/features/v2/magazineDocument.ts` | 页序与版式选择（纯函数） |
| `src/features/v2/magazineRender.ts` | 10 个 `kind` → HTML/CSS |
| `src/features/v2/layoutEngine.ts` | `pickLead` / `splitPhotoRun` / 宽高比 |
| `src/features/v2/tokens.ts` | `MAGAZINE_TOKENS`、`PAGE`（Letter 尺寸） |

```ts
const doc = buildMagazineDocument(source, {
  chapterDividers: true,
  tripInfo: true,
  quotes: [{ chapterIndex: 1, text: '它停下来看了我一眼。', attribution: '深圳湾' }],
});
const html = renderMagazineHtml(doc, { preview: true });
```

---

## 9. 测试覆盖

| 断言 | 文件 |
|---|---|
| 封面第一页且带照片/标题 | `__tests__/v2-magazine-document-test.ts` |
| 行程页是第二页，事实数据正确 | 同上 |
| 每章一个分隔页（4 章 4 页） | 同上 |
| 完整页序与预期数组完全一致（14 页） | 同上 |
| 竖构图主图 → `image_text`，横构图 → `hero` | 同上 |
| 无照片章节仍保留文字页 | 同上 |
| 引语页插入 | 同上 |
| 关闭分隔页/行程页开关有效 | 同上 |
| 尾页最多 2 张照片 | 同上 |
| 两次构建结果一致（确定性） | 同上 |
| `@page size:letter` 与 mm 尺寸 | `__tests__/v2-render-test.ts` |
| 页数 = 文档页数（不丢页/不多页） | 同上 |
| 正文有 `line-clamp` 防溢出 | 同上 |

---

## 10. 预览产物

- `docs/v2/previews/magazine-preview.html` —— 14 页完整画册（内联 SVG 占位照片，离线可看）
- 生成命令：`node scripts/render-v2-previews.mjs`

> 生成方式说明：仓库没有 ts-node/tsx，所以脚本用自带的 tsc 把 `features/v2` 编译到临时目录再 require，
> 保证**预览与 App 用的是同一份渲染代码**，不是另外画的示意图。

---

## 11. 后续阶段（不在 Phase A）

1. 把 `features/v2` 提到 `packages/magazine`，让服务端分享页也能渲染 Magazine（当前服务端是另一份实现）；
2. Pro 主题：同一套 `kind` + 不同的 `MAGAZINE_TOKENS` / 少量 CSS 变量，**不新增组件**；
3. 高清 PDF（长边 1600 → 3000）作为 Pro 能力，走同一个渲染器只换 `MAX_PRINT_EDGE`。
