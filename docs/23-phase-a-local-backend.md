# Phase A — Local Backend Foundation

Status: implemented locally on `feature/ios-app`.

## Decisions

- Fastify 5 for the HTTP boundary and generated OpenAPI.
- Drizzle ORM and explicit PostgreSQL migrations; no second ORM.
- PostgreSQL 17 is the standard Docker runtime.
- PGlite is used only by tests to prove migrations and repositories against a fresh PostgreSQL-compatible database when a Docker daemon is unavailable.
- Session tokens are random client secrets; only HMAC-SHA-256 hashes are persisted.
- Job claims are atomic updates over `SELECT ... FOR UPDATE SKIP LOCKED`.
- The iOS client consumes pure TypeScript contracts and uses `/v1/trips`; CloudBase Album DTOs are retired.
- Apple verification and functional auth/trip endpoints remain explicitly out of scope until Phase B.

## Commands

```bash
npm install
docker compose up -d postgres
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:worker
```

## Local dependency note

The repository uses npm. On Windows environments that prohibit symlink creation, internal `file:` packages are installed as copies with `--install-links`. The existing `ios-app/` directory is intentionally not moved during this phase.

## Security boundary

The iOS application receives no database credentials, OSS secrets, Apple server keys, or raw stored session values. API logs use Fastify's structured request logging and must not add Authorization, identity-token, photo-content, or story-body fields.

## Deferred to Phase B

Real Sign in with Apple verification, user/session middleware, active trip CRUD, OSS, image processing, AI, maps, books/PDF, payments, subscriptions, and Alibaba Cloud provisioning.
