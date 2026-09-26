# 19 · 云环境迁移：lvji → yaomiao

> 背景：lvji-d6g41bt719c85fe54（个人版付费）到期，迁移到 yaomiao-d3g3u7ckz71fffd26。
> 两个环境均在腾讯云账号 **100052125926** 下，无跨账号障碍。
> 决策：**数据不迁移**（均为测试数据），目标是功能在新环境跑通。
> 执行日期：2026-09-22

---

## 执行状态总览（2026-09-22 16:10）

| # | 步骤 | 状态 | 谁做 |
|---|---|---|---|
| 1 | 前端 `app.ts` 环境 ID 改为 yaomiao | ✅ 已完成（含编译产物） | 自动 |
| 2 | 12 个云函数部署到 yaomiao | ✅ 全部成功 | 自动 |
| 3 | 前端上传为开发版本 **v1.0.3** | ✅ 已上传（159.5 KB） | 自动 |
| 4 | 调用 `internal-init` 创建 11 个集合 | ⏳ **待做** | 控制台 30 秒 |
| 5 | 配置 3 个函数的环境变量 | ⏳ **待做（关键）** | 控制台 |
| 6 | 配置 4 个函数的超时 | ⏳ **待做（关键）** | 控制台 |
| 7 | 重建 7 个索引 + 权限规则 | ⏳ 待做 | 控制台 |
| 8 | 提交审核 → 通过后发布 | ⏳ 待做 | 后台 |

部署日志在 `.workbuddy/tmp/deploy-yaomiao/*.log`（UTF-16LE，用 `iconv -f UTF-16LE -t UTF-8` 读）。

---

## ⚠️ 一条时间红线（与旧环境有关）

官方规则：套餐到期 → 停服隔离期 **15 个自然日** → 期满未续费则环境销毁、数据清除且不可恢复。
隔离期内**控制台无法访问**，所以旧环境的**环境变量值必须在到期前抄出来**——那是唯一拿不回来的东西（密钥丢了要重新申请）。

即使决定不迁移数据，**旧环境的云函数配置页也值得现在打开看一眼**（下面第 5 步要用到）。

---

## 已完成部分（记录，无需重做）

### 1. 前端环境 ID

`miniprogram/app.ts`：

```ts
cloudEnv: 'yaomiao-d3g3u7ckz71fffd26',   // 原 lvji-d6g41bt719c85fe54
```

`cloudbaserc.json` 原本已是 yaomiao。`README.md` 已同步。

### 2. 云函数部署

```
album  auth  export  internal-cleanup  internal-generateStory  internal-init
internal-processMeta  internal-processVision  photo  privacy  share  story
```

使用微信开发者工具 CLI：

```powershell
$cli = "C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
& $cli cloud functions deploy --e yaomiao-d3g3u7ckz71fffd26 --n <函数名> `
     --project <项目路径> --r
```

**踩到的坑（重要）**：

| 坑 | 现象 | 解法 |
|---|---|---|
| PowerShell 脚本文件里的中文路径乱码 | `无法将“C:\Program Files (x86)\Tencent\寰?淇?web...cli.bat”项识别为 cmdlet` | **不要把含中文路径的命令写进 .ps1 脚本文件**（PS 5.1 按 ANSI 读文件）。改为**内联执行**，中文正常 |
| 新建函数处于 Creating 状态 | `FailedOperation.UpdateFunctionCode: 当前函数处于Creating状态，无法进行此操作` | 该函数**等 60 秒后重新部署一次**即可（本次 `export` 命中） |
| CLI 输出被吞 | 命令返回空 | 必须 `*> log` 落盘，日志文件是 **UTF-16LE**，用 `iconv -f UTF-16LE -t UTF-8` 读 |
| 沙箱拦截 | `PROGRAM BLOCKED BY SECURITY POLICY`（wsl.exe / reg.exe） | 需 `dangerouslyDisableSandbox`；仍失败就手动部署 |

> `--r`（云端安装依赖）**必带**，否则云端无 `node_modules` → `Cannot find module 'wx-server-sdk'`。

### 3. 前端上传

版本 **1.0.3**，包含：云环境切换 + 分享修复 + sitemap 收录修复 + 失败提示显示真实原因。

---

## ⏳ 剩余操作（控制台，约 20 分钟）

### 4. 初始化数据库（30 秒）

云开发控制台 → 云函数 → `internal-init` →「云端测试」→ 调用一次。

幂等，会创建 **11 个集合**并种子 `app_config/global`：

```
users  albums  photos  photo_groups  album_stories  ai_jobs
share_links  geo_cache  app_config  daily_usage  events
```

返回 `code: 0` 且 `created` 有 11 项即成功（已存在会归入 `existed`）。

### 5. 配置环境变量（最关键，缺了 AI 生成和分享码会失败）

控制台 → 云函数 → 对应函数 → 函数配置 → 环境变量。

| 函数 | 变量 | 说明 |
|---|---|---|
| `internal-generateStory` | `TOKENHUB_API_KEY`、**`MODEL_NAME`=`hy-vision-2.0-instruct`**、**`MODEL_ENDPOINT`=`https://tokenhub.tencentmaas.com`** | **缺 KEY → 生成故事直接失败** |
| `share` | `WX_APP_ID`、`WX_APP_SECRET` | 缺 → 小程序码海报生成失败 |
| `internal-processMeta` | `TENCENT_LBS_KEY` | 缺不影响，走三级降级（地点名会缺失） |

