# Trailogue 2.0 — Phase B1

> 并行低冲突阶段：Codex 负责核心架构 / API/DB 兼容 / AI pipeline / 正式客户端接入 /
> 后端分享与 PDF 统一；本阶段只碰 `packages/book`、`ios-app/src/features/v2-ui`、
> mock preview 与文档。**1.0 运行时代码、`/v1`、数据库、Railway、Apple 登录、
> `app/**` 路由、AI pipeline 全部未改。**

## 1. 本阶段做了什么

| 任务 | 结果 |
| --- | --- |
| 扩充 mock 场景 | 18 → 31 个场景（1/2/3/5/6/7/8/12/24/30 图、全竖/全横/全方/混合/全景/9:16、超长标题、超长正文、极短正文、单章/2 章/8 章/12 章、无封面、字段全缺、中英双语） |
| V2 UI primitives | 新增 `Retry` + `retryPolicy`（纯函数）；`Button.fullWidth`、`LoadingState.compact`、`EmptyState.icon`、`SectionHeader.eyebrow`；`ErrorState` 接入重试计数 |
| 纯视觉微调 | 9 处版式修订，全部基于 mock preview 截图定位（见 §3） |
| 包文档与契约 | 新增 `CONTRACT.md`、`examples/render.mjs`；README 补 API 表与四条用法；183 个测试 |
| 分隔页节奏验证 | 8 条规则（新增 R8）+ 9 档规模扫描，节奏表由脚本生成 |

## 2. 场景矩阵

每个场景跑 4 类断言（Magazine 结构不变量 / Story 不变量 / 内容完整 / 确定性），
共 124 个场景用例。新增的 13 个场景针对**边界**而不是「再来一个正常旅行」：

- `5 / 6 / 7 张照片`：照片分组余数（2+3、3+3、1+3+3）
- `30 张照片`：20+ 的上界，页数线性、不空白
- `全方图`、`3:1 全景`、`9:16 极端竖图`：比例极端时是否退回留白
- `超长标题 + 极短正文`、`单图单句`：标题吃掉半个版心 / 内容薄到极限
- `双章节`、`12 章节`：分隔页在最小与最大章节数下的行为
- `无封面照片`、`空字段全缺`：字段缺失时结构不塌
- `英文长文`：拉丁文本换行估算

## 3. 视觉问题清单（按严重度）

全部来自「逐页截图 + 放大看」，都是结构性测试抓不到的问题。

| # | 现象 | 根因 | 修法 |
| --- | --- | --- | --- |
| 1 | 封面 3:2 横图上下各一条深色空带，像渲染失败 | 满幅页也套用 0.6 的可见比例阈值 → `contain` | 满幅页下限降到 0.34，只有 3:1 以上全景才留白 |
| 2 | hero 页顶部一条空带（每张横图都有） | 同上 | 同上 |
| 3 | 三图拼版里横图被塞进 0.56 的竖槽，上下大片米色 | 图版页不带 `lead`，永远用竖主图骨架 | 按首图方向选骨架；混合方向拆成「1 整版 + 2 同页」 |
| 4 | 双图页两张图比例不匹配、其中一张留白 | 固定「左半页」槽位（0.39），方图/横图必然留白 | 只有两张都是竖图才并排，否则上下分栏，行高按 1/宽高比分配 |
| 5 | 行程页中间 55% 全空，只有上下两行字 | `justify-content: space-between` | 改成「标题 / 日期 / 事实」三段，日期用 20pt 做视觉锚点 |
| 6 | 分隔页大号数字是页码（第 2 章显示 06） | 用 `number`（页码）当序号 | `MagazinePage.ordinal` 写入章节序号，测试断言严格递增 |
| 7 | 文图页的 2:3 竖图只有 68mm 宽，像缩略图 | 图片列 1.06fr + 自然高度 | 列宽 1.16fr，图框最小高度 = 版心 68%（裁切锁在阈值内） |
| 8 | Story 图组三张缩略图宽度不一致（第一张更宽） | `height:100%` + `aspect-ratio` 让浏览器按高度反推宽度 | 改成 `width:100%; height:auto` |
| 9 | 12 章 30 页的画册一个分隔页都没有，节奏平 | R5 分量门槛对「照片日记」型内容永远不满足 | 新增 R8 长书兜底节奏（等距补 1–3 个） |

