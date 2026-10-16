# 21 · iOS 长期后端技术选型

> 状态：推荐方案，等待最小 POC 与用户确认后转为正式 ADR。
>
> 依据：`20-legacy-cloudbase-audit.md` 的实际业务负载，而不是通用 BaaS 对比。

## 1. 项目约束

- 唯一主客户端是 Expo / React Native iOS App。
- MVP 要快速打通 Apple 登录、旅行、照片、AI 整理和持久化。
- 数据天然包含 User → Trip → Photo / Story(version) / Book(version) 的关系和所有权约束。
- 原图与生成文件体积远大于数据库；必须直传对象存储并使用短期签名 URL。
- AI、EXIF、缩略图和 PDF 是可重试的异步任务，不能依赖请求进程一直存活。
- 客户端需要稳定的版本化 HTTPS API，不能再次绑定某个云数据库的私有调用协议。
- 当前没有证据表明团队希望长期承担数据库、鉴权、对象存储和备份的全套运维。

## 2. 方案对比

| 维度 | Supabase | Firebase | 独立 Node.js + PostgreSQL |
| --- | --- | --- | --- |
| 数据模型 | 原生 PostgreSQL，适合关系、约束和版本 | Firestore 文档模型，需要反规范化 | 最灵活，关系模型完整 |
| Apple 登录 | 支持原生 ID token 登录 | 官方支持 Apple Auth | 需自行验证、轮换、撤销和账号链接 |
| Expo 复用 | 官方 Expo/RN 指南，JS SDK 可用 | Expo 支持 JS SDK；原生 Firebase 需 Development Build | 普通 HTTPS client，无 SDK 锁定 |
| 对象存储 | Storage + RLS/签名访问 | Cloud Storage + Security Rules | 需选择 S3 兼容服务并实现签名 |
| 标准 API | 可用 Edge Functions/独立 API 包装 | Functions/Cloud Run 包装 | 完全自定义 |
| 异步任务 | Postgres Queue 可持久化；消费者需设计 | Functions + Cloud Tasks/Cloud Run 生态成熟 | 需自建队列、worker 和恢复机制 |
| AI/PDF 重任务 | Edge Function CPU 不适合 PDF，需独立 worker | Cloud Run 更适合重任务，但组件更多 | 自由度最高，运维最多 |
| 备份/退出 | `pg_dump` 可导出；对象需单独备份 | Firestore 可导出，但格式和数据模型更绑定 GCP | 最可控，责任也全部自负 |
| MVP 速度 | 高 | 高 | 中低 |
| 长期可维护性 | 高，且保留迁出到标准 Postgres 的路径 | 中高，但数据模型和规则更平台化 | 取决于持续运维投入 |

官方资料确认：Supabase 提供 Expo React Native 快速集成、JWT/RLS、原生 Apple ID token
登录和 Postgres 备份/导出；Firebase 提供 Apple 登录、Firestore、Storage 和 Functions，Expo
同时支持 Firebase JS SDK 与需要 Development Build 的 React Native Firebase。Supabase Edge
Functions 当前有 2 秒主动 CPU 限制，因此不能把 PDF 渲染或重图像处理塞进 Edge 请求。

参考：

