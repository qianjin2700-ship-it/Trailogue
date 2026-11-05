# TRAILOGUE V2 — 1.0 兼容性检查清单

> 用途：**任何 2.0 改动在合并或发版前，逐条过一遍这张表。**
> 判定标准不是「看起来没问题」，而是每一条都能用命令或现象验证。

---

## 0. 当前状态（Phase A 结束时）

| 项 | 状态 |
|---|---|
| 1.0 分支 | `feature/ios-app` @ `b469523`（未改动，与远端一致） |
| 2.0 分支 | `feature/v2` @ 基于 `b469523` |
| 1.0 运行时代码改动 | **0 行**（见 §2 验证） |
| 生产 DB 迁移 | 无 |
| Railway 部署 | 未触发 |
| EAS Build | 未触发 |
| TestFlight 上的版本 | build 2（1.0.0 / 2），未受影响 |

---

## 1. 红线（不可越界）

| # | 红线 | 为什么 |
|---|---|---|
| R1 | Bundle ID 保持 `com.qianjin2700.trailogue` | 换 ID = 新 App，已购用户丢失 |
| R2 | 版本号 1.0.0 不变 | 2.0 才升 2.0.0 |
| R3 | 不删除 / 不改名 / 不改语义任何 `/v1` 端点 | 旧客户端仍在线上跑 |
| R4 | 分享 URL 仍是 `/share/{token}`，`view` 只能是**可选** query | 已发出的链接必须永久可用 |
| R5 | 不修改 `packages/contracts` 的必填字段与 zod 校验严格度 | 1.0 二进制依赖其行为 |
| R6 | 不改 `user_identities` / `sessions` / Apple 登录流程 | 改了会让所有现存会话失效 |
| R7 | 不改 R2 key 布局（`storage_key` / `thumbnail_key`） | 改了旧照片全部 404 |
| R8 | 不改 Letter PDF 页面尺寸 | 已导出 PDF 与新导出不一致 |
| R9 | 不动账户删除逻辑 | 涉及数据合规，单独评审 |
| R10 | 不在 1.0 审核未结前重新触发 production build | 会覆盖待审 build |

---

## 2. Phase A 的「零侵入」验证（可复现）

### 2.1 只新增、未修改

```bash
cd Trailogue
git diff --stat feature/ios-app..feature/v2
```

期望：**所有条目都是 `A`（新增）**，没有 `M`（修改）或 `D`（删除）指向 1.0 已有文件。
本次实际结果：

```
A  docs/v2/*.md                  （7 份文档 + 2 份预览）
A  ios-app/src/features/v2/*.ts  （11 个纯函数模块）
A  ios-app/__tests__/v2-*.ts     （3 个测试套件）
A  scripts/render-v2-previews.mjs
```

### 2.2 新模块没有被 1.0 页面引用

```bash
grep -rn "features/v2" ios-app/src/app || echo "无引用 ✓"
grep -rn "features/v2" ios-app/src/features/books || echo "无引用 ✓"
```

期望：两条都输出「无引用」。只要没有 import，Metro 不会把它打进 bundle，1.0 行为零变化。

### 2.3 1.0 关键文件未被触碰

```bash
git diff --name-only feature/ios-app..feature/v2 -- \
  ios-app/src/app \
  ios-app/src/features/books \
  ios-app/src/api \
  apps/api \
  packages
```

期望：**无输出**。

---

## 3. 线上冒烟（任何 2.0 后端改动后必跑）

```bash
BASE=https://trailogue-staging.up.railway.app

curl -s -o /dev/null -w "health  %{http_code}\n"  $BASE/health      # 期望 200
curl -s -o /dev/null -w "ready   %{http_code}\n"  $BASE/ready       # 期望 200
curl -s -o /dev/null -w "privacy %{http_code}\n"  $BASE/privacy     # 期望 200
```

分享页（用一条真实链接）：

```bash
TOKEN=<真实 token>
curl -s "$BASE/share/$TOKEN"                | head -c 300   # 期望含 <h1> / <section>
curl -s "$BASE/share/$TOKEN?view=magazine"  | head -c 300   # 期望含封面或画册结构
curl -s -o /dev/null -w "%{http_code}\n"    "$BASE/share/invalid-token"  # 期望 404
```

