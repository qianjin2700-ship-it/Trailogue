# 13 · 上线前最小改造差距分析（2026-08-29，只读检查，未改任何代码）

> 本轮范围：不影响上线的最小改造，共 11 项能力。本文为差距分析报告，**等待确认后才开始实施**。
> 手机号绑定、商业化、usage_ledger、广告、支付、独立管理后台、精确成本、强制更新/灰度 —— 本轮仅在设计层预留，不实施。

---

## 一、11 项能力逐条现状

| # | 能力项 | 现状 | 结论 |
|---|--------|------|------|
| 1 | 微信身份自动识别 + 最小 users 记录 | ✅ 已有。app.ts onLaunch 自动走 code2session 登录；auth 云函数幂等 upsert users（openid + created_at 等） | **无需改动** |
| 2 | 相册与用户关联 | ✅ 已有。albums 带 owner 标识；2026-08-29 安全审查已给全部业务函数补齐归属校验（photo.reorder/metaProcess、getJobStatus、export、internal-* 直调均已防越权） | **无需改动** |
| 3 | 集中式 app_config | ❌ 全新。全库 0 命中，当前无任何配置集合，限制值散落硬编码 | **上线前必补** |
| 4 | 每相册 5~50 张照片 | ✅ 已有。photo 云函数 `MAX_PHOTOS=50`（commitUpload 拦截 40902）；story 生成前校验「5~50 张」（40001）+ 至少 5 张（photo:399） | **无需改动**（数值迁移进 app_config 后改读配置） |
| 5 | 服务端防滥用限流 | ❌ 全新。无 daily_usage 集合，无任何每日/并发/重生成限制逻辑 | **上线前必补（工作量最大项）** |
| 6 | 生成任务幂等 | ✅ 基本已有。story.generate：查同 album pending/running 任务 → 存在且未僵死则返回 `resumed:true`；>15 分钟无心跳自动回收重建。重复点击/并发创建已防住 | **小补**：配额里对「同任务失败批次重试不重复计数」需与限流联动 |
| 7 | 10 个核心行为事件 | ❌ 全新。无 events 集合、无 trackEvent。**注意：项目当前没有反馈入口页面**，`feedback_submitted` 无宿主 | **上线前必补**（feedback 事件二选一，见下） |
| 8 | 数据库和云存储权限检查 | ✅ 大部分已有。2026-08-29 已完成 8 集合权限规则 + 7 索引 + token 唯一索引，回读校验通过 | **小补**：新增集合（app_config/daily_usage/events）的规则随建随配；云存储规则需复核一次 |
| 9 | wx.getUpdateManager | ❌ 全新。app.ts 无更新管理逻辑 | **上线前必补（前端小改，半天内）** |
| 10 | CloudBase 后台查看操作手册 | ❌ 待编写。docs 现有 12 份设计文档，无运维/查看手册 | **上线前必补（纯文档）** |
| 11 | 核心功能回归测试 | 🟡 部分。已有 `09-acceptance-tests.md` 用例清单，但多项功能（导出、EXIF、生成链路）尚在「待用户实测」状态 | **上线前执行一轮** |

---

## 二、免费阶段限制 → 配置落位设计

**目标形态**：单一 `app_config` 集合（或文档），字段：

```
minPhotosPerAlbum = 5
maxPhotosPerAlbum = 50
dailyGenerationAttemptLimit = 5
dailySuccessfulAlbumLimit = 2
dailyPhotoProcessingLimit = 100
concurrentGenerationLimit = 1
freeRegenerationLimitPerAlbum = 2
generationLimitEnabled = false   // 总开关：当前 false，限制逻辑就绪但休眠
freeGenerationLimit = -1        // 预留商业化字段，本轮不用
adsEnabled = false              // 预留，本轮不用
paymentEnabled = false          // 预留，本轮不用
```

**读取方式**：云函数侧各业务函数启动时读一次（可加内存缓存 60s）；前端不直接依赖这些值展示购买/会员/广告入口（第 8 条规则天然满足——本轮压根没有这些 UI）。

