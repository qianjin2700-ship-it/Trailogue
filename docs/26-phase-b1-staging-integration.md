# Phase B.1 Staging Integration

## Scope

Phase B.1 deploys the existing authenticated read path to a staging-only environment and verifies the real-device flow from Sign in with Apple through the HTTPS API to PostgreSQL. It does not add Trip creation, media upload, AI, PDF, payment, subscriptions, or other product features.

## Verified baseline

| Gate | Status | Evidence |
| --- | --- | --- |
| Git branch | Pass | Local and GitHub `feature/ios-app` both resolved to `f2430d5e40c7f57dc30fcb475b2446c5c0fcaad6` before Phase B.1 configuration work. |
| Apple App ID | Pass | An explicit App ID was registered for `com.qianjin2700.trailogue`. |
| Apple capability | Pass | The App ID has **Sign in with Apple** enabled as a primary App ID. |
| Expo bundle identifier | Pass | `ios.bundleIdentifier` resolves to `com.qianjin2700.trailogue`. |
| Backend Apple audience template | Pass | `.env.example` uses `APPLE_BUNDLE_ID=com.qianjin2700.trailogue`; real staging configuration must be injected outside Git. |
| Expo Apple auth package | Pass | `expo-apple-authentication` is installed and configured as an Expo plugin. |
| Expo Apple entitlement | Pass | Expo config introspection resolves `com.apple.developer.applesignin` to `Default`. |
| Deployment baseline | Pass | `feature/ios-app` is clean and local/GitHub HEAD both resolve to `49f590b91ac7a9fcf5562b3b241df78a8c87c2a5` before the Railway/Neon preparation commit. |

## Apple integration still to verify

- The Expo team project `@hardworkgirls-team/trailogue` is linked to this repository. EAS generated project ID `aef33182-1a9a-4807-83a0-e5b2d2096654`, which is recorded in `app.json` together with owner `hardworkgirls-team`.
- Generate a development build with the matching provisioning profile and install it on a real iPhone.
- Do not create a Services ID or Sign in with Apple private key for the current native-token verification path.

## Approved staging topology

The Alibaba Cloud ECS host is no longer part of Phase B.1. Staging uses only the API service and an empty managed PostgreSQL database:

```text
Real iPhone
  -> Railway HTTPS domain
  -> Fastify API
  -> Neon PostgreSQL (TLS)
```

No Worker, Cloudflare R2, Redis, production environment, or product feature expansion is deployed in this phase. Production architecture remains a separate decision.

## Repository deployment path

- Railway must build from the repository root so the API can consume the four shared packages.
- The root `Dockerfile` installs only `packages/domain`, `packages/contracts`, `packages/config`, `packages/database`, and `apps/api`; it does not install the iOS app or Worker.
- Dependency installation uses the committed package lockfiles through `npm ci`.
- The image starts with `npm --prefix apps/api start` and listens on the configured `PORT` at `0.0.0.0`.
- Configure Railway's pre-deploy command as `npm run db:migrate`. A failed migration must stop the deployment.
- Configure Railway's healthcheck path as `/ready`, not merely `/health`, so a deployment is not considered ready without Neon connectivity.
- Do not execute `npm run db:seed` in staging.

Railway's legacy repository `railway.json`/`railway.toml` configuration format is approaching retirement, so service settings are recorded here and applied in the Railway dashboard rather than introducing a short-lived config file.

## Railway service settings

| Setting | Value |
| --- | --- |
| Service source | GitHub repository `qianjin2700-ship-it/Trailogue`, branch `feature/ios-app` |
| Root directory | Repository root |
| Builder | Dockerfile (auto-detected root `Dockerfile`) |
| Pre-deploy command | `npm run db:migrate` |
| Pre-deploy timeout | 300 seconds |
| Start command | Leave unset; use the Dockerfile `CMD` |
| Healthcheck path | `/ready` |
| Healthcheck timeout | 60 seconds |
| Public networking | Generate one Railway HTTPS domain |
| Runtime port | `PORT=3000`, aligned with the generated domain target port and Docker image metadata |

## Staging environment variables

Set these only in Railway's staging environment. Do not paste their values into tickets, logs, screenshots, documentation, Expo variables, or Git:

```env
NODE_ENV=staging
DATABASE_URL=<Neon staging connection string>
APP_BASE_URL=https://<Railway generated domain>
APPLE_BUNDLE_ID=com.qianjin2700.trailogue
SESSION_SECRET=<independently generated high-entropy value, at least 32 characters>
SESSION_TTL_SECONDS=2592000
PORT=3000
```