> 值从**旧环境控制台**抄（旧环境今天到期，进隔离期就看不到了）。
> 脚本 `.workbuddy/tmp/fn-env/set-fn-env.js` 里的 `MODEL_NAME=hunyuan-vision` 是**旧值，不要照抄**。
> 本机已备好新环境脚本 `scripts/migrate/set-fn-env-yaomiao.js`（密钥从本机环境变量传入，需腾讯云 SecretId/Key）。

### 6. 配置超时（关键，默认 3s 会让 AI 生成超时）

云函数的 `config.json` 里写 timeout **无效**，必须在控制台「函数配置 → 超时时间」改：

| 函数 | 超时 |
|---|---|
| `internal-generateStory` | **300s** |
| `internal-processMeta` | **300s** |
| `export` | 60s |
| `share` | 20s |

> ⚠️ **如果套餐限制超时上限（免费版常见 3~5s 硬限制），AI 生成必然超时**——
> 这种情况下 yaomiao 跑不了本产品，只能给 yaomiao 续个人版套餐（¥19.9/月）或另建付费环境。
> **这是本次迁移唯一的硬风险，配置超时时留意控制台是否允许改到 300s。**

### 7. 索引与权限

**索引**（控制台 → 数据库 → 集合 → 索引管理）：

| 集合 | 索引字段 | 排序 |
|---|---|---|
| albums | `_openid` + `updated_at` | updated_at 降序 |
| photos | `album_id` + `sort_index` | 默认 |
| photos | `album_id` + `upload_status` | 默认 |
| album_stories | `album_id` + `kind` + `version` | version 降序 |
| ai_jobs | `album_id` + `type` + `status` | 默认 |
| ai_jobs | `status` + `updated_at` | 默认 |
| share_links | `token` | **唯一索引** |

**权限**（控制台 → 数据库 → 集合 → 权限设置）：

| 集合 | 规则 |
|---|---|
| users / albums / photos / photo_groups / album_stories / ai_jobs / share_links | 仅创建者可读写 |
| geo_cache | 所有用户可读，仅云函数可写 |
| app_config / daily_usage / events | 仅管理端可读写（只由云函数访问） |

> 权限配错会导致：配太松→越权；配太紧→游客打不开分享页。
> 分享浏览不直接读库，全部经云函数校验 token 后返回脱敏数据。

### 8. 提交审核

mp 后台 → 管理 → 版本管理 → 开发版本 v1.0.3 → 提交审核 → **通过后手动点「发布」**。

更新说明：

```
1. 切换云开发环境，提升服务稳定性
2. 支持转发给朋友和分享到朋友圈
3. 修复页面被微信搜索收录的配置
4. 优化操作失败提示，显示具体原因
```

---

## 验证清单（发布后逐项确认）

- [ ] 小程序能打开、能登录（验证新环境连通）
- [ ] 新建相册 → 上传照片（验证云存储 + `photo` 函数）
- [ ] **生成故事端到端跑通一次**（同时验证 TOKENHUB_API_KEY + 300s 超时 + 模型端点）
- [ ] 分享链接能生成、游客能打开（验证 `share` 的 AppSecret + `share_links` 权限）
- [ ] 导出 PDF / 长图（验证 `export` 60s 超时）
- [ ] EXIF 解析出地点（验证 `internal-processMeta` LBS 配置）

> 数据不迁移 = 旧相册、照片、故事全部为空，属预期。用新相册重新走一遍完整流程即可。

---

## 回滚预案

旧环境进入隔离期后 15 天内仍可**续费恢复**，数据完好。
新环境未验证通过之前，别急着放弃旧环境——那 19.9 元就是保险。

若新环境因套餐限制跑不通（如超时上限 3s），最快解法是**给 yaomiao 续个人版套餐**，
代码一行都不用再改（环境 ID 已经指向它了）。
