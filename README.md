# Trailogue（旅迹成书）

Trailogue is an overseas-first iOS travel storytelling app. The active product consists of an Expo/React Native iOS client, a Fastify HTTPS API, a PostgreSQL-backed worker, and shared TypeScript contracts. The former WeChat Mini Program and CloudBase code remain only as historical product references.

## Active architecture

```text
ios-app/ -> apps/api/ -> PostgreSQL 17
               |
               +-----> apps/worker/

packages/contracts  shared by iOS and API
packages/domain     platform-neutral models and enums
packages/database   Drizzle schema, migrations, repositories
packages/config     validated runtime configuration
```

The long-term deployment target is Alibaba Cloud US (ECS, RDS PostgreSQL, private OSS, ALB/HTTPS), but Phase A provisions no cloud resources.

## Requirements

- Node.js 22.13 or newer
- npm 11 or newer
- Docker Desktop with Docker Compose (for the standard local PostgreSQL runtime)
- macOS/Xcode only when running or building the native iOS target

## Local development

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev:api
```

In a second terminal:

```bash
npm run dev:worker
```

Run the iOS client from its existing location (moving it to `apps/ios` is intentionally deferred):

```bash
cd ios-app
npm run start
```

Local defaults are documented in [.env.example](./.env.example). Copy them to `.env` and change `SESSION_SECRET`; never commit the resulting file. Development seed data is blocked when `NODE_ENV=production`.

## Database

Schema changes are migration-only:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

The integration suite applies migrations to a fresh embedded PostgreSQL instance and verifies the development seed, identity uniqueness, session expiry, trip ownership, and job locking. Docker PostgreSQL is the supported day-to-day runtime.

## Quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

iOS-specific gates are available in `ios-app`: `lint`, `typecheck`, `test`, `build`, and `doctor`.

## API and worker

- API: `http://localhost:3000`
- Health: `GET /health`
- Readiness: `GET /ready`
- Interactive OpenAPI: `http://localhost:3000/documentation`
- Checked-in contract: [docs/openapi.yaml](./docs/openapi.yaml)
- Worker: PostgreSQL polling with atomic `FOR UPDATE SKIP LOCKED` claims

Apple token verification, real authentication endpoints, OSS uploads, AI, maps, PDF, payments, and cloud deployment belong to later phases. Phase A endpoints marked `501 NOT_IMPLEMENTED` are contract boundaries, not production-ready features.

## Historical source

`miniprogram/`, `cloudfunctions/`, and the early documents in `docs/` describe the retired WeChat/CloudBase client. They are not compatibility targets and must not be used as the active backend runbook. Current decisions begin with `docs/20-*`; the Phase A checkpoint is [docs/23-phase-a-local-backend.md](./docs/23-phase-a-local-backend.md).