`PORT=3000` is a non-secret Railway service variable for this staging service. It matches the generated public-domain target port and the Docker image's exposed port. Use the Neon connection string exactly as issued, including its TLS query parameters. The iOS app receives only the resulting HTTPS API base URL through `EXPO_PUBLIC_API_BASE_URL`; it never receives `DATABASE_URL` or `SESSION_SECRET`.

## Empty-database migration gate

1. Create a Neon project named `trailogue-staging`, separate from development and future production.
2. Confirm the selected database is empty.
3. Add its connection string to Railway as `DATABASE_URL`.
4. Deploy the API; the pre-deploy command applies `packages/database/drizzle/0000_initial.sql`.
5. Confirm the eight actual tables: `users`, `user_identities`, `sessions`, `trips`, `photos`, `stories`, `books`, and `jobs`.
6. Confirm `/health` returns 200 and `/ready` returns 200.
7. Do not run any seed command.

## Secret handling

- Never commit Apple identity tokens, Trailogue session tokens, database credentials, private keys, or staging environment files.
- Keep the real `DATABASE_URL` and `SESSION_SECRET` only in Railway's staging environment variables.
- Set `APPLE_BUNDLE_ID` to `com.qianjin2700.trailogue` in the staging runtime.
- Redact authorization headers and credential-bearing connection strings from logs and handoff documents.

## Deployed staging checkpoint

Verified on 2026-10-21:

| Gate | Result | Evidence |
| --- | --- | --- |
| Railway deployment | Pass | `Trailogue Staging` service deployment `11d2ec60-1a2f-445e-b96b-8c12f4a17518` reached `ACTIVE` from commit `bce2a51`. |
| HTTPS API | Pass | `https://trailogue-staging.up.railway.app` serves the API over HTTPS. |
| Empty migration | Pass | Railway pre-deploy logs report `Database migrations completed`; no seed command was run. |
| PostgreSQL schema | Pass | The isolated Neon `trailogue-staging` project contains exactly `users`, `user_identities`, `sessions`, `trips`, `photos`, `stories`, `books`, and `jobs`; the inspected tables contain no seed rows. |
| Process health | Pass | `GET /health` returned 200 with `{"data":{"status":"ok"}}`. |
| Database readiness | Pass | `GET /ready` returned 200 with `{"data":{"status":"ready"}}`; Railway's deployment healthcheck also passed this route. |
| Bearer enforcement | Pass | Anonymous requests to `GET /v1/users/me`, `GET /v1/trips`, and `GET /v1/trips/{id}` each returned the generic 401 response. |
| Invalid Apple token | Pass | A correctly shaped `POST /v1/auth/apple` request carrying a deliberately invalid identity token returned 401 with `INVALID_APPLE_TOKEN`. |
| Secret handling | Pass | Railway keeps database and session credentials as service variables; credentials and tokens were not copied into Git or this document. API logging redacts the authorization header. |

The PostgreSQL client currently emits a compatibility warning about the future interpretation of `sslmode=require`. Current TLS connectivity and `/ready` pass. Before production, make the desired certificate-verification semantics explicit (`sslmode=verify-full` or the provider-recommended libpq compatibility option) and re-run the connection tests.

## Pending real-device gates

- Configure the EAS preview environment's `EXPO_PUBLIC_API_BASE_URL` as `https://trailogue-staging.up.railway.app`.
- Create a signed preview/development build for the registered App ID and install it on a real iPhone.
- Verify first-time and returning Sign in with Apple behavior with the correct audience.
- Verify a wrong-audience Apple token is rejected by staging.
- Verify the authenticated `GET /v1/users/me`, `GET /v1/trips`, and `GET /v1/trips/{id}` flows.
- Verify session persistence, app-restart restore, generic 401 cleanup, and Trip isolation between two identities.

## Current result

Phase C Ready: **NO**. Railway deployment, HTTPS, the empty Neon migration, readiness, bearer enforcement, invalid-token rejection, and EAS project linkage are complete. The preview API environment value, EAS signing, and every real-iPhone authenticated/session/isolation gate remain open.

## Sources

- `Dockerfile`: staging image entry point and port metadata.
- `apps/api/src/server.ts`: runtime configuration, PostgreSQL wiring, Apple audience verifier, and authorization-header redaction.
- `apps/api/src/routes/system.ts`: `/health` and database-backed `/ready` behavior.
- `apps/api/test/app.test.ts`: authentication, protected-route, and owner-scoping regression coverage.
- Railway deployment logs and public endpoint smoke tests captured on 2026-10-21.
- Neon Tables view for the isolated `trailogue-staging` database captured on 2026-10-21.
