# 04 — 数据库模型（CloudBase 云数据库）

> 集合均为文档型。所有用户数据集合冗余 `_openid` 字段（CloudBase 写入时自动注入），权限规则见文末。

## 1. users — 用户

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",            // 微信 openid
  "nickname": "string | null",   // 可选授权
  "avatar_url": "string | null",
  "privacy_agreed_at": "ISO8601 | null",   // 同意隐私政策时间
  "retention_days": 90,          // 原图保存期：90 | -1(永久)
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

## 2. albums — 相册

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",
  "name": "青海湖之行",           // ≤20 字
  "theme": "环湖骑行",
  "background": "毕业旅行，四个人一辆车",     // 用户输入，≤200
  "relations": "我和大学室友",               // 人物关系，≤50
  "highlights": "想突出湖边的日出",           // 强调内容，≤100
  "style": "warm_documentary",   // warm_documentary | casual_humor | literary | family | youth | concise | custom
  "style_custom": null,           // 自定义文风提示词（style=custom 时填写）
  "avoid_expressions": null,     // 希望避免的表达（≤100 字）
  "status": "draft",             // draft | reviewing | generating | done | failed
  "photo_count": 0,              // 已上传照片数（上限 50，服务端 commitUpload 强校验）
  "fact_base_snapshot_id": "<album_stories._id | null>",  // 确认后的事实库快照
  "story_id": "<album_stories._id | null>",
  "cover_file_id": "cloud://... | null",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "deleted": false               // 软删标记（清理任务兜底后物理删除）
}
```

## 3. photos — 照片

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",
  "album_id": "<albums._id>",
  "file_id": "cloud://.../origin.jpg",      // 原图
  "thumb_file_id": "cloud://.../thumb.jpg", // 缩略图
  "upload_status": "uploaded",   // uploading | uploaded | failed | checking | duplicate
  "file_size": 1234567,
  "file_format": "jpeg",        // jpeg | png | heic
  "file_hash": "sha256:...",    // 重复检测依据
  "is_duplicate": false,        // 重复标记（用户决定是否保留）
  "duplicate_of": null,         // 重复的源照片 ID
  "fail_reason": null,          // 上传失败原因（格式/大小/损坏/网络）

  // ===== 元数据（三级降级结果）=====
  "taken_at": "ISO8601 | null",
  "taken_at_source": "exif",     // exif | file_meta | inferred | user | unknown
  "taken_at_confidence": 1.0,    // 0~1

  "location": {                  // null 表示完全未知
    "lat": 36.6789, "lng": 101.7788,   // 数值 | null
    "city": "西宁市", "district": "城中区", "poi": "塔尔寺",
    "source": "exif",            // exif | inferred | user | unknown
    "confidence": 0.0            // 0~1
  },

  "orientation": 1,              // EXIF 方向；null=未知
  "raw_exif": { "make": "...", "model": "..." },  // 原始 EXIF 摘要（脱敏，仅设备相关）

  // ===== 视觉理解结果（F07）=====
  "vision": {
    "facts": [                   // 结构化事实，见 06 号文档
      { "type": "scene", "value": "湖边日出", "confidence": 0.92 }
    ],
    "status": "pending",         // pending | done | failed
    "error": "string | null"
  },

  "group_id": "<photo_groups._id | null>",   // 聚类结果
  "sort_index": 0,               // 全局排序（时间序，用户可调）
  "user_confirmed": false,       // 用户是否确认过元数据
  "created_at": "ISO8601",
  "deleted": false
}
```

