# Wave 3B Photo Upload Technical Plan

**Status:** Wave 3B MVP implemented locally on 2026-10-27. Code, tests, OpenAPI, and migration `0002_photo_upload_mvp.sql` are present. Cloudflare resources, Railway variables/deployment, Neon staging migration, EAS build, and remote push remain intentionally pending manual action.

The implemented MVP covers upload intent, direct single-part upload, object verification, metadata persistence, owner-scoped reads, iOS normalization/progress/retry, and the Trip gallery. Automated orphan deletion, photo deletion, thumbnails, background queue restoration, quotas/rate limits, and multipart upload remain hardening work; pending/failed rows and expiry indexes are in place so cleanup can be added safely before production launch.

## 1. Recommendation

Use a **private Cloudflare R2 Standard bucket** with this path:

1. The authenticated iOS app asks the Railway API to create an upload intent.
2. Railway verifies that the current user owns the Trip, chooses the object key, and creates a short-lived presigned `PUT` URL with a signed `Content-Type`.
3. iOS uploads the normalized image directly to R2 and reports progress.
4. iOS calls a completion endpoint.
5. Railway performs `HEAD` against R2, verifies the key, size, type, and upload state, then marks the Neon photo row ready.
6. Trip photo reads remain owner-scoped through Railway, which returns short-lived presigned `GET` URLs. The bucket itself is never public.

R2 is the recommended MVP storage because it is S3-compatible, supports server-generated presigned URLs, has a useful Standard free tier, and does not charge R2 Internet egress. It keeps large image bodies off Railway while preserving the existing Fastify authorization boundary. Cloudflare documents direct signed uploads as a standard user-generated-content architecture.

Do not add a Cloudflare Worker in the first upload slice. Railway can sign R2 requests with the AWS SDK and remains the single authorization service. Reconsider a Worker only if image transformation, malware scanning, edge authorization, or strict pre-transfer size enforcement becomes necessary.

