# 旅迹成书 — 上线前 BUG 排查与修复报告

> 日期：2026-08-29 ｜ 排查方式：页面层 / 服务层 / 云函数层三路并行代码审查 + 逐条人工交叉验证（已剔除子代理误报）

## 一、结论

**共确认 14 处真实问题，已全部修复并部署。** 小程序端 + 8 个云函数 TypeScript 编译零错误，8 个云函数已全部重新部署成功，超时配置完好（internal-generateStory=300s / export=60s / share=20s）。

此前控制台警告（App.onLaunch 107ms、WAServiceMainContext preload、基础库灰度提示等）经甄别均为开发者工具噪音，不影响线上。

## 二、已修复问题清单

### 安全类（越权 / 数据泄露，上线必修）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 1 | photo `reorderPhotos` | 完全没有鉴权，任何人可传他人照片 ID 改排序 | 分批查照片归属，非本人返回 40301 |
| 2 | photo `requestMetaProcess` | 未校验相册归属 | 补相册 `_openid` 校验 |
| 3 | story `getJobStatus` | 未校验任务归属，可窥探他人任务进度 | 补任务 `_openid` 校验 |
| 4 | export `createPdf` | `page_file_ids` 不校验归属 = 可借函数下载云存储任意文件 | 页图路径必须含 `/export/pdf-pages/{openid}/` |
| 5 | 前端 `album-export.ts` | 页图上传路径无 openid 隔离（注释写了"自动带前缀"但没做） | 路径加 openid 前缀，与 #4 配套 |
| 6 | internal-* 三函数 | 客户端可按函数名直调（云开发无天然拦截），伪造他人 job_id 即可读他人照片故事 | 入口处比对 `getWXContext().OPENID` 与 job/album 归属（函数间调用 openid 会透传，正常链路不受影响） |
| 7 | share `createShare` | 每次进分享页都铸造新永久 token，旧 token 永不清理 | 复用未撤销未过期的链接并刷新到最新故事版本 |

### 功能类（必现 Bug）

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 8 | photo-review 页 | WXML 绑定 `_formattedTime`/`_locationLabel` 但从未赋值 → 列表永远显示"未知时间/未知地点" | loadPhotos 预计算两个字段；缩略图回退链改 `_thumb_url \|\| _temp_url`（cloud:// 不能直接渲染） |
| 9 | story `generateStory` | 已有进行中任务时返回 40901 → 用户中途退出再进显示"任务启动失败"，无法恢复 | 幂等化：直接返回进行中任务的 job_id 恢复轮询；另加僵尸回收（15 分钟无心跳自动判失败允许重生成） |
| 10 | share `createShare` | `expire_days` 传非法值时 `new Date(NaN).toISOString()` 直接抛异常崩溃 | 合法性校验（-1 或 1~90，非法按永久） |
| 11 | privacy 页 | `dataset.days` 是字符串，`Number` 转换缺失 → 选中态高亮失效、云端存入字符串 | `Number()` 转换 + 白名单校验；auth 云函数同步校验 {-1, 1~3650} |
| 12 | photo `listPhotos` | 50 张照片 = 100 个 fileID，超 `getTempFileURL` 单次 50 上限必失败 | 按 50 条分批获取 |

### 健壮性类

| # | 位置 | 问题 | 修法 |
|---|------|------|------|
| 13 | utils/poll.ts | 单次网络抖动即判"轮询超时"；页面卸载后轮询继续、redirectTo 劫持当前页 | 容忍连续 3 次失败；返回带 `cancel()` 的句柄，story-generating `onUnload` 取消 + destroyed 守卫 |
| 14 | utils/request.ts | 云函数崩溃时 `res.result` 为空 → 抛 TypeError 而非友好错误 | envelope 判空 |

## 三、已知限制（不阻塞上线，建议后续迭代）

1. **单章重生成实为整本重写**：story-edit 页的"重新生成本章"触发的 `regen_section` 任务，internal-generateStory 未实现单章模式（mode 参数被忽略），实际会重新生成整本并保存新版本。功能可用、不崩溃，但粒度与 UI 承诺不符。
2. **internal-processVision 仍是未接入的占位**：EXIF 解析（internal-processMeta）已于 2026-08-29 完整实现并部署（exifr 解析拍摄时间/地点 + 腾讯位置服务逆地理 + 三级降级）；视觉理解由 internal-generateStory 内部兜底执行，不受影响。internal-processVision 为空壳 TODO，仅被 processMeta 以 .catch() 保护地衔接调用，属未来扩展点，不阻塞。
3. **删除相册不撤销分享**：album `deleteAlbum` 未联动 revoke share_links，已分享出去的旧故事版本在链接过期前仍可访问。
4. **commitUpload 信任客户端声明**：file_size / file_hash 由客户端上报，防滥用级别问题（个人版产品风险低）。

