# Trailogue mobile API contract

Status: active Wave 3B MVP contract. Authentication, trip, and private photo handlers are implemented.

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

Accepts `identityToken`, `authorizationCode`, `nonce`, and the optional first-login profile. The API verifies Apple's signature, issuer, audience, expiry, and nonce before linking the Apple subject and issuing a Trailogue session.

### `GET /v1/users/me`

Returns the canonical `UserDTO` for the authenticated Trailogue user.

### `GET /v1/trips?limit=20&cursor=...`

Returns `TripListResponse` using canonical Trip fields and cursor metadata.

### `GET /v1/trips/{id}`

Returns `{ data: TripDTO }` only when the authenticated user owns the trip.

### `POST /v1/trips/{tripId}/photos/uploads`

Requires a bearer session and matching UUID `Idempotency-Key`/`clientUploadId`. Returns a server-generated photo ID, exact headers, and a five-minute presigned private-R2 `PUT` URL. JPEG and PNG are allowed; the default maximum normalized size is 15 MiB.

### `POST /v1/trips/{tripId}/photos/{photoId}/complete`

Checks trip ownership and verifies the private R2 object with `HEAD` before marking the pending photo ready. Repeating completion for a ready photo is safe.

### `GET /v1/trips/{tripId}/photos`

Returns only verified ready photos for the owned trip, each with a short-lived presigned read URL. Storage keys and R2 credentials are never returned.

## Sources of truth

- TypeScript: `packages/contracts/src/index.ts`
- Runtime-generated OpenAPI: `/documentation` and `/documentation/json`
- Checked-in review specification: `docs/openapi.yaml`

The retired Mini Program and its Album/OPENID shapes are historical references only and are not compatibility targets.