## 4. 分隔页节奏（R1–R8）

完整规则与实测表见 [`CHAPTER_DIVIDER.md`](./CHAPTER_DIVIDER.md)。摘要：

| 规模 | 页 | 分隔页 | 位置 |
|---|---|---|---|
| 单章 4 图 | 6 | 0 | — |
| 2 章 4 图（短途） | 7 | 0 | — |
| 3 章 9 图 | 9 | 0 | — |
| 4 章 16 图 | 16 | 1 | 第 2 章 |
| 8 章 24 图 | 20 | 1 | 第 4 章 |
| 12 章 36 图 | 30 | 3 | 第 4/7/10 章 |

短途保持 0，中量 0–1，长书 1–3 且间距均匀 —— 这就是「呼吸而不是骨架」。

## 5. V2 UI

新增 `Retry`（组件）与 `retryPolicy`（纯函数）：

```ts
RETRY_POLICY = { maxAttempts: 3, baseDelayMs: 600, factor: 2, maxDelayMs: 4000 }

isRetryable(failureKindFromStatus(503))  // true
isRetryable(failureKindFromStatus(401))  // false —— 鉴权失败原地重试没意义
retryDelayMs(1)  // 600
retryDelayMs(3)  // 0 —— 到上限，交回用户手动重试
```

`Retry` 的行为被 5 个用例锁住：点一次只触发一次、busy 期间禁用、
次数用尽后换文案（"Still not working"）但**仍然允许手动重试**、
外部 busy 时不触发、无回调时不渲染假按钮。

> 命名踩坑：策略文件原本叫 `retry.ts`，在 Windows 上与 `Retry.tsx` 撞名
> （大小写不敏感），Metro 把组件解析成了策略文件。已改为 `retryPolicy.ts`。

## 6. 测试

| 测试集 | 命令 | 结果 |
| --- | --- | --- |
| `packages/book` | `npm --prefix packages/book test` | **183 通过 / 0 失败** |
| `ios-app` | `npm --prefix ios-app test` | **122 通过 / 28 套件** |
| `ios-app` 类型检查 | `npx tsc --noEmit` | 通过 |
| `packages/book` lint | `eslint src test examples` | 通过，0 warning |
| `ios-app` lint | `npx eslint .` | 通过 |

`packages/book` 的 183 个用例分布：

- `scenarios.test.ts`：31 场景 × 4 类断言 = 124
- `divider-rhythm.test.ts`：9 档规模 + 单调性 + 确定性 = 11
- `chapter-divider.test.ts`：R1–R8 逐条 = 13
- `layout-engine` / `text-fit` / `render` / `entitlements` = 35

## 7. 边界（明确没做）

- 没有改 `app/**`（Codex 正在接线 V2 预览）
- 没有改 `/v1`、数据库、Railway、Apple 登录、AI pipeline、生产分享页
- 没有 EAS build、没有部署
- `packages/book` 的 public API **只增不改**（新增导出，未删除或改签名；
  `figureFit` 增加可选第 5 参数）

## 8. 留给 Codex

1. V2 UI 真正挂到 `app/**`（Store / Book Preview 的 error/loading 态）
2. 把 `retryPolicy` 接进实际的请求层（目前是纯策略 + 被控组件，不发起请求）
3. Metro / Hermes 下 `@trailogue/book` 的真实打包验证
4. 服务端分享页切到 `renderMagazineHtml` / `renderStoryHtml` 同一份渲染器
5. 分隔页 `ordinal` 若要在服务端分享页显示，需要前端把 `page.ordinal` 透传