- [Supabase Expo React Native](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase native Apple ID token](https://supabase.com/docs/reference/swift/auth-signinwithidtoken)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [Expo Firebase guide](https://docs.expo.dev/guides/using-firebase/)
- [Firebase Apple authentication](https://firebase.google.com/docs/auth/ios/apple)
- [Cloud Firestore data model](https://firebase.google.com/docs/firestore/data-model)
- [Cloud Functions for Firebase](https://firebase.google.com/docs/functions)

## 3. 推荐方案

推荐以 **Supabase 托管核心 + 标准 TypeScript HTTPS API + 持久任务队列 + 独立 Node
worker** 作为 iOS MVP 和长期演进基线。

职责分配：

- Supabase Auth：验证 Apple identity token，签发会话；业务表只引用内部 UUID user ID。
- Supabase PostgreSQL：User / Identity / Trip / Photo / Story / Book / Job 和迁移映射。
- Supabase Storage：原图、缩略图、故事资源和 Book/PDF；客户端只拿签名上传/下载凭证。
- `/v1` TypeScript API：唯一业务入口，验证 Supabase JWT，执行授权、校验、事务和幂等。
- Postgres Queue：持久化 EXIF、缩略图、视觉分析、故事、Book/PDF 任务。
- Node worker：消费队列、调用可替换 AI/地图 provider、执行 CPU/内存较重的 PDF 生成。

客户端不直接读写业务表。这样既保留标准 HTTPS API，也避免把 RLS 变成唯一业务规则层；RLS
作为第二道防线。Auth 和对象上传可使用 Supabase 官方协议，但领域操作全部经 `/v1`。

### 为什么不首选 Firebase

Firebase 能最快提供移动端能力和成熟的 Google Cloud 任务生态，但本项目的故事版本、Book
版本、照片排序、所有权、级联删除、幂等任务和迁移对账更适合关系模型。选择 Firestore 会让
团队长期维护反规范化副本、复合索引和跨文档一致性规则，同时降低未来迁出便利性。只有当
“离线优先实时同步”成为核心需求，或团队已有强 Firebase/GCP 运维经验时才应反选 Firebase。

### 为什么不立即自建 Node.js + PostgreSQL

独立方案控制力最高，也最容易运行 PDF/AI worker，但 MVP 阶段必须同时建设 Apple token
验证、会话轮换、数据库高可用、对象存储、签名上传、备份恢复、密钥轮换、监控和安全更新。
这与“快速上线、降低维护成本”冲突。若 Supabase 的区域、合规、配额、成本或平台限制在 POC
中不满足要求，再将同一 PostgreSQL schema 和 API 服务迁到独立托管环境。

### 接受的代价

- Supabase Auth/Storage 仍有平台依赖，需通过 API 层和对象键规范控制耦合。
- Edge Functions 不适合 PDF 等重任务，MVP 仍需一个可部署 Node worker。
- 数据库备份不包含 Storage 对象；必须建立独立对象清单、校验和与异地备份。
- 需要维护 RLS 与 API 授权的双层测试，避免规则漂移。

## 4. Provider-neutral 核心模型

| 实体 | 核心关系与职责 |
| --- | --- |
| `users` | Trailogue 内部用户、状态、资料、保留/删除策略 |
| `user_identities` | `user_id + provider + provider_subject` 唯一；Apple 是首个 provider |
| `trips` | 旅行资料、写作偏好、编排策略、状态、封面照片引用 |
| `photos` | Trip 所属、对象键、哈希、元数据来源/置信度、排序、处理状态 |
| `stories` | Trip 故事版本、结构化内容、生成元数据、编辑来源 |
| `books` | Trip + Story 版本生成的版式、状态、输出对象键、页数 |
| `jobs` | 类型、状态、阶段、幂等键、尝试次数、错误和心跳 |
| `job_items` | 照片/章节粒度任务项、重试和失败原因 |
| `legacy_imports` | 导入批次、源环境、校验和、统计和审计状态 |
| `legacy_id_map` | 旧集合/旧 ID 到新实体 UUID 的确定性映射 |

地点信息放在 Photo 的结构化列与 JSON 扩展中；Story 正文可先以有版本的 JSONB 保存，Book
引用固定 Story 版本，避免用户编辑故事后已生成 PDF 被悄然改变。

## 5. 标准 HTTPS API 边界

首个生产纵向切片只需：

- `POST /v1/auth/apple/session`：接收 Apple credential，由 Auth 服务验证并建立统一身份。
- `GET /v1/me`、`DELETE /v1/me`：当前用户和可审计删除流程。
- `GET /v1/trips`、`POST /v1/trips`、`GET/PATCH/DELETE /v1/trips/{id}`。
- `POST /v1/trips/{id}/photos/upload-intents`：返回短期签名上传信息和对象键。
- `POST /v1/trips/{id}/photos`：提交对象元数据，使用幂等键。
- `GET /v1/trips/{id}/photos`：游标分页。
- `POST /v1/trips/{id}/organize`、`GET /v1/jobs/{id}`：持久异步任务。
- `GET /v1/trips/{id}/story`：读取当前故事版本。

响应使用 HTTP 状态码和稳定的机器错误码，不继续沿用 CloudBase `{code: 0}` 或 OPENID 字段。

## 6. 决策前 POC 门槛

以下全部通过后，才把推荐转为正式 ADR：

1. Expo App 使用原生 Apple credential + nonce 完成 Supabase session。
2. `/v1/me` 能验证 JWT，并拒绝伪造、过期和错误 audience token。
3. 创建 Trip 后获得签名上传凭证，上传一张照片并持久化 Photo。
4. 两个测试用户无法读取或修改对方 Trip/Photo，API 与 RLS 测试都通过。
5. Queue 中任务可被 Node worker 领取、心跳、重试并幂等完成。
6. 生成一个最小 PDF 并存入私有 bucket，签名下载可用。
7. 完成 PostgreSQL 逻辑备份恢复和 Storage 对象清单恢复演练。

## 7. 撤销条件

出现任一条件时重新评估为独立 Node.js + PostgreSQL：

- 所需部署区域、数据驻留或合规要求无法满足；
- 经真实流量估算后，Supabase 总成本持续高于等价托管基础设施且团队有运维能力；
- Auth/Storage/API 配额阻断核心流程；
- 任务执行需要无法由独立 worker 合理补足的平台能力；
- 团队决定承担数据库、鉴权、存储、备份和安全更新的长期 SRE 责任。

Firebase 的反选条件是离线实时同步成为核心产品能力，且该收益足以承担 Firestore 数据模型
重构和平台锁定成本。
