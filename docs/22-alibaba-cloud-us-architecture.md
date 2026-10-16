# 22 · 阿里云美国区 iOS 后端架构决策

> 状态：已批准的方向；云资源尚未创建，区域与规格需在实施前完成实测和预算确认。
>
> 决策日期：2026-10-16
>
> 决策人：产品负责人确认“放弃腾讯云，海外版 iOS 使用阿里云美国服务器”。

## 1. 决策

Trailogue 的长期后端采用 **阿里云美国区 + 标准 TypeScript HTTPS API + 托管
PostgreSQL + 私有对象存储 + 独立异步 worker**。

不采用 Supabase 或 Firebase 作为生产核心，不再访问、导出或迁移腾讯 CloudBase 数据，
也不为微信 OPENID、云函数或 `wx.cloud.*` 保留兼容层。

推荐的生产目标组合：

| 能力 | 选择 | 边界 |
| --- | --- | --- |
| 公网入口 | ALB + HTTPS + 自有 API 域名 | 只暴露 443；健康检查和限流在入口与 API 双层执行 |
| 计算 | ECS 上的容器化 TypeScript API 与独立 worker | API 无状态；worker 不暴露公网端口 |
| 数据库 | ApsaraDB RDS for PostgreSQL | 仅 VPC 内访问；迁移由版本化 SQL 管理 |
| 文件 | OSS 私有 bucket | 照片与 PDF 不经过 API 中转；使用短期签名上传/下载 |
| 任务 | PostgreSQL 持久 `jobs` / `job_items` 队列 | MVP 不新增 Redis；领取、心跳、重试、幂等均落库 |
| 日志 | Simple Log Service（SLS） | 结构化日志、请求 ID、任务 ID；禁止记录 token 和正文隐私 |
| 密钥 | KMS / Secrets Manager + ECS RAM 角色 | Secret 不进入 Git、镜像、Expo 环境变量或启动参数 |
| 监控 | CloudMonitor + SLS 告警 | API 可用性、5xx、延迟、队列积压、worker 心跳、RDS/OSS 指标 |

阿里云官方当前列出美国弗吉尼亚 `us-east-1` 与硅谷 `us-west-1` 的 OSS、ALB、SLS、KMS
支持；RDS PostgreSQL 也在两个美国区提供计费与实例能力。区域创建后不可直接变更，因此不在
代码中硬编码某一区域：正式购买前用真实目标用户网络实测延迟，并确认所需规格在购买页有货。

参考：

