## Handoff Checkpoint

**Updated**: 2026-10-20 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Phase B.1 staging integration; Apple identifier configuration complete, deployment and real-device verification remain.
**Branch**: `feature/ios-app`
**HEAD**: `d0e092c` before the documentation checkpoint commit

### Completed

- Implemented Apple identity JWT verification with Apple's fixed HTTPS JWKS endpoint through `jose` 6.2.12.
- Enforced RS256 signature, Apple issuer, configured bundle-ID audience, expiry, subject, and nonce.
- Added transactional Apple subject resolution with a PostgreSQL advisory lock and the existing provider-subject unique constraint.
- Added opaque Trailogue sessions whose raw token is returned once and whose HMAC-SHA-256 hash is persisted.
- Added bearer middleware with generic 401 responses and authorization-header log redaction.
- Activated `POST /v1/auth/apple`, `GET /v1/users/me`, `GET /v1/trips`, and `GET /v1/trips/{id}`.
- Added owner-scoped Trip SQL, photo counts, bounded limit and stable keyset pagination.
- Kept the existing Expo iOS SecureStore/auth restore/API repository/Trip UI path; it now matches the active backend contract without additional screen expansion.
- Removed the unimplemented refresh token from the shared session DTO.
- Updated OpenAPI and added `docs/25-phase-b-authenticated-data.md`.
- Synchronized `feature/ios-app` with GitHub at `f2430d5` before Phase B.1 changes.
- Registered the explicit Apple App ID and configured Expo/backend templates with `com.qianjin2700.trailogue`.
- Verified that Sign in with Apple is enabled as a primary App ID in Apple Developer.
- Verified Expo config produces the `com.apple.developer.applesignin = Default` entitlement.
- Replaced the Phase B.1 host plan with Railway Fastify API plus an isolated Neon PostgreSQL staging database; Alibaba ECS is not used for this phase.
- Added a root API-only Dockerfile, deterministic `npm ci` install path, staging runtime support, and Railway/Neon deployment runbook.
- Commits:
  - `3c08f9c feat(data): add identity and owner-scoped trip access`
  - `84f3944 feat(auth): verify Apple identity and expose protected data`
  - `74f6e55 docs(backend): record Phase B authenticated data flow`
  - `d0e092c chore(staging): prepare Railway API deployment`

### Verification

- Root `lint`: pass.
- Root `typecheck`: pass.
- Root `test`: pass (config 3, database 3, API 18 including subtests, worker 3, iOS 13).
- Root backend `build`: pass.
- iOS `expo export --platform ios`: pass after redirecting Hermes temp files to a writable repository cache.
- Expo Doctor: 21/21 pass.
- Git diff whitespace check: pass before commits.

### Next

1. Create the empty `trailogue-staging` Neon project and retain its TLS connection string only as a Railway secret.
2. Create the `Trailogue Staging` Railway project from `feature/ios-app`, use the root Dockerfile, configure `npm run db:migrate` as pre-deploy, and use `/ready` as the healthcheck.
3. Generate the Railway HTTPS domain and verify `/health`, `/ready`, and the eight migrated tables without running a seed.
4. Configure the EAS preview environment and create a signed real-device build for the registered App ID.
5. Run first/returning Apple login, session restore, 401 cleanup, `/v1/users/me`, and owner-scoped Trip list/detail on a real iPhone.
6. Enter Phase C only after every Phase B.1 gate passes.

### Recovery entry

- Read: `docs/25-phase-b-authenticated-data.md`, `docs/26-phase-b1-staging-integration.md`, `docs/openapi.yaml`, and `ios-app/README.md`.
- Verify from repository root: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Verify iOS from `ios-app/`: set `TEMP` and `TMP` to a writable ignored folder, then run `npm run build` and `npm run doctor`.

### Blockers / external prerequisites

- Apple App ID registration, primary Sign in with Apple capability, and Expo entitlement are verified; a real signed iPhone build is not yet verified.
- Neon and Railway projects have not yet been created or connected, and no real Secret or database credential has been handled.
- The Dockerfile command path is verified locally, but the image itself is not locally built because Docker Desktop is unavailable; Railway's first build remains the image-level gate.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL remain unconfigured.
- Current implementation issues one opaque session and does not yet exchange Apple authorization codes, refresh sessions, revoke Apple grants, or expose a server sign-out endpoint.