## 四、上线前剩余待办（人工操作）

- [ ] 模拟器全流程冒烟：上传 → 元数据确认（检查时间/地点正常显示）→ 生成故事 → 中途退出再进（应恢复进度而非报错）→ 导出 PDF/长图 → 分享/保存海报
- [ ] 小程序改名「旅迹成书」、更换头像（微信公众平台操作）
- [x] TENCENT_LBS_KEY 配置（已配置并验证，2026-08-29 傍晚）
- [x] 数据库索引与集合权限规则（2026-08-29 晚，经 manager-node + ModifySafeRule API 自动化完成：7 个二级索引 + share_links.token 唯一索引；7 个用户集合 PRIVATE、geo_cache ADMINWRITE，回读校验全部通过）
- [ ] 提审前隐私接口声明（`wx.chooseMedia` 等相册/摄像头权限用途说明）

## 五、上线前最小改造（2026-08-29 深夜，docs/13 落地）

范围：身份/users、相册关联、集中式 app_config、5~50 张、防滥用限流、生成幂等、9 个埋点事件、权限检查、getUpdateManager、运维手册、回归测试。商业化/支付/广告/完整 usage_ledger **不在本轮**。

| 项 | 状态 | 落地方式 |
|---|---|---|
| app_config 集中配置 | ✅ | 新集合 `app_config` + `global` 文档（internal-init 种子）；云函数 `common.ts loadAppConfig()` 60s 缓存 + 内置默认值 fail-open |
| 每日用量 daily_usage | ✅ | 新集合，`_id = openid_业务日`；云函数 `usage.ts` 读改写（照片 id 去重，失败批次重试不重复计数） |
| 五项限制 | ✅（默认休眠） | story.generate：`generationLimitEnabled` 为真时校验 5 次发起 / 2 本成功 / 100 张去重照片 / 并发 1 / 单相册重生成 2 次；读不到配置不阻塞 |
| 系统故障不计次 | ✅ | internal-generateStory 走 catch（基础设施异常）时 `attemptDelta: -1` 回滚，事件记 `system_fault: true` |
| 生成幂等 | ✅ 既有 | 进行中任务 resumed 复用 + 15 分钟僵尸回收（本轮未改） |
| 9 个核心事件 | ✅ | 新集合 `events`；auth(app_open/user_created)、album(album_create)、photo(upload_completed)、story(generation_started/album_saved)、internal-generateStory(generation_succeeded/failed)、share(album_shared)，全部 try/catch 吞错 |
| 成本数据 | ✅ | generate_meta：photo_count / vision_call_count / story_call_count / token_usage / retry_count / generation_duration_ms / **estimated_cost: null**（不再硬编码 0） |
| wx.getUpdateManager | ✅ | app.ts 静默更新 + applyUpdate（无强制更新） |
| 运维手册 | ✅ | docs/14-ops-manual.md（用量/事件/排障/限流开关/90 天清理/注销流程） |
| 部署 | ✅ | 7 云函数（含 internal-init）全部 `--r` 部署成功；小程序端编译零错误；internal-init 执行结果：新建 app_config/daily_usage/events 三集合 + configSeeded=true |

### 验收清单（人工回归）

- [ ] 开发者工具重新编译 → 启动小程序无报错；模拟更新（编译模式 → 下次编译模拟更新）应弹「新版本已经准备好」
- [ ] 上传 ≥5 张照片 → 相册列表数量正确；超过 50 张应被拒（上限由 app_config.maxPhotosPerAlbum 控制）
- [ ] 生成故事：连续双击「生成」只建 1 个任务（幂等）；中途退出再进应恢复进度
- [ ] 生成完成 → 分享页创建链接 → 编辑并保存故事
- [ ] 后台核对：events 出现 9 类文档（抽查无 OpenID/GPS/正文）；daily_usage 出现当日记录；album_stories.generate_meta 含新字段且 estimated_cost 为 null
- [ ] 导出长图/PDF、保存海报：点取消只弹「已取消保存」，正常保存成功
- [ ] 临时开 `generationLimitEnabled=true` 验证五项限制文案，验证完改回 false

### 回滚

- 限流：app_config/global 置 `generationLimitEnabled=false`，60s 内生效，无需部署
- 云函数：git 检出上一版 → `npx tsc -p cloudfunctions/<fn>/tsconfig.json` → CLI `--r` 重部署
- 前端：还原 app.ts 等改动 → `npx tsc -p tsconfig.json` 重编译
- 新增集合（app_config/daily_usage/events）留着无害，埋点失败已被吞错，最坏只是少数据