- [Alibaba Cloud global locations](https://www.alibabacloud.com/en/global-locations)
- [OSS regions and endpoints](https://www.alibabacloud.com/help/en/oss/user-guide/regions-and-endpoints)
- [ALB supported regions and zones](https://www.alibabacloud.com/help/en/slb/application-load-balancer/supported-regions-and-zones)
- [SLS endpoints](https://www.alibabacloud.com/help/en/sls/developer-reference/service-entrance)
- [KMS supported regions](https://www.alibabacloud.com/help/en/kms/key-management-service/product-overview/supported-regions)
- [RDS for PostgreSQL instance creation](https://www.alibabacloud.com/help/en/rds/apsaradb-rds-for-postgresql/create-an-apsaradb-rds-for-postgresql-instance-1)

## 2. 为什么选择该组合

### 2.1 对候选方案的最终判断

| 方案 | 判断 | 原因 |
| --- | --- | --- |
| Supabase | 不选生产核心 | MVP 快，但与已确认的阿里云部署方向重复建设；Auth/Storage 仍形成第二云依赖 |
| Firebase | 不选 | Firestore 文档模型和 Google 平台绑定不符合当前关系模型与单云运维方向 |
| 单台 ECS 自建全部服务 | 不选 | 数据库、备份和对象存储故障责任过重，单机也不满足长期可恢复性 |
| ECS + RDS PostgreSQL + OSS | 选择 | 保留标准协议和迁出路径，同时把数据库与文件耐久性交给托管服务 |
| ACK/Kubernetes | 暂不选 | MVP 只有 API 与 worker 两个进程，集群编排会显著增加成本和运维面 |
| 全量 Function Compute | 暂不选 | AI、图像与 PDF 是长任务；常驻 worker 的资源和恢复行为更可预测 |

### 2.2 接受的代价

- 团队必须自行实现并维护 Apple token 验证、会话轮换、授权与账号删除。
- ECS 操作系统、容器运行时、部署流水线和 worker 的安全更新由团队负责。
- 美国区产品规格和价格可能与中国区不同，购买页与报价单是最终依据。
- 首个可用版本允许单 API 节点，但上线生产前必须完成备份恢复、故障告警和滚动回滚演练。

## 3. 区域与网络

正式资源必须全部放在同一美国 Region 的同一 VPC：

- `us-east-1`：候选默认，适合美国东部及欧洲为主的流量。
- `us-west-1`：当美国西部或亚太访问实测明显更优时选择。
- ECS、RDS、OSS、ALB、SLS 和 KMS 必须先逐项核验区域可购性，再锁定 Region。
- RDS 不开放公网地址；API/worker 通过 VPC 内网访问。
- OSS bucket 默认为 private；CORS 只允许正式 App 上传流程所需方法与头部。
- 安全组仅允许 ALB 到 API、API/worker 到 RDS/OSS/外部 provider 的必要流量。

最终 Region 的验收条件：从目标市场至少两个网络位置测量 API 与 OSS 的连接、首字节和上传
延迟；核对月度预算、数据驻留、备份区域和所有必需产品的库存。未完成这些验证前不购买长期
订阅实例。

## 4. 服务与仓库边界

实施时建议新增以下目录，不移动或重写旧小程序：

```text
Trailogue/
  apps/
    api/                 # Fastify TypeScript HTTPS API
    worker/              # AI、照片、Story、Book/PDF 异步任务
  packages/
    contracts/           # OpenAPI/Zod 派生的请求、响应和错误类型
    domain/              # User/Trip/Photo/Story/Book 规则
    config/              # 服务端配置 schema；不含配置值
  infra/
    terraform/           # VPC/ECS/RDS/OSS/ALB/SLS/KMS，后续阶段建立
    docker/              # 本地与 ECS 镜像定义
  db/
    migrations/          # 只前进的 PostgreSQL 迁移
    seeds/               # 仅开发/测试数据
  ios-app/               # 现有 Expo 客户端，继续保留
  miniprogram/           # 历史只读参考
  cloudfunctions/        # 历史只读参考
```

首个后端实现建议使用 Fastify + TypeScript + Zod/OpenAPI + PostgreSQL 驱动。ORM/查询构建器
需在第一个 schema POC 中以迁移可控、事务清晰和生成 SQL 可审计为准再确定，不在 ADR 中提前
锁定。iOS 只依赖 `packages/contracts` 的稳定输出，不直接依赖数据库类型或阿里云 SDK。

## 5. 身份与会话

认证主流程：

1. API 签发一次性 nonce/challenge。
2. iOS 使用 Sign in with Apple 获取 identity token 与 authorization code。
3. iOS 通过 TLS 将凭据提交到 `POST /v1/auth/apple/sessions`。
4. API 使用 Apple 公钥验证 ES256 签名，并校验 nonce、issuer、audience、expiry。
5. `user_identities(provider='apple', provider_subject)` 唯一映射到 Trailogue `users.id`。
6. API 签发短时 access token 与可轮换 refresh session；refresh token 只以哈希形式落库。
7. iOS 仅在 SecureStore 保存会话；退出、撤销、账号删除会使服务端 session 失效。

Apple 只在首次授权时可靠返回姓名，服务端必须把首次资料写入与身份建立放在同一事务中；不得
把 email 当作稳定主键。Apple 要求服务端验证 identity token 的签名、nonce、`iss`、`aud`
和 `exp`，实现时以 Apple 官方文档为验收依据：
[Verifying a user](https://developer.apple.com/documentation/signinwithapple/verifying-a-user)。

## 6. 核心数据模型

新库不包含 legacy ID 映射表，因为产品决定不迁移旧数据。

| 表 | 关键职责 |
| --- | --- |
| `users` | Trailogue UUID、状态、资料、隐私版本、删除时间 |
| `user_identities` | provider、provider subject、用户归属、首次/最近登录时间 |
| `sessions` | refresh token 哈希、设备摘要、过期/撤销时间、轮换链 |
| `trips` | 用户所有权、标题、日期、目的地、状态、封面、版本号 |
| `photos` | Trip 所属、OSS object key、hash、EXIF/GPS、排序、处理状态 |
| `stories` | Trip 的结构化内容版本、生成来源、编辑状态、模型审计元数据 |
| `books` | 固定 Story 版本、版式版本、状态、PDF object key、页数 |
| `jobs` | 类型、状态、幂等键、阶段、尝试次数、心跳、错误摘要 |
| `job_items` | 照片/章节级任务项和重试状态 |

所有业务表使用内部 UUID，不保存 OPENID。所有权检查和软删/硬删策略由 API + 数据库约束共同
执行；对象删除采用可重试 outbox/job，避免数据库事务和 OSS 操作产生半完成状态。

## 7. HTTPS API 首批边界

生产 API 统一使用 `/v1`、JSON、Bearer access token、稳定机器错误码、request ID 和幂等键：

- `POST /v1/auth/apple/challenge`
- `POST /v1/auth/apple/sessions`
- `POST /v1/auth/sessions/refresh`
- `DELETE /v1/auth/sessions/current`
- `GET /v1/me`、`DELETE /v1/me`
- `GET /v1/trips`、`POST /v1/trips`
- `GET/PATCH/DELETE /v1/trips/{tripId}`
- `POST /v1/trips/{tripId}/photos/upload-intents`
- `POST /v1/trips/{tripId}/photos`
- `GET /v1/trips/{tripId}/photos`
- `POST /v1/trips/{tripId}/organize`
- `GET /v1/jobs/{jobId}`
- `GET /v1/trips/{tripId}/story`

上传流程为 API 授权后签发短期 OSS 上传凭证；客户端上传完成后再提交对象 key、大小、MIME 和
校验和。服务端必须 HEAD/校验对象后才把 Photo 标记为可用，客户端永远不持有 OSS AccessKey。

## 8. 实施阶段与门槛

### Phase A：本地后端骨架

- 建立 `apps/api`、`apps/worker`、共享 contracts/domain 与本地 PostgreSQL。
- 确定 schema、迁移工具、OpenAPI、统一错误和鉴权接口。
- 用测试 Apple token verifier 完成单元测试，但不得声称真实 Apple 登录完成。

### Phase B：阿里云最小基础设施 POC

- 在候选美国区按量创建 VPC、ECS、RDS PostgreSQL、私有 OSS、SLS 和 KMS。
- 部署 API/worker，验证 VPC 内网、TLS、日志、secret 注入和最小权限 RAM 角色。
- 完成创建 Trip、签名上传一张照片、持久化、下载和彻底清理的闭环。
- POC 资源在验证后保留或释放需单独确认，避免无意持续计费。

### Phase C：认证与 iOS 主流程

- 接通真实 Apple 登录、refresh rotation、`/v1/me` 和账号删除。
- 将现有 iOS `AlbumDTO`/`/v1/albums` 临时契约迁到正式 Trip API。
- 打通旅行列表、新建、照片上传、编辑、AI 整理、查看和保存。

### Phase D：生产化

- ALB + 多可用区 API 节点、RDS 高可用/备份、OSS 生命周期与版本策略。
- SLS/CloudMonitor 告警、漏洞更新、回滚、恢复演练、成本预算和隐私/删除验收。
- 完成 EAS production build、TestFlight、App Store 隐私与账号删除检查。

地图、Book/PDF、分享、支付、订阅和推送继续排在主流程之后。

## 9. POC 通过标准

1. `us-east-1` / `us-west-1` 真实延迟、库存和月成本比较完成并锁定一个 Region。
2. API 只能经 HTTPS 访问，RDS 无公网暴露，服务通过 RAM 角色访问 OSS/KMS。
3. 真实 Apple token 的签名、nonce、issuer、audience、expiry 和重放测试通过。
4. 两个用户无法访问彼此的 Trip、Photo、Story、Job；越权测试通过。
5. 20 MB 照片可直传，错误 MIME、大小、校验和与越权 object key 会被拒绝。
6. worker 崩溃后任务可由心跳超时恢复，不会重复创建 Story/Book。
7. PostgreSQL 备份恢复与 OSS 对象清单恢复演练通过。
8. 日志中不存在 token、Apple identity token、完整 email、照片 URL 或正文隐私。

## 10. 撤销条件

只有出现以下情况才重新评估云平台，而不是因为实现暂时困难就引入第二套后端：

- 阿里云美国区无法提供所需产品、SLA、数据驻留或合规条件；
- 经 POC 证明目标用户网络质量不可接受；
- 真实流量成本长期显著高于替代方案，且迁移收益覆盖切换成本；
- 团队明确改变“阿里云美国区”这一产品约束。

即使触发撤销，标准 PostgreSQL、OSS 对象键、OpenAPI contracts 和 provider adapters 仍应保留，
以便迁移到另一家云而不重写 iOS Domain/UI。
