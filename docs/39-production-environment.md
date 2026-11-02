# Trailogue 1.0 最小生产环境搭建手册

> 适用范围：只建立 Trailogue 1.0 上架所需的最小 production 环境，不动产品功能、不动画册、不动 staging。
> 冻结线：`c5db382`（1.0 功能冻结）。本手册中的部署提交应在 `c5db382` 或其后的必要修复提交上。

## 0. 现状与前置条件

| 项 | 现状 | 说明 |
|---|---|---|
| Git | `feature/ios-app` → `origin/feature/ios-app` | production 直接构建此分支的 SHA |
| Railway | 只有 staging 服务（`trailogue-staging.up.railway.app`） | 需要新建独立 service |
| Neon | 只有 staging 项目/分支 | 需要新建 production 分支 |
| R2 | 单一私有 bucket + 预签名 URL | 复用 bucket，用 `production/` 前缀隔离（已支持） |
| EAS | production profile 无 `EXPO_PUBLIC_API_BASE_URL` | 构建前必须补齐，否则 App 一启动就 `CONFIGURATION_ERROR` |

必须由账号所有者授权或提供的信息（本机无任何凭据）：

1. Railway 访问权限（`railway login` 浏览器授权，或 project token）；
2. Neon production 分支的 `DATABASE_URL`（推荐 `sslmode=verify-full`）；
3. 若要从 staging 复制变量，需要 Railway 读取 staging 变量的权限（DeepSeek key、R2 key 都只存在平台侧）。

## 1. Neon：独立 production 数据库

```bash
# 在 Neon 控制台：Project → Branches → New branch，名称 production，
# 从当前主分支创建（创建的是 schema 结构，不含 staging 的旅行数据）。
# 然后把连接串写进环境变量（不要提交进 Git）：

export PROD_DATABASE_URL='postgresql://...@...neon.tech/trailogue?sslmode=verify-full'

# 执行现有 5 个 migration（0000~0004），只建 schema，不插业务数据
DATABASE_URL="$PROD_DATABASE_URL" npm --prefix packages/database run db:migrate
```

- `db:seed` 在 `NODE_ENV=production` 下会主动抛错，**不会**写入演示数据，符合"不复制 staging 测试数据"。
- 验证：连上库执行 `select count(*) from users;` 应为 0；`select * from drizzle.__drizzle_migrations;` 应有 5 条记录。

## 2. Railway：独立 production service

在 Railway 项目内新增 Service（同一个 GitHub 仓库，根目录 `Dockerfile`，构建上下文为仓库根）：

| 配置 | 值 |
|---|---|
| Branch | `feature/ios-app` |
| Root Directory | `/`（使用根 `Dockerfile`） |
| Healthcheck Path | `/ready` |
| Restart Policy | ON_FAILURE |

环境变量（**不要**写进 Git、不要写进客户端）：

| 变量 | production 值 | 来源 |
|---|---|---|
| `NODE_ENV` | `production` | 固定 |
| `PORT` | `3000` | 固定（Railway 会注入 `PORT`，二者一致） |
| `DATABASE_URL` | Neon production 分支连接串 | 第 1 步生成 |
| `APP_BASE_URL` | `https://<production 域名>` | 第 3 步生成后回填（决定分享链接域名） |
| `APPLE_BUNDLE_ID` | `com.qianjin2700.trailogue` | 不变 |
| `SESSION_SECRET` | 新生成 48 字符随机串 | `openssl rand -base64 48`（不要复用 staging） |
| `SESSION_TTL_SECONDS` | `2592000` | 与 staging 一致 |
| `R2_ENDPOINT` | 同 staging | 复制 |
| `R2_BUCKET` | 同 staging | 复制 |
| `R2_KEY_PREFIX` | `production` | **必须**，保证与 staging 文件不混用 |
| `R2_ACCESS_KEY_ID` | 同 staging | 复制 |
| `R2_SECRET_ACCESS_KEY` | 同 staging | 复制 |
| `R2_UPLOAD_URL_TTL_SECONDS` | `300` | 默认 |
| `R2_READ_URL_TTL_SECONDS` | `600` | 默认 |
| `PHOTO_MAX_BYTES` | `15728640` | 默认 15MiB |
| `DEEPSEEK_API_KEY` | 沿用现有合法 key | 服务器侧环境变量 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | 固定 |
| `DEEPSEEK_MODEL` | `deepseek-flash` | 固定（支持图片输入） |

### R2 隔离方式说明

- 对象键在存储层统一加前缀：`production/users/<userId>/trips/<tripId>/photos/<photoId>/original.jpg`。
- 数据库里保存的仍是**不带前缀**的键，读取时自动补前缀；staging 的 `R2_KEY_PREFIX` 留空，行为完全不变。
- bucket 仍是 private，读取一律走预签名 URL（`X-Amz-Signature`），没有公开对象。
- 若后续新建独立 bucket，只需把 `R2_BUCKET` 换成新桶、`R2_KEY_PREFIX` 留空，代码无需再改。

## 3. 域名

Railway → Service → Settings → Networking → Generate Domain（例如 `trailogue-production.up.railway.app`）。
拿到后回填 `APP_BASE_URL`，重启服务；否则 Private Share 生成的链接会指向错误域名。

## 4. Smoke test（部署后立即执行）

```bash
node scripts/smoke-production.mjs https://<production 域名>
```

必须 5/5 通过，逐项含义：

| 检查 | 期望 | 含义 |
|---|---|---|
| liveness | 200 + `"ok"` | 进程已启动 |
| readiness | 200 + `"ready"` | Neon 连接可用 |
| auth guard | 401 | 未登录无法读取用户数据 |
| share route | 404 | 分享路由可用且不泄露 |
| apple sign-in guard | 400 | Apple 校验链路正常，非 5xx |

真机全链路（上传照片 → 生成故事 → Story → Magazine → 编辑 → 导出 PDF → Private Share）在 EAS production 包上验收。

## 5. EAS production 构建

```bash
cd ios-app
# 写入 production 环境变量（只此一次，之后随构建复用）
npx eas-cli env:create --environment production \
  --name EXPO_PUBLIC_API_BASE_URL --value "https://<production 域名>" \
  --visibility plaintext --non-interactive

npx eas-cli build --platform ios --profile production --non-interactive
```

- `production` profile 已配置 `autoIncrement: true`，buildNumber 自动 +1。
- `EXPO_PUBLIC_EXPOSE_BACKEND_ERRORS=false`：正式包不向用户暴露后端错误原文。
- 构建产物为 App Store 包（distribution 默认 store），可直接 `eas submit` 上传 TestFlight。

## 6. 回滚与隔离

- production 与 staging 共享代码、共享 R2 bucket（不同前缀），**不共享**数据库与 `SESSION_SECRET`。
- 回滚：Railway 选择上一个成功 Deployment 重新部署；数据库迁移只前进，不回滚（0000~0004 均为新增对象，无破坏性变更）。
- 如果 production 出问题，staging 与线上旧版本 App 不受影响（两者域名、密钥、数据库均独立）。

## 7. 验收清单

- [ ] Neon production 分支存在，5 条 migration 已应用，用户表为空
- [ ] Railway production service 状态 Online，`/health` `/ready` 均 200
- [ ] `APP_BASE_URL` 已回填为 production 域名
- [ ] `R2_KEY_PREFIX=production`，新上传对象落在 `production/` 下
- [ ] smoke test 5/5 通过
- [ ] EAS production 包构建成功，`EXPO_PUBLIC_API_BASE_URL` 指向 production
- [ ] 真机 8 步全链路通过
- [ ] TestFlight 上传成功
