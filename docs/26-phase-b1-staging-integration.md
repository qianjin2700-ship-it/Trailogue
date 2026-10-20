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

- Confirm that the Expo account can create or access the EAS project for this bundle identifier.
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
- The image starts with `npm --prefix apps/api start` and listens on Railway's injected `PORT` at `0.0.0.0`.
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

## Staging environment variables

Set these only in Railway's staging environment. Do not paste their values into tickets, logs, screenshots, documentation, Expo variables, or Git:

```env
NODE_ENV=staging
DATABASE_URL=<Neon staging connection string>
APP_BASE_URL=https://<Railway generated domain>
APPLE_BUNDLE_ID=com.qianjin2700.trailogue
SESSION_SECRET=<independently generated high-entropy value, at least 32 characters>
SESSION_TTL_SECONDS=2592000
```

`PORT` is supplied by Railway and must not be hardcoded. Use the Neon connection string exactly as issued, including its TLS query parameters. The iOS app receives only the resulting HTTPS API base URL through `EXPO_PUBLIC_API_BASE_URL`; it never receives `DATABASE_URL` or `SESSION_SECRET`.

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

## Pending deployment gates

- Create the isolated `trailogue-staging` Neon project and collect its TLS connection string without committing or sharing it.
- Create the `Trailogue Staging` Railway project, connect the GitHub branch, apply the documented service settings, and inject secrets.
- Deploy the API and execute the empty-database migration without development or production seed data.
- Record the generated Railway HTTPS URL as `STAGING_API_BASE_URL` and configure the EAS preview environment's `EXPO_PUBLIC_API_BASE_URL`.
- Verify `/health`, `/ready`, Apple authentication, authenticated user access, Trip list/detail ownership, session persistence, restart restore, and 401 cleanup.
- Verify first-time and returning Sign in with Apple behavior on a real iPhone.

## Current result

Phase C Ready: **NO**. The App ID/capability and local Phase B implementation are complete. Railway deployment, Neon migration, EAS signing, and real-device verification remain open.
