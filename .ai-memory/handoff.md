## Handoff Checkpoint

**Updated**: 2026-10-18 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Phase B authenticated read path complete locally; live deployment and real-device Apple verification remain.
**Branch**: `feature/ios-app`
**HEAD**: `74f6e55`

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

1. Choose and register the final iOS bundle identifier; set the same value as `APPLE_BUNDLE_ID`.
2. Deploy the API and PostgreSQL to an explicitly approved Alibaba Cloud US environment and configure `EXPO_PUBLIC_API_BASE_URL` with HTTPS.
3. Run the live real-iPhone Sign in with Apple smoke test, verify first and returning login, session restore, `/v1/users/me`, Trip list and detail.
4. Then implement active Trip create/update before photo upload and AI organization.
5. Add explicit server-side sign-out/session revocation and decide authorization-code exchange/Apple revocation policy before production release.

### Recovery entry

- Read: `docs/25-phase-b-authenticated-data.md`, `docs/openapi.yaml`, `docs/22-alibaba-cloud-us-architecture.md`, `ios-app/README.md`.
- Verify from repository root: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- Verify iOS from `ios-app/`: set `TEMP` and `TMP` to a writable ignored folder, then run `npm run build` and `npm run doctor`.

### Blockers / external prerequisites

- A real Apple end-to-end token cannot be obtained on this Windows host without the final Apple Developer bundle identifier, entitlement, credentials, and a real iPhone.
- Alibaba Cloud account/project, final US Region, monthly budget, public API domain and deployment credentials are not yet provided; no billable resources were created.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL remain unconfigured.
- Current implementation issues one opaque session and does not yet exchange Apple authorization codes, refresh sessions, revoke Apple grants, or expose a server sign-out endpoint.
