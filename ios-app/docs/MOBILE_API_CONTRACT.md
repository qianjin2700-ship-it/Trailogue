# Trailogue mobile API contract

Status: active Phase A contract. Runtime auth/user/trip handlers remain explicitly unimplemented until Phase B.

## Shared behavior

- Base URL: `EXPO_PUBLIC_API_BASE_URL` (public configuration only).
- Authentication: `Authorization: Bearer <session token>` except Apple sign-in.
- Successful object: `{ "data": {} }`.
- Successful list: `{ "data": [], "meta": { "nextCursor": null } }`.
- Error: `{ "error": { "code": "UNAUTHORIZED", "message": "...", "requestId": "..." } }`.
- Dates and event times use ISO 8601 UTC; trip calendar dates use `YYYY-MM-DD`.
- Ownership always comes from the verified server session.

Canonical DTOs live in `packages/contracts`; the iOS transport layer re-exports them and does not carry legacy CloudBase fields.

## Routes

### `POST /v1/auth/apple`

Accepts `identityToken`, `authorizationCode`, `nonce`, and the optional first-login profile. Phase B must verify Apple's signature, issuer, audience, expiry, and nonce before linking the Apple subject and issuing a Trailogue session. Phase A returns `501 NOT_IMPLEMENTED`.

### `GET /v1/users/me`

Returns the canonical `UserDTO` for the authenticated Trailogue user. Phase A returns `501 NOT_IMPLEMENTED`.

### `GET /v1/trips?limit=20&cursor=...`

Returns `TripListResponse` using canonical Trip fields and cursor metadata. Phase A returns `501 NOT_IMPLEMENTED`.

### `GET /v1/trips/{id}`

Returns `{ data: TripDTO }` only when the authenticated user owns the trip. Phase A validates the UUID and then returns `501 NOT_IMPLEMENTED`.

## Sources of truth

- TypeScript: `packages/contracts/src/index.ts`
- Runtime-generated OpenAPI: `/documentation` and `/documentation/json`
- Checked-in review specification: `docs/openapi.yaml`

The retired Mini Program and its Album/OPENID shapes are historical references only and are not compatibility targets.
