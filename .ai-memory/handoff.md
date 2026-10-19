## Handoff Checkpoint

**Updated**: 2026-10-19 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Phase B.1 staging integration; Apple identifier configuration complete, deployment and real-device verification remain.
**Branch**: `feature/ios-app`
**HEAD**: `e8b51b4`

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
- Verified Expo config produces the `com.apple.developer.applesignin = Default` entitlement.
- Commits:
  - `3c08f9c feat(data): add identity and owner-scoped trip access`
  - `84f3944 feat(auth): verify Apple identity and expose protected data`
  - `74f6e55 docs(backend): record Phase B authenticated data flow`

### Verification

- Root `lint`: pass.
- Root `typecheck`: pass.
- Root `test`: pass (config 2, database 3, API 18 including subtests, worker 3, iOS 13).
- Root backend `build`: pass.
- iOS `expo export --platform ios`: pass after redirecting Hermes temp files to a writable repository cache.
- Expo Doctor: 21/21 pass.
- Git diff whitespace check: pass before commits.

### Next

1. Confirm in Apple Developer that Sign in with Apple is enabled for `com.qianjin2700.trailogue` as a primary App ID.
2. Audit the purchased Alibaba Cloud US host, choose the staging PostgreSQL placement and configure a user-controlled HTTPS API domain.
3. Deploy without production seed data, execute the empty-database migration, and verify health/readiness and authenticated APIs.
4. Run the real-iPhone Sign in with Apple smoke test, including first and returning login, session restore, 401 cleanup, `/v1/users/me`, and owner-scoped Trip list/detail.
5. Enter Phase C only after every Phase B.1 gate passes.

### Recovery entry

- Read: `docs/25-phase-b-authenticated-data.md`, `docs/openapi.yaml`, `docs/22-alibaba-cloud-us-architecture.md`, `ios-app/README.md`.
- Verify from repository root: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Verify iOS from `ios-app/`: set `TEMP` and `TMP` to a writable ignored folder, then run `npm run build` and `npm run doctor`.

### Blockers / external prerequisites

- Apple App ID registration and the Expo entitlement are verified, but the Apple Developer capability state and a real signed iPhone build are not yet verified.
- The purchased Alibaba Cloud host is reachable on SSH, but product type, US Region, specifications, login method, database placement, and public API domain are not yet confirmed; no resources were changed.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL remain unconfigured.
- Current implementation issues one opaque session and does not yet exchange Apple authorization codes, refresh sessions, revoke Apple grants, or expose a server sign-out endpoint.