**daily_usage（唯一新增数据结构，简化版）**：

```
userId, businessDate(Asia/Shanghai 日),
attemptCount, successCount, uniquePhotoCount, regenerationCount, updatedAt
```

- `uniquePhotoCount` 用 `photoIds` 去重集合（当日子文档/数组）实现「重试不重复计数」；
- 系统故障（internal-generateStory 返回 errorCode ∈ 已知服务故障白名单，如模型超时/5xx）→ 回滚 attemptCount，不计入；
- 限制只挂在「新建生成任务」入口（story.generate），查看/编辑/保存/分享链路零改动（规则 7）。

**usage_ledger 未来结构**：仅在本文预留字段设计（userId / date / event_type / quota_delta / balance_after / ref_id），本轮不建集合。

---

## 三、10 个核心埋点落位

| 事件 | 写入位置（建议） | 关键字段（不含禁区字段） |
|------|------------------|--------------------------|
| app_open | app.ts onLaunch → 调 auth 云函数附带 | 场景值、平台、基础库版本 |
| user_created | auth upsert 首次建档时 | 无 openid 明文（用 userId 引用） |
| album_create | album 云函数 create | albumId、photoCount(0)、编排方式 |
| upload_completed | photo 云函数 commitUpload 完成 | albumId、photoCount、耗时 |
| generation_started | story 云函数 generate 建任务成功 | albumId、jobId、photoCount、attempt 编号 |
| generation_succeeded | internal-generateStory 落库成功 | albumId、jobId、degraded、耗时、tokenUsage |
| generation_failed | internal-generateStory 失败路径 | albumId、jobId、errorCode、是否服务故障 |
| album_saved | story 云函数 save/edit | albumId、编辑方式 |
| album_shared | share 云函数 create | albumId、渠道（转发/海报/链接） |
| feedback_submitted | **无宿主页面** → 二选一 | 内容摘要 hash（不存正文） |

**feedback_submitted 二选一（需你拍板）**：
- A. profile 页加一个极简反馈入口（textarea + 提交直写 events），约 +0.5 天；
- B. 本轮只埋其余 9 个事件，feedback 事件随反馈功能上线后再加（推荐，符合「最小改造」）。

**隐私红线（规则 3）**：events 文档只存 userId 引用 + 脱敏字段，**严禁**原图 fileID、完整 GPS、手机号、OpenID 明文、故事正文。
**保留 90 天（规则 1/2）**：events 落库带 `expireAt`；本轮用 CloudBase 定时触发器每日清理（或先在手册中写人工清理路径，上线后自动化，需你拍板）。
**注销匿名化（规则 4）**：本轮无注销功能，仅在手册中写明「人工处理流程」：删除 events by userId + users 文档置匿名。

---

## 四、成本数据现状与补齐

internal-generateStory 已写 `story.ai.generate_meta`：

| 要求字段 | 现状 | 动作 |
|----------|------|------|
| photoCount | 可从任务上下文取，未显式存 | 补字段 |
| visionCallCount / storyCallCount | 只有聚合 `call_count` | 拆分两个计数 |
| tokenUsage | ✅ 已有 `total_tokens`（含 usage 解析） | 保留 |
| retryCount | 有 `error_codes` 数组可推导 | 补显式 retryCount |
| generationDuration | ❌ 缺失 | 补 startedAt/finishedAt 差值 |
| estimatedCost | ⚠️ `total_cost_estimate: 0` **硬编码 0，违反"无法可靠计算返回 null"** | **必改：无单价配置时写 null** |

---

## 五、优先级汇总

### ✅ 已存在，无需开发（4 项）
身份/users（1）、相册关联（2）、5~50 张限制（4）、生成幂等主体（6）、权限规则主体（8）

