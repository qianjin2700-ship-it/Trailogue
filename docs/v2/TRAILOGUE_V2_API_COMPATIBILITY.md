# Trailogue 2.0 API compatibility

Status: Phase C implementation contract. The App Store 1.0 client is a protected consumer.

## Decision

Trailogue 2.0 is an additive client and renderer evolution. Existing `/v1` paths, request bodies,
response envelopes, authentication rules, and error semantics remain unchanged. A `/v2` namespace is
only required when a future capability cannot be represented as an optional extension.

## Protected 1.0 contracts

- Apple session creation/restoration and Bearer authentication remain unchanged.
- Trip CRUD, creative requirements, photo upload/complete/list, story generation/versioning, book
  preview/layout, share creation/revocation and user deletion keep their existing `/v1` semantics.
- A share URL remains `/share/:token`; `/v1/shared/:token` remains readable.
- `/share/:token` and `/share/:token?view=magazine` continue to use the legacy server renderers by
  default, so links created by installed 1.0 clients do not change appearance or behavior.
- Photo object keys, presigned URL behavior, R2 privacy and owner scoping are unchanged.

## Phase C additive behavior

The 2.0 iOS client appends `renderer=v2` to a share URL. The server then adapts the existing
`SharedStoryDTO` to `DocumentSource` and renders through `@trailogue/book`:

| URL | Result |
| --- | --- |
| `/share/:token` | legacy Story share page |
| `/share/:token?view=magazine` | legacy Magazine share page |
| `/share/:token?view=story&renderer=v2` | shared Story 2.0 renderer |
| `/share/:token?view=magazine&renderer=v2` | shared Magazine 2.0 renderer |

The opt-in query is deliberately not stored in the database and does not change token validation,
expiry, revocation, access counting or owner isolation.

## Contract evolution rules

1. Existing required fields may not be removed, renamed, narrowed or assigned a new meaning.
2. New response fields must be optional for old clients. New request behavior requires a new optional
   field with a server default preserving 1.0 behavior, or a new `/v2` endpoint.
3. Unknown optional rendering hints must be ignored; AI output is validated before persistence.
4. Story and Magazine documents contain semantics, never CSS or arbitrary HTML.
5. No 2.0 client may depend on a destructive migration or on backfilling old rows.

## Regression gate

Before a Phase C commit is releasable:

- all existing API tests must pass;
- unauthenticated protected routes still return 401;
- cross-user access still returns the existing safe 404 behavior;
- legacy share renderer tests and the new opt-in V2 share tests must both pass;
- Apple sign-in, session restoration, trip CRUD, photos, story generation and PDF export client tests
  must remain green.

