# 输入 / 输出契约

这份文档定义 `@trailogue/book` 对外承诺什么、不承诺什么。
**它是消费者（iOS / Railway / 未来的 Web）与渲染层之间唯一需要对齐的东西**，
改动这里的任何一条都属于破坏性变更，必须同时改版本号与三端调用。

---

## 1. 数据流

```
        输入（内容）                       编排（纯函数）                 输出（可渲染）
┌───────────────────────┐        ┌──────────────────────┐        ┌──────────────────┐
│  CreateSourceInput    │  ───▶  │  DocumentSource      │  ───▶  │  StoryDocument   │ ───▶ renderStoryHtml
│  （1.0 DTO / AI 结果）│        │  （归一化后的内容）  │        │  MagazineDocument│  ───▶ renderMagazineHtml
└───────────────────────┘        └──────────────────────┘        └──────────────────┘
                                          │
                                          └──▶ MagazinePlan（文档 + 分隔页决策报告）
```

三层职责严格分开：

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| 输入归一化 `createDocumentSource` / `sourceFromStory` | 去重、裁剪、剔除失效照片引用、计算 stats | 任何版式判断 |
| 编排 `buildStoryDocument` / `planMagazine` | 顺序、图文配比、分页、分隔页决策 | 像素、字号、颜色 |
| 渲染 `renderStoryHtml` / `renderMagazineHtml` | 结构 + 内联 CSS + 转义 | 内容理解、网络请求 |

---

## 2. 输入契约

### 2.1 `CreateSourceInput`（推荐入口）

```ts
interface CreateSourceInput {
  language?: string | null;       // 'zh' | 'en' …，决定日期格式与引号
  title: string;                  // 必填；允许长标题，渲染器负责换行
  subtitle?: string | null;
  preface?: string | null;        // Story 的序 / Magazine 不使用
  epilogue?: string | null;       // 尾声，Magazine 会做尾页
  chapters: Array<{
    chapterId: string;            // 稳定 id，用于分隔页决策与调试
    title: string;
    dateLabel?: string | null;
    locationLabel?: string | null;
    narrative: string;            // 支持 \n\n 分段
    photoIds: string[];
    captions?: Record<string, string> | null;  // photoId → 说明
  }>;
  photos: Array<{
    id: string;
    url: string;                  // https: / data: / file: 以外的协议会被丢弃
    width?: number | null;        // 缺失时按 3:2 估算（DEFAULT_ASPECT）
    height?: number | null;
    caption?: string;
  }>;
  coverPhotoId?: string | null;   // 缺失/失效时回退到第一张
  startDate?: string | null;      // ISO yyyy-mm-dd
  endDate?: string | null;
}
```

**归一化保证**（`createDocumentSource` 会做，调用方不用重复做）：

- 照片按 `id` 去重，先出现的胜出；
- `chapter.photoIds` 里指向不存在照片的 id 被静默剔除（照片删了，文字仍然可读）；
- `title` / `narrative` 做 `trim()`，空字符串章节会被编排器整章跳过；
- `coverPhotoId` 失效时按「章节顺序的第一张 → 照片列表第一张 → null」回退；
- `stats` 由包内计算，调用方传的值不被采用。

### 2.2 `sourceFromStory`（1.0 兼容入口）

```ts
sourceFromStory(storyContent, photos, { coverPhotoId, startDate, endDate })
```

用于把 1.0 的 `StoryContentDTO` 直接转成 `DocumentSource`。
1.0 的数据结构不变，这个函数只读不写。

---

## 3. 输出契约

### 3.1 `StoryDocument`

```ts
interface StoryDocument {
  version: 1;
  language: string;
  title: string;
  blocks: StoryBlock[];   // header → paragraph? → (section → figure* → quote?)* → closing?
  stats: { chapterCount: number; photoCount: number; textLength: number };
}
```

保证：