### 🔴 上线前必须补齐
1. **app_config 集中配置**（项 3）— 新集合 + 各函数读配置改造
2. **daily_usage + 防滥用限流**（项 5）— 新集合 + story/photo 入口校验 + 故障不计次 + 去重计数
3. **9~10 个核心事件**（项 7）— 新集合 + 各触发点写入（全部 try/catch 吞错，埋点失败不影响主链路）
4. **成本 meta 修正**（第五节）— estimatedCost→null、拆 call 计数、补 duration/retryCount/photoCount
5. **wx.getUpdateManager**（项 9）— app.ts 静默更新 + applyUpdate
6. **CloudBase 后台查看手册**（项 10）— 纯文档：怎么看用量/任务/事件/存储/日志、人工清理与注销处理流程
7. **回归测试执行**（项 11）— 按第五节方案跑一轮

### 🟡 可上线后再做
- feedback 入口与 feedback_submitted 事件（若选方案 B）
- events 90 天自动清理定时器（先手册人工路径）
- 注销/匿名化自动化
- usage_ledger 完整账本、AD_REWARD/PURCHASE/BONUS、单价配置与 estimatedCost 计算
- 云存储规则深度复核（本轮仅检查性过一遍）

---

## 六、影响面清单

| 层 | 改动 |
|----|------|
| 集合新增（3） | `app_config`、`daily_usage`、`events`（+ 各自索引与权限规则） |
| 云函数改动 | `story`（限流校验+事件+幂等联动）、`internal-generateStory`（成本 meta+成功/失败事件）、`photo`（每日 100 张处理限流+upload 事件）、`album`（create 事件）、`auth`（user_created/app_open 事件+可顺带下发 app_config）、`share`（album_shared 事件） |
| 云函数不动 | export、internal-processMeta（EXIF 链路零风险） |
| 前端页面 | app.ts（getUpdateManager+app_open）；其余事件均在云端写，**页面 UI 基本零改动**；限流触顶的提示文案在 story-generating 页 catch 处补 |
| 风险点 | story 与 internal-generateStory 是核心链路，改动需回归；所有新逻辑均「失败放行」设计（读不到配置/写事件失败 → 不阻塞主流程） |

**是否延误上线：不构成重大延误。** 估计 1.5~2.5 天开发 + 0.5 天回归。限流开关 `generationLimitEnabled=false` 意味着即使限流代码有 bug，总开关一关即回到现状行为。

## 七、最小测试与回滚方案

**测试（最小集）**：
1. 限流：临时开 generationLimitEnabled → 连续 6 次发起生成，第 6 次应被拒；成功 2 本后第 3 本应被拒；同任务失败重试不重复计数
2. 幂等：快速双击「生成」，仅创建 1 个 ai_jobs
3. 事件：操作一轮后 events 出现 9 类文档，抽查无 OpenID/GPS/正文
4. 更新管理：开发者工具「编译模式→下次编译模拟更新」验证弹窗
5. 回归：EXIF 生成链路（真机）+ 导出长图/PDF + 分享三通道 + 09-acceptance-tests 核心用例

**回滚**：
- 前端：还原 app.ts 等改动 → tsc 重新编译即回滚（无数据结构依赖）
- 云函数：重新部署上一版（git 检出旧提交再 deploy）
- 限流：app_config 置 generationLimitEnabled=false，即时生效
- 埋点：events 写入全部包 try/catch，最坏情况=少数据，不影响功能
- 新集合：留着无害，无需回滚

---

## 八、待你拍板的 3 个决策点

1. **feedback_submitted 事件**：方案 A（加极简反馈入口 +0.5 天）/ 方案 B（本轮只埋 9 个，推荐）
2. **events 90 天清理**：本轮上定时触发器（+0.5 天）/ 先手册人工路径（推荐）
3. **限流默认状态**：按你的配置 generationLimitEnabled=false 上线（逻辑休眠，随时开）/ 上线即开

确认后我按「app_config → daily_usage/限流 → 事件埋点 → 成本 meta → getUpdateManager → 手册 → 回归」顺序实施。
