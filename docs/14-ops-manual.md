# 14 · CloudBase 后台查看操作手册（运维）

> 适用：旅迹成书 云开发环境 `lvji-d6g41bt719c85fe54`（腾讯云账号 100052125926）。
> 目的：上线后不写代码，仅通过控制台完成日常查看、限流开关、数据清理与用户注销。

---

## 1. 控制台入口（二选一）

| 入口 | 路径 | 适用 |
|---|---|---|
| 腾讯云 CloudBase 控制台 | https://tcb.cloud.tencent.com → 环境 lvji-d6g41bt719c85fe54 | 功能全（日志/存储/数据库） |
| 微信开发者工具 → 云开发 | 工具顶部「云开发」按钮 | 日常快速查看 |

登录账号：腾讯云账号 100052125926（微信扫码）。

## 2. 核心集合速查

| 集合 | 内容 | 常用查询 |
|---|---|---|
| `users` | 用户档案 | `_openid` 精确查某人 |
| `albums` / `photos` | 相册/照片 | `album_id`、`status` |
| `ai_jobs` | 生成任务 | `status: pending/running/succeeded/failed` |
| `album_stories` | 故事正文 + generate_meta 成本数据 | `album_id`，按 `version` 倒序取最新 |
| `share_links` | 分享链接 | `album_id`、`revoked` |
| `app_config` | **全局配置（global 文档）** | 固定 `_id: global` |
| `daily_usage` | 每日用量 | `businessDate`（北京时间 YYYY-MM-DD） |
| `events` | 行为事件（保留 90 天） | `event_type`、`created_at`、`user_id` |

## 3. 每日用量怎么看（daily_usage）

文档结构：`_id = openid_业务日`，字段：

- `attemptCount`：当日发起生成次数（系统故障已自动回滚，不计）
- `successCount`：当日成功生成相册数
- `uniquePhotoCount` / `photoIds`：当日进入 AI 处理的去重照片数/清单
- `regenerationCount`：当日重生成次数

**查某天整体情况**：数据库 → daily_usage → 高级查询 `{"businessDate": "2026-08-30"}`。

## 4. 行为事件怎么看（events）

9 类事件：`app_open` / `user_created` / `album_create` / `upload_completed` / `generation_started` / `generation_succeeded` / `generation_failed` / `album_saved` / `album_shared`。

常用查询（高级查询 JSON）：

```json
// 某天的生成漏斗
{"event_type": "generation_succeeded", "created_at": {"$regex": "^2026-08-30"}}
// 失败任务（system_fault=true 是平台侧故障，已自动回滚尝试次数）
{"event_type": "generation_failed"}
```

⚠️ 隐私红线：events 中**不应出现** OpenID 明文、原图 fileID、完整 GPS、手机号、故事正文。字段只有 `user_id`（users._id 引用）、`album_id`、`job_id` 与脱敏 props。若发现违规字段立即删除该文档并排查来源。

### 90 天保留清理（当前为人工操作，每月一次）

1. 数据库 → events → 高级查询：`{"expire_at": {"$lt": "2026-11-30T00:00:00Z"}}`（填当天日期）
2. 全选查询结果 → 删除
3. 聚合统计（如需要长期保留）先用「导出」落盘再删

## 5. 生成任务排障（ai_jobs）

| 症状 | 查询 | 处置 |
|---|---|---|
| 用户反馈生成卡住 | `{"status": "running"}` 看 `updated_at` | 超 15 分钟无心跳会被自动回收；仍卡住可手动把 status 改 `failed`，用户重进即可重建 |
| 批量失败 | `{"status": "failed"}` 看 `error` | error 含 TIMEOUT/NETWORK → 平台侧故障，已自动回滚当日尝试次数 |
| 想看模型调用细节 | 对应 album_stories 最新版 `generate_meta` | 见下节 |

## 6. 成本观察（album_stories.generate_meta）

字段：`photo_count`（照片数）、`vision_call_count`（视觉调用次数）、`story_call_count`（文案调用次数）、`token_usage`（模型返回 token，模型不给时为 0）、`retry_count`（失败调用次数）、`generation_duration_ms`（总耗时）、`estimated_cost`（**null = 暂无可靠单价配置，不做伪造估算**）。

> 配置可靠单价后（商业化阶段），可在 generate_meta 补算 estimated_cost。

## 7. 限流总开关（app_config / global）

**开关限流**：数据库 → app_config → 文档 `global` → 编辑 `generationLimitEnabled`：
- `false`（当前默认）：所有限制休眠，仅记录用量
- `true`：启用五项限制（每日发起 5 次 / 每日成功 2 本 / 每日 100 张去重照片 / 并发 1 / 单相册重生成 2 次）

云函数有 60 秒内存缓存，改动最迟 1 分钟后生效，**无需重新部署**。
其余可调字段：`dailyGenerationAttemptLimit`、`dailySuccessfulAlbumLimit`、`dailyPhotoProcessingLimit`、`concurrentGenerationLimit`、`freeRegenerationLimitPerAlbum`。

## 8. 云函数日志

控制台 → 云函数 → 函数名（`internal-generateStory` / `photo` / `story`…）→ 日志：
- `[events] write xxx failed (ignored)` = 埋点写入失败但不影响业务（可忽略，频发再排查）
- `[app_config] load failed, fallback to defaults` = 配置读取失败已回退默认值
- `[daily_usage] bump failed (ignored)` = 用量记录失败（不影响业务）

## 9. 云存储管理

控制台 → 存储：照片原图/缩略图在 `photos/` 前缀，页图在 `temp/` 前缀（export 临时文件可定期清理）。
删相册目前是软删（albums.deleted=true），存储文件暂不级联删除——**存储空间紧张时**：筛选无引用文件（不在 photos.file_id / thumb_file_id 中的）人工清理。

## 10. 用户注销/删除请求（人工流程）

收到注销请求后：
1. events：高级查询 `{"user_id": "<users._id>"}` → 全选删除（或改 user_id 为 "deleted" 完成匿名化）
2. daily_usage：`{"_openid": "<openid>"}` → 全选删除
3. albums/photos/ai_jobs/album_stories/share_links：按 `_openid` 删除
4. 云存储：按 `photos/<openid>/` 前缀删除
5. users：删除该文档（如需保留统计口径，仅清空 nickname/avatar_url 并置 `deleted: true`）

> 具体保留口径以《隐私政策》为准；事件默认 90 天，用户数据按其选择的保留期（retention_days）。

## 11. 修改配置后要不要重新部署？

| 改动 | 是否需部署 |
|---|---|
| app_config 集合里的任何字段 | ❌ 60s 内自动生效 |
| events/daily_usage 数据增删 | ❌ |
| 云函数代码（TS） | ✅ 必须：本地 `npx tsc -p cloudfunctions/<fn>/tsconfig.json` 刷新 .js → CLI `--r` 部署 |
| 小程序代码 | ❌（开发者工具本地加载 .js）→ 发版需上传审核 |

---

*创建：2026-08-29（上线前最小改造，docs/13-launch-gap-analysis.md 落地配套）*
