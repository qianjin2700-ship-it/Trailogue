# 05 — API 接口契约（云函数）

## 0. 通用约定

- 调用方式：`wx.cloud.callFunction`，所有函数读取 `cloud.getWXContext().OPENID` 鉴权（无需显式传 token）；
- 响应统一包裹：

```jsonc
// 成功
{ "code": 0, "data": { /* ... */ } }
// 失败
{ "code": 40001, "message": "参数错误：name 不能为空" }
```

- 错误码表：

| code | 含义 |
|------|------|
| 0 | 成功 |
| 40001 | 参数校验失败（message 含字段名） |
| 40101 | 未授权（openid 缺失/无效） |
| 40301 | 无权操作该资源（非本人数据） |
| 40401 | 资源不存在 |
| 40901 | 状态冲突（如相册非 draft 不能重新上传结构） |
| 40902 | 照片数已达 50 张上限（commitUpload 拒绝） |
| 40903 | 存在未处理完成/失败的照片，禁止生成（需重试或移除） |
| 40904 | 文件校验失败（格式不支持/大小超限/文件损坏） |
| 42901 | 触发限流 |
| 50001 | 服务内部错误 |
| 50002 | 第三方服务失败（位置服务/模型 API） |
| 50003 | 任务超时/中断 |

- 限流：每 openid 每分钟云函数调用 ≤ 60 次；story 生成任务并发 ≤ 1/相册；
- 所有接口幂等键：请求可选携带 `request_id`，重复请求返回首次结果（防重试重复计费）。

## 1. auth — 登录/资料

### 1.1 `login`
```jsonc
// 入参：{}
// 出参 data:
{
  "openid": "oXXXX",
  "user": { "nickname": null, "retention_days": 90, "privacy_agreed_at": null },
  "need_privacy_agree": true
}
```

### 1.2 `updateProfile`
```jsonc
// 入参：{ "nickname": "小明" }
// 出参 data：{ "ok": true }
```

### 1.3 `agreePrivacy`
```jsonc
// 入参：{ "retention_days": 90 }   // 90 | -1
// 出参 data：{ "ok": true }
```

## 2. album — 相册

### 2.1 `createAlbum`
```jsonc
// 入参：
{ "name": "青海湖之行", "theme": "环湖骑行",
  "background": "毕业旅行", "relations": "我和室友", "highlights": "日出",
  "avoid_expressions": "不要过度煽情",
  "style": "warm_documentary", "style_custom": null,
  "content_length": "medium", "arrangement": "timeline" }
// 出参 data：
{ "album_id": "abc123", "status": "draft" }
// 校验：name 必填 ≤20；style ∈ {warm_documentary, casual_humor, literary, family, youth, concise, custom}；style=custom 时 style_custom 必填；
//       content_length ∈ {short, medium, long}（默认 medium）；arrangement ∈ {timeline, location, event}（默认 timeline）；其余 ≤ 上限字数
```

### 2.2 `updateAlbum` — 同 createAlbum 字段，必填 `album_id`
### 2.3 `listAlbums`
```jsonc
// 入参：{ "cursor": null, "limit": 20 }
// 出参 data：
{ "items": [ { "album_id": "...", "name": "...", "status": "done",
               "photo_count": 18, "cover_thumb_url": "https://...",
               "updated_at": "..." } ],
  "next_cursor": null }
```
### 2.4 `getAlbum`
```jsonc
// 入参：{ "album_id": "abc123" }
// 出参 data：
{ "album": { /* albums 文档 */ },
  "groups": [ /* photo_groups 摘要 */ ],
  "meta_summary": { "high": 32, "low": 6, "unknown": 2 },
  "active_job": { "job_id": "...", "type": "story", "progress": 0.6 } | null }
```
### 2.5 `deleteAlbum` — 入参 `{ album_id }`；取消进行中任务 → 级联删除（见流程 H2）→ `{ ok: true }`

## 3. photo — 照片

### 3.1 `commitUpload`（前端每张上传完成后调用）
```jsonc
// 入参：
{ "album_id": "abc123",
  "file_id": "cloud://...",
  "thumb_file_id": "cloud://...",
  "file_size": 2345678,
  "file_format": "jpeg",                       // jpeg | png | heic
  "file_hash": "sha256:...",                   // 重复检测依据
  "client_hint": { "taken_at": "ISO8601 | null" }   // 本地文件时间兜底（二级）
}
// 出参 data：
{ "photo_id": "p001", "upload_status": "uploaded", "photo_count": 6 }
// 校验：
//   1. photo_count ≥ 50 时拒绝，code=40902（前端同步提示已达上限）
//   2. 格式校验（仅 jpeg/png/heic）→ 失败 code=40001
//   3. 大小校验（≤20MB）→ 失败 code=40001
//   4. 损坏检测（文件头读取）→ 失败 code=40001
//   5. 重复检测（file_hash 匹配）→ 返回 is_duplicate=true + duplicate_of，前端弹窗让用户决定
// 副作用：若该相册首张，触发 meta 任务
```