- `blocks[0].type === 'header'`；
- 每个有内容的章节至少产生一个 `section`，顺序与输入一致；
- `figure` 的 `photos.length ∈ [1, 3]`，`layout` 与数量严格对应（1→large / 2→pair / 3→gallery）；
- `closing` 最多一个，且一定在最后；
- 空章节不产生任何块（不会留下空标题）。

### 3.2 `MagazineDocument`

```ts
interface MagazineDocument {
  version: 1;
  language: string;
  title: string;
  subtitle?: string;
  trip: { dateLabel?: string; locationLabel?: string; photoCount: number; chapterCount: number };
  pages: MagazinePage[];
}
```

保证：

- 首页 `cover`、末页 `closing`；
- 章节内容页按输入顺序出现，不交错；
- `hero` / `full_width` 恰好 1 张图；`two_spread` 2 张；`three_collage` 3 张；
- `chapter_divider` 的 `ordinal` 是**章节序号**（不是页码），且严格递增；
- `two_spread` / `three_collage` 一定带 `lead`（决定骨架方向）；
- 同一输入重复调用，`pages` 逐字段相同。

### 3.3 HTML

`renderStoryHtml(doc, { preview })` / `renderMagazineHtml(doc, { preview, pageNumbers })`

| 选项 | 含义 |
| --- | --- |
| `preview: true` | 加预览背板与纸张投影；Story 额外注入 1.0 的 `postMessage` 协议（`preview-ready` / `photo-error`） |
| `preview: false`（默认） | 纯净文档，带 `@page{size:letter;margin:0}`，可直接交给 expo-print / 服务端 |
| `pageNumbers: false` | 隐藏页码（封面本来就没有） |

保证：

- 输出是**完整 HTML 文档**（含 `<!doctype html>`），可直接进 WebView / `Print.printAsync`；
- 所有用户内容经 `escapeHtml`；`javascript:` / `vbscript:` / 非图片 `data:` 一律被丢弃并渲染成占位块；
- 同一文档两次渲染逐字节相同（无随机、无时间戳、无 id 生成）。

### 3.4 `MagazinePlan`

```ts
planMagazine(source, options) → {
  document: MagazineDocument,
  dividerPlan: { chapterIds, skipped: { chapterId, reason }[], maxDividers, estimatedPageCount, enabled },
  estimatedPageCount: number,   // 不含分隔页
}
```

`dividerPlan.skipped[].reason` 的取值是稳定的（`single-chapter` / `short-book` /
`few-photos` / `first-chapter` / `below-weight` / `over-cap` / `too-close` /
`empty-chapter` / `disabled`），可以安全地用于日志与调试面板。

---

## 4. 不承诺的部分

- **不做图片处理**：不压缩、不裁剪文件、不生成缩略图、不上传。
- **不做内容理解**：不摘要、不改写、不挑照片。引语页的候选由调用方传入。
- **不读环境**：不读 `process.env`、不请求网络、不碰文件系统。
- **不保证 A4**：Letter 已冻结（2.0 第一阶段）。
- **不保证像素级跨端一致**：字体栈在 iOS / Android / Node 上解析不同，
  版式（页数、图数、行数上限）一致，字宽可能有 ±5% 差异 —— 因此文字容量估算
  一律偏保守（只高估行数，不低估）。

---

## 5. 变更策略

| 变更 | 影响 | 要求 |
| --- | --- | --- |
| 新增可选字段 | 向后兼容 | 直接加，`version` 不变 |
| 改视觉常量（字号 / 边距 / 阈值） | 输出 HTML 变化 | 必须同时改测试与 `docs/v2/` 对应设计文档 |
| 改结构（block/page 类型增删） | 破坏性 | `version` +1，三端同步，旧版本保留一个迭代 |
| 改 `DocumentSource` 字段语义 | 破坏性 | 同结构变更 |

判断标准很简单：**服务端渲染的分享页与 App 内预览必须出自同一份输入**。
只要这条成立，改哪一层都不会出现「两边长得不一样」。
