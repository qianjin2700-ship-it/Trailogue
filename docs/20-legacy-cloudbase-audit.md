# 20 · 旧 CloudBase 资产与业务逻辑审计

> 审计日期：2026-10-16
>
> 审计方式：仓库源码、配置和历史迁移记录的只读检查；CloudBase CLI 只读连通性检查。
>
> 边界：未登录腾讯云、未访问或修改生产数据、未导出文件、未读取任何密钥值。

## 1. 结论摘要

旧系统可以作为业务规则和迁移映射的参考，但不能直接作为新 iOS 后端的实现规范。

- 仓库实际运行配置仍指向 `lvji-d6g41bt719c85fe54`：`miniprogram/app.ts` 与
  `cloudbaserc.json` 一致。
- `docs/19-cloud-env-migration.md` 记录曾把函数部署到
  `yaomiao-d3g3u7ckz71fffd26`，并声称前端已切换；这与当前源码冲突。两个环境都必须在
  登录后分别核验，不能根据文档认定任何一个仍有数据。
- 本机存在 CloudBase CLI 3.8.0，但没有有效登录态，也没有发现常见环境变量凭据。执行
  `cloudbase env list` 返回“无有效身份信息”。线上环境、数据库、存储和函数状态因此仍是
  **未验证**，不是“已销毁”或“可迁移”。
- 源码初始化 11 个集合，但 `photo_groups` 和 `fact_base` 设计并未真正落地。
- 值得迁移的是可验证存在的用户旅行内容、照片对象和故事版本；运行中任务、微信分享、
  用量计数和小程序配置不应原样迁移。

## 2. 资源清单

### 2.1 环境与配置

| 资源 | 源码证据 | 审计状态 |
| --- | --- | --- |
| `lvji-d6g41bt719c85fe54` | `miniprogram/app.ts`、`cloudbaserc.json` | 当前仓库目标；线上未验证 |
| `yaomiao-d3g3u7ckz71fffd26` | `docs/19-cloud-env-migration.md`、`scripts/migrate/*` | 历史部署目标；线上未验证 |
| 云函数 | 12 个目录，Node.js/TypeScript，主要依赖 `wx-server-sdk` | 源码存在；部署状态未验证 |
| 云存储 | `albums/*`、`export/pdf-pages/*`、`export/*` 路径 | 引用规则存在；对象数量未验证 |
| 密钥配置 | TokenHub、腾讯 LBS、微信 App 凭据名称 | 只确认变量名；值和有效性未验证 |

需要核验的环境变量名称只有：`TOKENHUB_API_KEY`、`MODEL_NAME`、
`MODEL_ENDPOINT`、`TENCENT_LBS_KEY`、`WX_APP_ID`、`WX_APP_SECRET`。
迁移脚本还读取 `TCB_SID` / `TCB_SKEY`。不得把任何旧值写入仓库。

### 2.2 数据集合

`cloudfunctions/internal-init/index.ts` 是实际集合清单的最强静态证据。

| 集合 | 实际用途 | 迁移处理 |
| --- | --- | --- |
| `users` | OPENID 用户、昵称、隐私同意、原图保留期 | 不直接变成新账号；仅保留旧所有权映射 |
| `albums` | 旅行主记录、生成设置和状态 | 映射为 `trips` |
| `photos` | 对象引用、哈希、EXIF、地点、视觉结果、排序 | 映射为 `photos`，对象必须另行复制和校验 |
| `photo_groups` | 设计中的章节分组 | 源码从未写入；只在真实导出非空时迁移 |
| `album_stories` | 故事 JSON 和版本 | 映射为 `stories`；核对照片引用完整性 |
| `ai_jobs` | meta/vision/story 异步任务状态 | 不迁移活动状态；可归档作审计证据 |
| `share_links` | 微信小程序分享 token | 不迁移为有效链接；新系统重新签发 |
| `geo_cache` | 腾讯 LBS 逆地理缓存 | 默认不迁移；可从照片坐标重新生成 |
| `app_config` | 小程序限额和商业化开关 | 不迁移；重建服务端配置 |
| `daily_usage` | 按 OPENID 的每日 AI 用量 | 不迁移到新计费账本 |
| `events` | 90 天行为事件 | 仅在有分析价值且符合法务要求时归档 |

### 2.3 对象存储

已识别的对象路径：

- 原图：`albums/{albumId}/origin/*`
- 缩略图：`albums/{albumId}/thumb/*`
- PDF 中间页图：`export/pdf-pages/{openid}/*`
- 生成 PDF：`export/{openid}/{albumId}/*`

CloudBase `cloud://` fileID 与环境绑定，不能通过字符串替换完成可靠迁移。迁移必须下载实际
字节、计算校验和、上传到新对象存储，再更新数据库映射。仓库中的
`scripts/migrate/internal-remap` 只能作为字段定位参考，不能作为新迁移工具直接使用。