## 4. photo_groups — 照片分组（章节雏形）

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",
  "album_id": "<albums._id>",
  "title": "第2天 · 西宁",        // 自动生成，可被故事章节覆盖
  "time_start": "ISO8601 | null",
  "time_end": "ISO8601 | null",
  "location_label": "西宁市城中区",
  "photo_ids": ["<photos._id>", "..."],
  "sort_index": 0,
  "created_at": "ISO8601"
}
```

## 5. album_stories — 事实库快照 + 故事版本

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",
  "album_id": "<albums._id>",
  "kind": "fact_base",           // fact_base | story
  "version": 1,

  // kind=fact_base 时：
  "fact_base": {
    "photos": [ /* PhotoFact[]，见 06 号文档 */ ],
    "user_inputs": { "background": "...", "relations": "...", "highlights": "...", "style": "..." },
    "unknown_items": 2           // 未知项数量（生成约束参考）
  },

  // kind=story 时：
  "story": {
    /* StoryOutput，见 06 号文档 */
  },
  "locked_chapters": ["ch1","ch3"],   // 用户锁定的章节 ID（重生成时跳过）
  "share_summary": "string | null",     // 可选分享摘要（≤100 字）
  "generate_meta": { "model": "hunyuan-vision", "generated_at": "ISO8601", "degraded": false, "total_tokens": 0, "total_cost_estimate": 0 },

  "created_at": "ISO8601"
}
```

## 6. ai_jobs — 异步任务

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",
  "album_id": "<albums._id>",
  "type": "meta",                // meta(元数据处理) | vision(视觉理解) | story(故事生成) | regen_section(单段重生成) | render(长图资源)
  "status": "pending",           // pending | running | succeeded | failed | cancelled
  "stage": "exif",               // 当前阶段（进度展示）：exif | vision | cluster | factbase | chapter_N | summary
  "progress": 0.35,              // 0~1（按批次粒度更新）
  "batches": [                   // 分批状态持久化（断点续跑依据）
    { "batch_no": 1, "photo_ids": ["p001","p002"], "stage": "meta",
      "status": "succeeded", "attempts": 1, "updated_at": "ISO8601" }
  ],
  "failed_photo_ids": [],        // 处理失败的照片（生成前置校验依据）
  "payload": { "photo_ids": [...], "chapter_id": "...", "feedback": "..." },
  "result_ref": "<album_stories._id | null>",
  "error": "string | null",
  "retry_count": 0,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

## 7. share_links — 分享链接

```jsonc
{
  "_id": "<auto>",
  "_openid": "oXXXX",            // 创建者
  "album_id": "<albums._id>",
  "story_id": "<album_stories._id>",
  "token": "随机32位hex",         // 访问凭证
  "expire_at": "ISO8601 | null", // null=永久
  "revoked": false,
  "visit_count": 0,
  "created_at": "ISO8601"
}
```

## 8. geo_cache — 逆地址解析缓存

```jsonc
{
  "_id": "<lat,lng 保留4位小数拼接>",   // 如 "36.6789,101.7788"
  "result": { "city": "...", "district": "...", "poi": "..." },
  "cached_at": "ISO8601"
}
// 说明：按 4 位小数（约 11m 精度）聚合，控制逆解析调用量
```

## 9. 索引设计

| 集合 | 索引 | 用途 |
|------|------|------|
| albums | _openid + updated_at desc | 首页列表 |
| photos | album_id + sort_index | 相册照片流 |
| photos | album_id + upload_status | 上传状态汇总 |
| album_stories | album_id + kind + version desc | 取最新故事/事实库 |
| ai_jobs | album_id + type + status | 任务查询/轮询 |
| ai_jobs | status + updated_at（清理任务用） | 僵尸任务回收 |
| share_links | token（唯一） | 分享访问校验 |

## 10. 权限规则（CloudBase 安全规则）

| 集合 | 规则 |
|------|------|
| users / albums / photos / photo_groups / album_stories / ai_jobs / share_links | **仅创建者可读写**（`auth.openid == resource.openid`） |
| geo_cache | 所有用户可读，仅云函数可写（自定义规则） |
| shared-view 数据 | **不直接读库**，一律经云函数校验 token 后返回脱敏故事数据 |

> 关键原则：分享浏览不走数据库直读权限，防止越权；所有跨用户数据访问必须经云函数。

## 11. 数据保留与清理

- 原图按 users.retention_days 到期清理（每日定时触发器扫描），仅保留 thumb 与故事；
- soft-delete（deleted=true）记录由清理任务在 24h 内物理删除并同步删云存储文件；
- 账号注销：循环 H2 流程 + 删除 users 文档。