Official references:

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)
- [R2 object lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/)
- [R2 jurisdictional data location](https://developers.cloudflare.com/r2/reference/data-location/)
- [Expo SDK 57 ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [Expo SDK 57 ImageManipulator](https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator/)
- [Expo SDK 57 FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/)

## 2. Current R2 pricing and cost risks

Prices below were verified against Cloudflare's official page on **2026-10-27** and can change; recheck before provisioning or production launch.

| Standard R2 item | Included monthly | Price after included usage |
|---|---:|---:|
| Storage | 10 GB-month | USD 0.015 / GB-month |
| Class A operations | 1 million | USD 4.50 / million |
| Class B operations | 10 million | USD 0.36 / million |
| Internet egress from R2 | Free | Free |

`PutObject` is Class A. `HeadObject` and `GetObject` are Class B. Deletes and multipart aborts are currently free. Cloudflare rounds billable usage up to billing units. The free tier applies to Standard storage, not Infrequent Access.

Illustrative storage-only estimates after the free 10 GB, assuming a normalized average of 3 MB per photo and ignoring thumbnails:

| Stored photos | Approximate storage | Approximate monthly R2 storage |
|---:|---:|---:|
| 1,000 | 3 GB | USD 0 |
| 10,000 | 30 GB | about USD 0.30 |
| 100,000 | 300 GB | about USD 4.35 |

These are planning examples, not quotes. Main cost risks are originals larger than the assumed size, thumbnail/AI derivatives, abandoned uploads, very high read counts, operation rounding, and charges from services connected to R2 even though R2 egress itself is free. Standard is preferable for the MVP; Infrequent Access has no free tier, retrieval charges, and a 30-day minimum storage duration.

## 3. Railway and R2 interaction architecture

```text
iPhone
  | 1. authenticated upload intent (small JSON)
  v
Railway Fastify API ---- owner check / upload intent ----> Neon
  | 2. presign PUT with bucket-scoped R2 credential
  v
iPhone ---------------- image bytes + signed headers ----> private R2
  | 3. authenticated completion request
  v
Railway Fastify API ---- HEAD verify object -------------> private R2
  |                     transaction: ready metadata -----> Neon
  |
  | 4. owner-scoped list/detail returns short GET URLs
  v
iPhone ---------------- authenticated GET URL ----------> private R2
```

Only Railway stores the R2 Access Key ID and Secret Access Key. A presigned URL is a bearer credential, so it must be object-specific, operation-specific, short-lived, excluded from logs and analytics, and replaced after expiry. Recommended upload expiry is 5 minutes; recommended read expiry is 5–10 minutes.

The API must generate an opaque object key such as:

```text
users/{userId}/trips/{tripId}/photos/{photoId}/original.jpg
```

The client never supplies or edits the storage key. Knowing another object's key is insufficient because every signing endpoint rechecks Trip ownership.

## 4. Proposed API surface

### `POST /v1/trips/{tripId}/photos/uploads`

Creates an owner-scoped pending photo and upload intent. Require the existing bearer session and an `Idempotency-Key`.

Request fields:

- `clientUploadId` UUID
- sanitized original filename
- normalized MIME type
- normalized byte size
- width and height
- optional capture timestamp and explicitly approved coordinates

Response fields:

- `photoId`, `uploadId`
- `uploadUrl`, `method: PUT`, exact signed headers, `expiresAt`
- server limits such as `maxBytes` and allowed MIME types

The API rejects a Trip not owned by the caller, disallowed type, invalid dimensions, claimed oversize file, exceeded per-user quota, or duplicate active intent. Repeating the same idempotency key returns the same pending photo and a refreshed URL when appropriate.

### `POST /v1/trips/{tripId}/photos/{photoId}/complete`

Idempotently finalizes the upload. Railway performs `HeadObject` and verifies:

- the pending row belongs to the current user and Trip;
- the expected object key is exact;
- `Content-Length` is positive, matches the claimed normalized size, and is at or below the server limit;
- `Content-Type` matches the signed allow-listed type;
- ETag/checksum metadata is present when required;
- the upload intent is not expired or already failed.

On success, store verified metadata and mark the row `ready` in one database transaction. On mismatch, delete the object where safe, mark the row failed, and return a stable error code. A second completion call returns the already-ready Photo.

### `GET /v1/trips/{tripId}/photos`

Returns only ready photos for an owned Trip, ordered by `sortOrder, createdAt`. Each response includes a short-lived display URL or a batch token that resolves to one. Do not return raw R2 credentials or permanent public URLs.

### Later: `DELETE /v1/trips/{tripId}/photos/{photoId}`

Owner-scoped and idempotent. Mark deletion in Neon, remove original and derivatives from R2, clear `coverPhotoId` if needed, and make retry safe if either side temporarily fails.

### Optional later endpoints

- `POST .../{photoId}/upload-url` to refresh an expired pending upload URL.
- `PATCH .../{photoId}` for caption, capture time, location, and sort order.
- Batch presigned read URLs if list responses become too large.

## 5. Neon photo model

The existing `photos` table already has the right core ownership and media fields: `user_id`, `trip_id`, `storage_key`, `thumbnail_key`, filename, MIME type, dimensions, size, capture time, coordinates, sort order, and creation time.

Implemented additions for the Wave 3B MVP:

| Field | Purpose |
|---|---|
| `status` enum (`pending`, `ready`, `failed`, `deleting`) | Prevent unverified objects from appearing in Trip reads |
| `client_upload_id` UUID | Per-user retry/idempotency identity |
| `upload_expires_at` timestamptz | Expire unused upload intents |
| `uploaded_at` timestamptz | Record verified R2 completion |
| `updated_at` timestamptz | Track metadata/status changes |
| `etag` varchar(160), nullable | Store the verified object version/integrity marker |
| `failure_code` varchar(80), nullable | Support retry UI without persisting sensitive provider errors |
| `deleted_at` timestamptz, nullable | Coordinate recoverable object deletion and retries |

Recommended constraints and indexes:

- unique `storage_key` (already present);
- unique `(user_id, client_upload_id)`;
- index `(trip_id, status, sort_order)`;
- index `(status, upload_expires_at)` for orphan cleanup;
- positive checks for file size and dimensions;
- retain the current owner and Trip foreign keys with cascade behavior.

Do not store presigned URLs in Neon. Do not store raw EXIF blobs by default. Extract only product fields such as capture time and opt-in location, then strip EXIF from the normalized upload to reduce privacy leakage.

## 6. iOS upload interaction

1. User taps **Add photos** and selects images through Expo ImagePicker.
2. Validate type, `fileSize`, count, and dimensions locally for fast feedback.
3. Normalize before upload:
   - HEIC/HEIF → JPEG for predictable display and downstream AI compatibility;
   - JPEG → resized/compressed JPEG;
   - PNG → preserve PNG only when transparency is needed, otherwise normalize to JPEG;
   - suggested MVP target: longest edge at most 4096 px, JPEG quality around 0.82, and hard normalized size at most 15 MB per photo.
4. Extract only approved metadata. Ask before retaining precise location; strip embedded EXIF from the output.
5. Request an upload intent from Railway.
6. Upload binary content directly to the presigned R2 `PUT` URL with the exact signed `Content-Type` and show bytes-sent progress.
7. Call completion; show the photo only after the server returns `ready`.
8. Retry uses the same `clientUploadId`. If the URL expired, obtain a new URL; do not create a duplicate Photo.

Expo SDK 57 ImagePicker exposes URI, MIME type, file size, dimensions, filename, and optional EXIF. Expo ImageManipulator can resize and save JPEG/PNG/WebP. Expo FileSystem provides native upload tasks with progress and cancellation. These packages must be installed with `npx expo install` during Wave 3B, followed by a new development/preview binary when required; none were added in Wave 3A.1.

For the first slice, use single-part `PUT`. R2 recommends it for files under roughly 100 MB and allows up to 5 GiB, while Trailogue's intended normalized limit is far lower. Multipart uploads add resumability but are unnecessary for normal photos; revisit them only if video or original-quality large media enters scope.

## 7. Security, privacy, and recovery

### Authorization and credentials

- R2 bucket remains private; never enable public `r2.dev` access for the photo bucket.
- Railway uses a bucket-scoped **Object Read & Write** token, not an account-admin token.
- iOS receives only short-lived per-object URLs, never the Access Key or Secret Key.
- Every init, complete, list, read-signing, edit, and delete endpoint verifies `trip.user_id == session.user_id`.
- Object keys are random/server-generated and are never trusted from client input.

### Type, size, and integrity

- Allow-list `image/jpeg` and `image/png` for the normalized MVP. Add HEIC only if the product later chooses to retain originals.
- Sign `Content-Type`; the client must send the exact same header.
- Treat claimed client size only as an early rejection. The completion endpoint's R2 `HEAD` result is authoritative.
- A presigned `PUT` alone is not a substitute for server verification. If the proof-of-concept cannot reliably sign/enforce `Content-Length`, retain quota/rate limits and reject/delete oversize objects after `HEAD`. A Worker upload gateway is the fallback when a hard pre-transfer limit becomes mandatory.
- Consider a checksum header after a device-memory benchmark. Do not load full-resolution images into JavaScript memory merely to hash them.

### CORS

Native iOS networking is not protected by browser CORS, so CORS is not the authorization boundary. Still configure R2 CORS narrowly for Expo web or future web clients: explicit production/staging origins, `PUT/GET/HEAD`, only required headers such as `Content-Type` and checksum headers, and expose `ETag`. Never use `*` for production origins. Expired R2 signed URLs may return a 403 without readable CORS details; clients should classify 403/expiry as “request a new URL.”

### Privacy and retention

- R2 encrypts objects and metadata at rest automatically with AES-256 and uses TLS in transit.
- Choose the bucket jurisdiction before creation; Cloudflare states it cannot be changed later. A US jurisdiction aligns with the current overseas-US backend direction, but legal/privacy review must confirm the launch markets and cross-border disclosure.
- Update the privacy policy and App Store privacy disclosures for user photos, optional location, retention, deletion, subprocessors, and AI use before release.
- Deleting a Trip or account must enqueue deletion of every original and derivative. Database cascade alone cannot delete R2 objects.

### Failure recovery and orphan cleanup

- Pending rows older than the configured expiry are cleanup candidates.
- A scheduled Railway worker/cron task deletes expired pending objects and marks rows failed/expired; run a daily reconciliation for missing objects and unreferenced keys.
- R2's default lifecycle aborts incomplete multipart uploads after seven days, but it does **not** clean completed single-part orphan objects; Trailogue still needs database-aware cleanup.
- Keep upload retry bounded with exponential backoff and user control. Do not automatically retry 401, 403 signature mismatch, validation errors, or quota errors.
- App relaunch can restore pending upload UI from Neon using `clientUploadId`; if the local temporary file is gone, ask the user to reselect it.

## 8. Manual cloud and product configuration

Do these only after Wave 3B implementation is approved:

### Cloudflare

- Enable/purchase R2 for the account.
- Create one private **Standard** staging bucket and choose jurisdiction deliberately.
- Keep public development URLs disabled.
- Create a bucket-scoped Object Read & Write API token and record the one-time secret securely.
- Configure minimal CORS and expose only required headers.
- Confirm lifecycle settings for incomplete multipart uploads.
- Configure billing alerts/usage monitoring and document key rotation.

### Railway

- Add `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` as staging secrets.
- Add `R2_ENDPOINT` and `R2_BUCKET` for the private staging bucket.
- Optionally override `R2_UPLOAD_URL_TTL_SECONDS` (default 300), `R2_READ_URL_TTL_SECONDS` (default 600), and `PHOTO_MAX_BYTES` (default 15728640).
- The implemented MIME allow-list is `image/jpeg` and `image/png`; changing it requires code and contract changes rather than an environment-only override.
- Add the cleanup worker/cron only when the cleanup code exists and has dry-run verification.
- Confirm whether GitHub auto-deploy has path filters before pushing backend/schema work.

### Neon

- Review and apply the photo-state migration to staging only after backup/rollback checks.
- Do not edit existing Photo/Trip rows manually.

### Expo / Apple / product policy

- Install SDK-57-compatible ImagePicker, ImageManipulator, and FileSystem packages with `npx expo install`.
- Add the final iOS photo-library permission wording through app config.
- Update privacy policy, terms, deletion behavior, App Store privacy answers, and AI-photo consent copy.
- Produce a new EAS Preview build only when explicitly authorized.

## 9. Staged implementation plan

### 3B.0 — proof of concept and contracts

- Provision staging resources manually after approval.
- Verify Railway can presign R2 `PUT`, `HEAD`, and `GET` with a bucket-scoped token.
- Verify iPhone direct upload, exact `Content-Type`, progress, URL expiry, and failure codes.
- Freeze API/OpenAPI contracts, limits, and the migration rollback plan.

### 3B.1 — backend upload intent and verification

- Add the migration, repository ownership queries, R2 adapter, init/complete endpoints, idempotency, rate limits, and cleanup command.
- Test cross-user denial, mismatched key/type/size, expired URLs, duplicate complete, and orphan cleanup.

### 3B.2 — iOS selection and upload queue

- Add photo selection, normalization, progress, cancellation, bounded retry, and relaunch recovery.
- Test HEIC, JPEG, PNG, limited photo-library access, low storage, offline, backgrounding, and expired URLs on a real iPhone.

### 3B.3 — private display and deletion

- Add owner-scoped photo list/read URLs, detail gallery, thumbnails or client-side previews, cover photo behavior, deletion, and account/Trip cleanup.
- Verify no public bucket access and no cross-user reads.

### 3B.4 — hardening and acceptance

- Add reconciliation metrics, usage/cost alarms, secret rotation runbook, privacy review, abuse limits, and staging load tests.
- Run full lint/typecheck/tests, Expo Doctor, iOS export, backend build/integration tests, migration verification, and real-iPhone acceptance before any preview release.

## Decision summary

- **Selected:** private R2 Standard + Railway-signed direct `PUT` + server `HEAD` finalization + short-lived signed reads.
- **Not selected now:** public bucket, credentials in iOS, proxying image bytes through Railway, multipart upload for ordinary photos, or a new Cloudflare Worker.
- **Revisit triggers:** video support, originals above 100 MB, mandatory hard pre-transfer byte limits, edge transformation/scanning, or read traffic that justifies a dedicated delivery layer.