### 3.2 `requestMetaProcess`
```jsonc
// 入参：{ "album_id": "abc123" }
// 用途：a) 新照片触发处理 b) 失败批次/失败照片重试 c) 主动重跑
// 幂等：已 succeeded 的照片/批次跳过，仅处理 pending/failed；从 ai_jobs.batches 断点续跑
// 出参 data：{ "job_id": "j001", "status": "running",
//              "batches": { "total": 4, "done": 2, "failed": 0 } }
```

### 3.3 `listPhotos`
```jsonc
// 入参：{ "album_id": "...", "group_id": null }
// 出参 data：{ "photos": [ /* photos 文档（含临时 thumb URL） */ ] }
```

### 3.4 `updatePhotoMeta`（用户补充/修改，三级之第三级）
```jsonc
// 入参：
{ "photo_id": "p001",
  "taken_at": "2026-08-15T14:32:00+08:00" | null,   // 可选修改项
  "location": { "city": "西宁市", "district": "城中区", "poi": "塔尔寺" } | null,
  "mark_unknown": ["location"]                        // 标为未知的字段列表
}
// 规则：写入后 taken_at_source/location.source 置 "user"，confidence=1.0，user_confirmed=true
// 出参 data：{ "ok": true }
```

### 3.5 `confirmMeta`（批量确认，流程 D3）
```jsonc
// 入参：{ "album_id": "abc123" }
// 前置：photo_count ≥ 5；元数据处理（EXIF+视觉理解）已完成
// 行为：按时间+地点+图片内容聚类 → 生成事实库快照（album_stories.kind=fact_base）→ albums.status=reviewing
// 出参 data：{ "fact_base_id": "fb001", "meta_summary": { "high": 38, "low": 0, "unknown": 2 } }
```

### 3.6 `reorderPhotos` — 入参 `{ photo_ids: ["p003","p001",...] }` → `{ ok: true }`
### 3.7 `deletePhoto` — 入参 `{ photo_id }` → 删存储文件+文档 → `{ ok: true }`

## 4. story — 故事生成与编辑

### 4.1 `generateStory`
```jsonc
// 入参：{ "album_id": "abc123" }
// 前置：存在 fact_base；photo_count ∈ [5, 50]；无进行中 story 任务；
//       全部照片处理完成（无 pending 批次，failed_photo_ids 为空）
//       —— 违反则 code=40903，message 附失败照片数量与处理选项
// 行为：创建 ai_job(type=story)，albums.status=generating
// 出参 data：{ "job_id": "j002" }
```

### 4.2 `getJobStatus`（轮询）
```jsonc
// 入参：{ "job_id": "j002" }
// 出参 data：
{ "status": "running", "stage": "chapter_3/5", "progress": 0.62,
  "batches": { "total": 10, "done": 6, "failed": 0 },   // 分批粒度进度
  "failed_photo_ids": [],                                // 失败照片（触发重试/移除 UI）
  "stage_message": "正在分析第 3/10 批照片",               // 阶段提示
  "estimated_remaining": 120,                             // 预计剩余秒数（不承诺固定完成时间）
  "result_ref": null, "error": null }
// status=succeeded 时 result_ref = album_stories._id
// status=failed 时 failed_photo_ids 非空 → 前端展示「重试失败项 / 移除失败照片」
```

### 4.3 `regenerateSection`
```jsonc
// 入参：{ "album_id": "...", "chapter_id": "ch2", "feedback": "更幽默一点" }
// 行为：单段重生成（携带该章事实子集 + 用户反馈），不整篇重算
// 出参 data：{ "job_id": "j003", "chapter_id": "ch2" }
```

### 4.4 `getStory`
```jsonc
// 入参：{ "album_id": "...", "version": null }   // null=最新
// 出参 data：{ "story": { /* StoryOutput */ }, "version": 2, "degraded": false }
```