判定：**story 与 magazine 两种 view 都必须 200，且内容明显不同**。

---

## 4. 客户端回归（每次改到渲染层时）

| 检查 | 方法 | 期望 |
|---|---|---|
| Story 视图 | Book Preview → Story | 文字完整、照片顺序与章节一致 |
| Magazine 视图 | Book Preview → Magazine | 无空白页、无灰块、无文字溢出 |
| 分享（Story） | Story tab 点 Share | 打开是图文网页，排版与 App 内接近 |
| 分享（Magazine） | Magazine tab 点 Share | 打开是画册网页，非图文版 |
| PDF | Export PDF | 生成成功，系统分享面板可弹出 |
| 照片缺失 | 删一张已入册照片后重进 | 页面不崩，照片位置显示占位 |
| 弱网 | 飞行模式打开已生成的分享链接 | 链接由服务端渲染，应仍可打开 |

---

## 5. 数据兼容

| 项 | 规则 |
|---|---|
| `stories.content`（jsonb） | **只允许新增可选字段**；读取端必须容忍缺字段 |
| `books.layout`（jsonb） | 2.0 文档模型不要直接覆盖旧 `layout`，存到新 key 或新表 |
| `photos.width/height` | 可能为 null（历史数据），渲染器必须有 3:2 兜底 |
| `trips.status` | 不要新增状态值；`draft/ready` 语义不变 |
| 迁移 | Phase A 零迁移；后续迁移必须**向前兼容**（旧代码能读新库） |

---

## 6. 打包与发布

| 事项 | 规则 |
|---|---|
| OTA | **本项目没有 EAS Update / `expo-updates`**，所有 JS 改动都必须重新构建 |
| 何时构建 | 只在 1.0 审核有结论后；且一次构建包含全部 2.0 改动（不做中间包） |
| buildNumber | 由 EAS 远端自增，不要手改 |
| submit | `eas.json` 的 `submit.production.ios.ascAppId` 必须是 `6829234000` |
| 网络 | Windows 上做 Apple 相关操作前先关本机代理（`idmsa.apple.com` 会被拦） |

---

## 7. 合并前的自检（复制粘贴用）

```
[ ] git diff --stat feature/ios-app..feature/v2 只有新增文件
[ ] grep -rn "features/v2" ios-app/src/app 为空
[ ] npm run typecheck   （ios-app）通过
[ ] npm run lint        （ios-app）0 error
[ ] npm test            （ios-app）全绿
[ ] npm run typecheck && npm test （apps/api）通过
[ ] /health /ready /privacy 均 200
[ ] Story 分享链接 200 且为图文版
[ ] Magazine 分享链接（?view=magazine）200 且为画册版
[ ] 无新增 DB 迁移（或迁移已确认向前兼容）
[ ] 未触发 EAS build / Railway 部署（除非本次明确要发版）
```

---

## 8. 回滚方案

| 场景 | 回滚动作 |
|---|---|
| 2.0 分支把 1.0 弄坏了（本地） | `git checkout feature/ios-app`（2.0 改动全在 `feature/v2`，不影响） |
| 已误合到 1.0 分支但未推送 | `git reset --hard b469523` |
| 已推送但未构建 | `git revert <merge commit>`，重新推送 |
| 已构建并上传 TestFlight | 用上一个 build（build 2）继续审核，新 build 不提交审核即可 |
| 后端部署出问题 | Railway 回滚到上一个 deployment（`/v1` 契约未变，通常无需回滚 DB） |

**关键前提**：Phase A 全程没有产生任何需要回滚的线上状态，所以上表只是为后续阶段准备的。

---

## 9. 已知遗留（本轮不修，但要知道）

| # | 事项 | 状态 |
|---|---|---|
| 1 | Apple token revoke 缺失（5.1.1(v)） | 用户已确认暂缓 |
| 2 | 删号 R2/DB 非事务 | 同上 |
| 3 | 分享网页域名暴露 `up.railway.app` | 留到 1.1 |
| 4 | 1.0 `bookLayout.ts` 中两套不可达模板（约 300 行死代码） | 1.0 过审后清理 |
| 5 | 客户端采集的 Apple email 未被服务端使用（只存 JWT 里的） | 记录在案 |

> 这张表的意义：**避免下一轮把已知问题当新发现重复上报**。
