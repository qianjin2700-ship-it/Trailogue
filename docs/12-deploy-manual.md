# 12. 部署与初始化手册（人工操作版）

> 适用环境：**微信云开发** `lvji-d6g41bt719c85fe54`（体验版，上海，2027-02-21 到期）
> AppID：`wxdb87c970af346122`
>
> 背景：微信云开发环境的云函数**必须用微信开发者工具上传**，不能用 `tcb` CLI 部署（CLI 的 COS/zip 两条路径均被微信环境后端拒绝：COS 报 `bash: mjs: command not found`，zip 报 1.5MB 限制）。本手册为最终可执行路径。

---

## 操作前置

- 已安装最新版 **微信开发者工具**（稳定版）。
- 本机已有 Node.js 24（编译云函数用，部署阶段不需要）。
- 11 个云函数均已编译出 `index.js` + `package.json`，且 `project.config.json` 已含：
  - `"appid": "wxdb87c970af346122"`
  - `"cloudfunctionRoot": "cloudfunctions/"`
  - `"miniprogramRoot": "miniprogram/"`

---

## 第一步：用微信开发者工具打开项目

1. 打开微信开发者工具 → 导入项目。
2. 项目目录：`c:\Users\qjz19\WorkBuddy\20260823204843\lvji-chengshu`
3. AppID 选「使用测试号」时**不要**——必须手动填 `wxdb87c970af346122`（工具会自动识别 project.config.json 里的 AppID）。
4. 登录账号需是该 AppID 的**管理员/开发者**。

---

## 第二步：部署 11 个云函数（每个右键一次）

在工具左侧**资源管理器**中，展开 `cloudfunctions/` 目录，会看到 11 个函数：

```
auth  album  photo  story  share  privacy
internal-init  internal-cleanup  internal-generateStory  internal-processMeta  internal-processVision
```

对**每一个**文件夹：
1. 右键该文件夹 → 选 **「上传并部署：云端安装依赖」**。
   - 这一步云端自动执行 `npm install`，本地**不需要** node_modules。
   - 不要选「上传并部署（不上传依赖）」。
2. 等待进度条完成。出现「上传成功」即可进行下一个。

> 小技巧：在 `cloudfunctions` 根目录上右键可**批量管理**；或用 `Ctrl` 多选后右键批量上传。

11 个函数全部上传完毕后，可在「云开发控制台 → 云函数」中看到全部列出。

---

## 第三步：调用 internal-init 创建 8 个数据库集合

1. 微信开发者工具顶部点 **「云开发」** 打开云开发控制台。
2. 确认左上角环境为 `lvji-d6g41bt719c85fe54`。
3. 进入 **「云函数」** → 找到 **`internal-init`** → 点「云端测试」→ 直接运行（无需参数）。
4. 返回结果应类似：

```json
{
  "code": 0,
  "data": {
    "created": ["users","albums","photos","photo_groups","album_stories","ai_jobs","share_links","geo_cache"],
    "existed": [],
    "failed": [],
    "total": 8
  }
}
```

该函数**幂等**，重复调用安全（已存在的集合会归入 `existed`）。

> 备选：也可以在「数据库」页手动点「+」逐个新建这 8 个集合，效果相同。

### 索引（数据库 → 对应集合 → 索引管理 → 新建索引）

| 集合 | 索引字段 | 排序 | 用途 |
|------|---------|------|------|
| albums | `_openid` + `updated_at` | updated_at 降序 | 首页列表 |
| photos | `album_id` + `sort_index` | 默认 | 相册照片流 |
| photos | `album_id` + `upload_status` | 默认 | 上传状态汇总 |
| album_stories | `album_id` + `kind` + `version` | version 降序 | 取最新故事/事实库 |
| ai_jobs | `album_id` + `type` + `status` | 默认 | 任务查询/轮询 |
| ai_jobs | `status` + `updated_at` | 默认 | 僵尸任务回收 |
| share_links | `token` | 唯一索引 | 分享访问校验 |

### 权限规则（数据库 → 对应集合 → 权限设置）

| 集合 | 规则 |
|------|------|
| users / albums / photos / photo_groups / album_stories / ai_jobs / share_links | **仅创建者可读写**（`auth.openid == resource.openid`） |
| geo_cache | 所有用户可读，仅云函数可写 |

> 分享浏览不直接读库：所有跨用户访问必须经云函数校验 token 后返回脱敏数据。

---

## 第四步：配置云函数环境变量

进入 **云开发控制台 → 云函数 → 对应函数 → 配置**，填入环境变量（见 `docs/11-env-vars.md` 完整清单）。要点：

- 密钥只放云函数环境变量，**代码零密钥**。
- 混元视觉模型 `Provider` 通过环境变量配置，便于替换。

---

## 第五步：修改小程序信息（微信公众平台）

1. 登录 https://mp.weixin.qq.com → 小程序 → 该 AppID 对应的小程序。
2. **设置 → 基本信息**：
   - 名称改为「旅迹成书」（若占用则需走改名申请）
   - 头像上传「旅迹成书」LOGO
   - 简介、服务类目按 PRD 更新
3. **开发 → 开发管理**：确认 AppID 与小工具一致。

---

## 部署后验证

- 云开发控制台 → 云函数 → 逐个「云端测试」传入最小 `{action: "login"}` 等，确认返回正常。
- 小程序预览 → 走一遍「上传照片 → 生成故事」主流程。
- 关注 `internal-*` 四个内部函数是否被业务函数正确触发（幂等/分批）。

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 上传后云端报 `Cannot find module 'wx-server-sdk'` | 说明选了「不上传依赖」；改用「上传并部署：云端安装依赖」重传 |
| 工具提示「代码包过大」 | 确认本地无 node_modules 残留；依赖一律云端安装 |
| 函数名冲突（残留旧函数） | 云开发控制台删除同名旧函数后重传 |
| 体验版环境过期（2027-02-21） | 到期前转正式版或续期 |
