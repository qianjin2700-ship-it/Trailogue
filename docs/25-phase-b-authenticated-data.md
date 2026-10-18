# Phase B — Authenticated iOS Data Path

Status: implemented locally on `feature/ios-app`.

## Delivered flow

1. The Expo iOS client requests an Apple credential with a random nonce and state.
2. `POST /v1/auth/apple` verifies the JWT signature through Apple's HTTPS JWKS endpoint and enforces issuer, audience, expiry, subject, and nonce.
3. The verified Apple subject resolves to one `user_identities` record. First sign-in creates the `users` and `user_identities` rows in one serialized database transaction.
4. The API returns one opaque Trailogue access token. Only its HMAC-SHA-256 hash is stored in `sessions`.
5. Bearer middleware resolves active, unexpired, non-revoked sessions for protected routes.
6. `GET /v1/users/me`, `GET /v1/trips`, and `GET /v1/trips/{id}` use the authenticated user ID. Trip SQL is owner-scoped.
7. The existing iOS auth provider stores the access token in SecureStore, restores the session through `/v1/users/me`, and renders API-backed trip list/detail views.

## Trust boundaries

- The client-provided profile email is not trusted. The user email comes only from the verified Apple identity token.
- Apple full name is available only during the first authorization and is used only when creating a new user.
- The API never stores or logs the raw Apple identity token or raw Trailogue access token.
- Authentication failures return generic errors and do not disclose session or identity state.
- Apple identity creation is protected by a transaction-scoped advisory lock and the database uniqueness constraint on provider plus provider subject.

## Configuration

- `APPLE_BUNDLE_ID` must exactly match the final iOS bundle identifier and Apple token audience.
- `SESSION_SECRET` must be a deployment secret of at least 32 characters and must not enter Git.
- `SESSION_TTL_SECONDS` defaults to 30 days.
- `EXPO_PUBLIC_API_BASE_URL` must point the iOS build to the public HTTPS API.

## Validation boundary

Automated tests use locally generated RSA keys to validate signature and claim handling without impersonating Apple. A final release still requires a real iPhone, the final Apple Developer bundle identifier and entitlement, and an HTTPS deployment to validate the live Apple credential end to end.

## Explicitly deferred

Session refresh and remote Apple-token revocation, explicit server-side sign-out, Trip create/update, photo upload and OSS, AI organization, maps, books/PDF, sharing, billing, subscriptions, push notifications, and Alibaba Cloud provisioning remain outside Phase B.