### 4.5 `updateStory`（编辑保存）
```jsonc
// 入参：{ "album_id": "...", "patch":
//   { "title": "新标题",                       // 可选
//     "chapters": [ { "chapter_id": "ch2", "title": "...", "narrative": "...",
//                     "captions": { "p005": "新图说" } } ] } }
// 行为：version+1 落库
// 出参 data：{ "version": 3 }
```

## 5. share — 分享

### 5.1 `createShare`
```jsonc
// 入参：{ "album_id": "...", "expire_days": 30 }   // 7 | 30 | -1(永久)
// 出参 data：{ "share_id": "s001", "token": "a1b2..." , "path": "pages/shared-view/index?token=a1b2..." }
```

### 5.2 `revokeShare` — 入参 `{ share_id }` → `{ ok: true }`

### 5.3 `getSharedStory`（游客可调，云函数内不校验 openid 归属，校验 token）
```jsonc
// 入参：{ "token": "a1b2..." }
// 出参 data：
{ "story": { /* StoryOutput 脱敏版：不含 _openid 等私有字段 */ },
  "album_name": "青海湖之行", "expire_at": "..." }
// token 无效/撤销/过期 → code 40401, message "链接已失效"
```

### 5.4 `getShareQrCode`（生成分享海报用小程序码，校验 token 有效性）
```jsonc
// 入参：{ "token": "a1b2..." }
// 出参 data：{ "qrcode_base64": "iVBORw0KGgo..." }  // PNG base64，scene=token，落地页 pages/shared-view/index
// token 无效/撤销 → code 40401
// 小程序码生成失败 → code 50002（openapi 云调用不可用时降级走 HTTP，需 share 函数环境变量 WX_APP_ID / WX_APP_SECRET）
```

## 6. privacy — 数据管理

### 6.1 `deleteAllUserData`
```jsonc
// 入参：{ "confirm_text": "删除" }   // 必须等于"删除"
// 行为：H3 全量清理流程
// 出参 data：{ "deleted": { "albums": 3, "photos": 87, "stories": 3, "files": 174 } }
```

## 7. 内部云函数（前端不直接调用）

| 函数 | 触发方式 | 职责 |
|------|---------|------|
| `internal-processMeta` | 由 commitUpload/requestMetaProcess 经 callFunction 触发，自调用分批 | exifr 解析 → geo_cache 查/逆解析 → 写回 photos → 全部完成后自动触发 vision 批次 → 更新 job 进度 |
| `internal-processVision` | 同上，分批 | 拉云存储图 → 混元视觉 → 写 photos.vision.facts |
| `internal-generateStory` | generateStory 触发，逐章自调用续批 | 组装事实库 → 逐章生成 → JSON 校验（06 号 Schema）→ 汇总落库 |
| `internal-cleanup` | 每日定时触发器 | 过期原图清理、软删物理清理、僵尸任务（>30min running）标记失败 |

> **分批自调用规范（后台技术机制，不限制相册/章节照片数）**：
> 1. 每批最多处理 **5 张照片**（vision/meta），故事生成以**章**为批；
> 2. 5~50 张照片拆分为 1~10 个批次，批次清单写入 `ai_jobs.batches`；
> 3. **分批只是后台技术机制，不限制相册或章节中的照片数量**；
> 4. **每批结果立即持久化**（photos 字段写回 + batches.status 更新），任务中断后从首个未完成批次续跑，已完成批次不重算（省费用）；
> 5. 幂等：重复触发同一 job 只跑未完成批次；单批失败自动重试 1 次，仍失败标记该批 failed 并记录 photo_ids 到 failed_photo_ids；
> 6. **部分批次失败时任务整体标 failed，禁止生成缺少照片的最终相册**；前端引导用户选择「重试失败批次」「移除失败照片」「返回编辑」「取消本次生成」；
> 7. 长任务必须支持：幂等调用、断点续跑、任务进度查询、单批失败重试、超时恢复、任务取消、重复任务检测、已完成批次复用；
> 8. 进度按批次粒度实时更新（stage + progress + batches 统计），前端轮询展示完整阶段链：上传 → 解析 → 图片理解 → 排序与分组 → 生成故事 → 生成相册；
> 9. 显示预计处理时间，但**不得承诺无法保证的固定完成时间**。

## 8. 共享类型定义

前后端共享 `types/` 目录（打包进小程序端；云函数通过构建脚本复制引用），包含：
`ApiEnvelope<T>`、`Album`、`Photo`、`PhotoMeta`、`PhotoFact`、`StoryOutput`、`Chapter`、`Job`、`ErrorCode` 等接口，字段与本文档一一对应。
