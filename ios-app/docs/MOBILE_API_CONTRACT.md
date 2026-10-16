# Mobile API boundary

The production backend currently exposes WeChat Cloud Functions through
`wx.cloud.callFunction`. Authentication is derived from
`cloud.getWXContext().OPENID`; there is no HTTPS bearer-token endpoint, current-user
endpoint, or Apple identity-token verification endpoint yet.

The iOS app therefore treats the following routes as a proposed gateway contract.
They are implemented in the client, but they are not production-ready until a
backend gateway implements them.

## Shared behavior

- Base URL: `EXPO_PUBLIC_API_BASE_URL` (public configuration only).
- Authentication: `Authorization: Bearer <session token>` except Apple sign-in.
- Response envelope: the existing `{ "code": 0, "data": ... }` shape.
- Existing CloudBase error numbers are normalized by the client.
- The backend derives ownership from the verified session. It must not trust a
  client-provided `_openid` or owner identifier.

## Routes

### `POST /v1/auth/apple`

Accepts the Apple `identity_token`, authorization code, nonce, and the optional
name/email values Apple only returns on the first authorization. The server must:

1. verify the JWT signature against Apple's keys;
2. validate issuer, audience, expiry, and nonce;
3. exchange or validate the authorization code where required;
4. link or create the Trailogue user using the Apple subject;
5. return `{ access_token, user }` only after verification succeeds.

### `GET /v1/users/me`

Returns the current `users` document fields represented by `UserDTO`. The gateway
should omit provider-internal ownership identifiers from its public response once
the production contract is finalized.

### `GET /v1/albums?limit=20&cursor=...`

Returns the existing `listAlbums` payload: `{ items, next_cursor }`. The iOS app
maps each album list item into a `TripSummary`; it does not synthesize destination
or travel-date fields that are absent from the current schema.

### `GET /v1/albums/:id`

Returns the existing `getAlbum` payload. The gateway must enforce ownership using
the authenticated server session before returning the document.

## Not included in Wave 2

No Cloud Function, database schema, production environment, upload path, AI flow,
book/PDF flow, payment flow, or Mini Program behavior is changed by this contract.