## 3. 可复用业务规则

以下逻辑可移植为平台无关的 TypeScript 模块和服务端规则：

- 旅行照片 5～50 张、单文件最大 20 MB、jpeg/png/heic 白名单。
- 基于文件哈希的重复检测，以及用户决定是否保留重复照片的交互。
- 元数据优先级：用户确认 > EXIF > 本地文件时间 > 未知。
- EXIF 时间合理性、GPS 边界检查、地点逆解析缓存键规则。
- `timeline` / `location` / `event` 三种编排策略和 8 张一组的拆分算法。
- AI 不得虚构人名、地点、事件和对话；输出需关联照片 ID；失败时可生成模板内容。
- 故事版本化、章节编辑、分享撤销、数据删除、任务幂等和僵尸回收的产品意图。
- PDF 的“客户端/渲染器生成页图，服务端合并为 PDF”思路及分页排版算法。

这些规则需要测试后迁移，不能直接复制 CloudBase 数据访问代码。

## 4. 必须重写的基础设施

- OPENID 登录、`cloud.getWXContext()` 所有权判断和微信隐式会话。
- `wx.cloud.callFunction` API、CloudBase 查询表达式与 Cloud Function 自调用。
- `cloud://` fileID、临时 URL、上传和删除流程。
- 微信小程序码、朋友圈分享和微信文件/相册 API。
- 腾讯 LBS/TokenHub 的硬编码供应商适配；保留 provider 接口，供应商可替换。
- 长任务执行器、队列、重试、可观测性和取消机制。
- PDF/Book 持久化模型；旧系统只有即时导出的 PDF 文件，没有正式 Book 实体。
- Apple 登录、统一用户身份、账号删除和未来多身份绑定。

## 5. 源码与文档不一致及数据风险

迁移程序必须按真实导出数据做容错，不能假定文档模型完整：

1. `photo_groups` 从未写入；`confirmMeta` 返回固定 `placeholder`，`fact_base` 未落库。
2. `internal-processVision` 是桩，实际视觉理解内联在 `internal-generateStory`。
3. `albums.story_id` 写入的是 AI job ID，而不是新建的 story 文档 ID。
4. 单章重生成只创建 `regen_section` job，但通用执行器未按 job 类型读取章节 payload，可能实际
   重新生成整本故事。
5. AI 输出只校验章节数量和 narrative 非空；声明的 AJV Schema、照片引用完整性和反虚构
   后校验并未落地。
6. EXIF 批次达到最大失败次数后，meta job 仍会被标记为 succeeded。
7. 软删清理计算了 24 小时 cutoff 却没有用于查询；相册物理删除也没有级联子集合。
8. 全量删除只覆盖照片对象和主要业务文档，未覆盖导出 PDF、中间页图、events 和
   daily_usage，不能复用为 iOS 账号删除实现。
9. `albums` 列表没有真实 cursor；`next_cursor` 始终为 null。
10. 支付只有 `paymentEnabled=false` 配置占位，没有订单、支付或订阅实现。

## 6. 只读线上核验步骤

需要用户在本机完成一次 `cloudbase login`。登录会打开腾讯云授权流程，因此必须由账号持有人
操作。登录后依次执行只读查询，并对两个环境分别留证：

1. `cloudbase env list`
2. `cloudbase env detail -e <env-id>` 与 `cloudbase env usage -e <env-id>`
3. 列出函数、数据库集合和存储根目录；不要执行 init、deploy、renew、delete、upload 或 update
4. 对集合只记录计数、索引和脱敏字段样本，不输出 OPENID、照片 URL、正文或密钥
5. 对存储记录对象数量、总字节数和前缀；抽样下载仅在确定导出目录后进行
6. 先生成只读清单和迁移估算，再单独审批实际导出

当前阻塞原因是“CLI 未登录”，不是网络不可达。线上审计完成前，旧 albums 的迁移范围保持
未确定。

## 7. 迁移分级

| 等级 | 内容 | 动作 |
| --- | --- | --- |
| P0 | 原图、缩略图、albums、有效 story 版本 | 可访问时优先导出和校验 |
| P1 | users 所有权映射、照片元数据、分享摘要 | 脱敏迁移或用于归属核对 |
| P2 | events、daily_usage、历史 job | 仅合规归档，不进入主业务库 |
| 丢弃 | 微信分享码、活动 token、运行中 job、小程序配置 | 新后端重建 |

身份迁移不能把 OPENID 自动等同于 Apple 用户。若旧数据确实需要交还真实用户，必须另设计
一次性、可审计的认领流程；若旧环境只有测试数据，应明确销毁而不是制造错误归属。
