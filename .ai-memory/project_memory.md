# Trailogue Project Memory

## Decision Record: iOS client foundation

**Date**: 2026-10-14
**Problem**: Build an App Store-capable overseas iOS client while retaining the existing Mini Program and maximizing TypeScript reuse.

### Options

| Option | Benefit | Cost | Complexity |
| --- | --- | --- | --- |
| React Native + Expo | Highest practical TypeScript reuse, CNG/EAS path, one mobile codebase | Native SDK constraints must be checked | Medium |
| React Native CLI | Full native control | More native project maintenance | High |
| SwiftUI | Best native fit | Existing TypeScript UI/client code cannot be reused directly | High |
| Flutter | Cross-platform | Adds Dart and yields little reuse from this repository | High |

### Decision

**Choice**: React Native with Expo SDK 57, Expo Router, Development Builds, CNG, and EAS.
**Reason**: This preserves the TypeScript direction and minimizes native project maintenance while retaining a supported route to custom native modules and App Store delivery.
**Trade-offs**: SDK-compatible dependency versions and config plugins must be used; local native iOS builds still require macOS/Xcode.

### Scope

- Existing `miniprogram/` and `cloudfunctions/` remain unchanged.
- New mobile code lives in `ios-app/`.
- Shared contracts/domain code will be extracted only when the first API slice requires it.

### Reversal condition

Reconsider React Native CLI only if a required production SDK cannot work through Expo CNG/config plugins. Reconsider SwiftUI only if native-only requirements outweigh TypeScript reuse and maintenance cost.

## Project Convention: iOS quality gate

**Type**: Tooling and delivery
**Scope**: `ios-app/`

Every iOS feature commit must run lint, typecheck, tests, an iOS bundle export, and Expo Doctor. Native `.ipa` verification is separate and requires EAS credentials or macOS/Xcode.

## Known Issue: upstream npm advisories

**Discovered**: 2026-10-14
**Type**: Dependency risk
**Severity**: Warning
**Status**: Mitigated, pending upstream compatible releases

The Expo SDK 57 / React Native 0.86 toolchain currently reports transitive npm advisories. `npm audit fix` applied compatible updates; remaining fixes require breaking Expo Router, Expo, or Jest version changes. Do not use `npm audit fix --force`; review again when Expo publishes compatible releases.

## Decision Record: Mobile API boundary

**Date**: 2026-10-16
**Problem**: The iOS app cannot call production APIs because the existing Cloud Functions derive identity from WeChat OPENID and have no HTTPS bearer session.

### Decision

**Choice**: Keep production Cloud Functions unchanged in Wave 2. Add an iOS-side contract for `/v1/auth/apple`, `/v1/users/me`, and `/v1/albums`, with one API client and repository boundary.
**Reason**: This makes client work testable without pretending that Apple authentication or mobile data access already exists.
**Trade-offs**: The authenticated runtime flow remains blocked until a backend gateway verifies Apple credentials, issues sessions, and enforces ownership.
**Reversal condition**: Replace the proposed routes if the approved backend uses a different public gateway, while keeping Domain and UI layers unchanged.

## Glossary Entry: Trip

**Canonical name**: Trip (iOS/domain) / Album (legacy storage and API DTO)
**Aliases**: Journey, travel album
**Definition**: The iOS product concept backed by the existing CloudBase `albums` document.
**Scope**: iOS UI and domain use Trip; transport contracts retain album field and route names.
**Do not use**: A second persistent Trip schema.
**Source**: Existing `miniprogram/types/index.ts` and `cloudfunctions/album/index.ts`.

## Known Issue: mobile backend authentication gap

**Discovered**: 2026-10-16
**Type**: Integration risk
**Severity**: Blocking for production login/data
**Status**: Client boundary complete; backend work pending approval

The production auth function only accepts WeChat context and returns no bearer session. Apple identity tokens must be verified server-side before the iOS app can become authenticated. See `ios-app/docs/MOBILE_API_CONTRACT.md`.

## Decision Record: iOS-only product and backend re-platforming

**Date**: 2026-10-16
**Problem**: The Tencent Cloud service has expired and the WeChat Mini Program is no longer an operating product. Preserving its runtime constraints would distort the long-term iOS architecture.

### Decision

**Choice**: Treat the iOS app as Trailogue's only primary client. Treat `miniprogram/`, `cloudfunctions/`, and CloudBase as read-only business references, not compatibility targets.

**Consequences**:

- New code does not preserve `wx.cloud.callFunction`, WeChat OPENID, WeChat login, WeChat Pay, WeChat sharing/location/file APIs, or Cloud Function compatibility.
- CloudBase is not the long-term backend. The initial Supabase/Firebase/Node.js comparison was completed and later superseded by the Alibaba Cloud US decision below.
- New public services use a standard HTTPS API and a provider-neutral Trailogue user identity linked to Apple Sign in.
- User, Trip, Photo, Story, and Book become the canonical product entities. Legacy `albums` data will not be imported.
- The existing Wave 2 client layers remain useful, but their DTOs, route names, and repositories are provisional until the backend and canonical schema are approved.
- Do not expand major iOS business screens before the backend ADR, core schema, and API boundary are approved.

**Supersedes**: The Mini Program preservation constraint in the iOS foundation decision, the production-Cloud-Functions assumption in the Wave 2 API decision, and the rule that Trip must remain backed by the legacy Album schema.

**Reversal condition**: Only an explicit product decision to reactivate a legacy client can reintroduce compatibility work; it must not happen implicitly during migration.

## Glossary Update: Trip

**Canonical name**: Trip
**Legacy source alias**: Album
**Definition**: The primary travel aggregate in the new iOS product model.
**Migration rule**: No legacy records will be imported. Use the old `albums` shape only to recover product rules; do not perpetuate legacy field names or identifiers in the canonical schema.

## Audit Finding: legacy CloudBase state

**Date**: 2026-10-16
**Evidence**: Static source audit plus a read-only CloudBase CLI connectivity attempt.

- The repository points to `lvji-d6g41bt719c85fe54`; the historical migration document references `yaomiao-d3g3u7ckz71fffd26`. Live verification is no longer required because legacy data migration was cancelled.
- Source declares 11 collections and 12 Cloud Function directories. `photo_groups`, fact-base persistence, independent vision processing, and payment are not implemented as documented.
- CloudBase CLI 3.8.0 was installed without a valid login session at audit time. This no longer blocks the iOS program.
- See `docs/20-legacy-cloudbase-audit.md` for evidence, migration priority, and data-integrity risks.

## Superseded Architecture Recommendation: Supabase managed core

**Date**: 2026-10-16
**Status**: Superseded by the Alibaba Cloud US decision on 2026-10-16

Supabase Auth/PostgreSQL/Storage was conditionally recommended, but the product owner subsequently chose Alibaba Cloud US. No Supabase POC is required unless the Alibaba decision reaches a documented reversal condition.

## Decision Record: Alibaba Cloud US backend

**Date**: 2026-10-16
**Problem**: Select a maintainable production backend for the overseas iOS app after retiring Tencent Cloud and deciding not to migrate legacy data.

### Options

| Option | Benefit | Cost | Complexity |
| --- | --- | --- | --- |
| Supabase managed core | Fast Auth/Postgres/Storage MVP | Adds a second cloud and platform-specific Auth/Storage | Medium |
| Firebase | Mature mobile ecosystem | Firestore model and Google platform lock-in | Medium |
| All services on one ECS | Lowest initial service count | Database, backup, storage and recovery burden | High risk |
| Alibaba Cloud ECS + RDS PostgreSQL + OSS | Standard protocols, managed durability, one-cloud operations | Team owns API/auth/worker and ECS patching | Medium |

### Decision

**Choice**: Use Alibaba Cloud in one US region. Run a standard TypeScript API and an independent worker on ECS, store relational data in ApsaraDB RDS for PostgreSQL, store private media/PDF objects in OSS, use a durable PostgreSQL job queue, and use SLS/CloudMonitor plus KMS/Secrets Manager for operations and secrets.

**Reason**: The user explicitly selected Alibaba Cloud US. This combination preserves standard HTTPS/PostgreSQL boundaries and keeps the durable state in managed services without adding Supabase or Firebase as a second cloud.

**Trade-offs**: Trailogue must implement Apple token verification, session rotation, authorization, deletion, deployment, patching and worker recovery. Exact US region and billable specifications remain gated by latency, inventory, compliance and cost validation.

### Impact

- `docs/22-alibaba-cloud-us-architecture.md` is the active backend ADR.
- `docs/21-ios-backend-selection.md` is historical and Supabase POC work is cancelled.
- CloudBase login/export and all legacy data migration work are cancelled.
- The Wave 2 `/v1/albums` contract is provisional and must become the canonical `/v1/trips` API.
- Major iOS page expansion stays paused until the backend POC, canonical schema, Apple auth and initial OpenAPI contract pass.

### Reversal condition

Re-evaluate only if Alibaba Cloud US fails required service availability, network quality, SLA, data-residency/compliance, or sustained cost gates, or if the product owner explicitly changes the cloud constraint.

## Project Convention: backend cloud boundary

**Type**: Architecture constraint
**Scope**: All new backend, infrastructure, shared contract and iOS integration code

### Convention

New business operations use the versioned HTTPS API and internal UUID ownership. Cloud SDKs stay inside infrastructure adapters; the iOS Domain/UI and shared contracts must not import Alibaba Cloud SDKs. Legacy CloudBase and WeChat code is read-only reference material and receives no compatibility work.

### Examples

**Correct**: iOS requests an upload intent from `/v1/trips/{tripId}/photos/upload-intents`, then uploads with a short-lived OSS signature.

**Incorrect**: iOS stores an OSS AccessKey, calls CloudBase directly, or keeps `/v1/albums` only to match the Mini Program.

### Source

User architecture decision and `docs/22-alibaba-cloud-us-architecture.md`.

## Decision Record: Phase A local backend foundation

**Date**: 2026-10-17
**Choice**: Fastify 5 + Drizzle + PostgreSQL 17, with an independent polling worker and pure TypeScript contracts shared with iOS.

**Implementation**:

- Active server code lives in `apps/api` and `apps/worker`.
- Canonical code lives in `packages/contracts`, `packages/domain`, `packages/database`, and `packages/config`.
- PostgreSQL migrations define User, Identity, Session, Trip, Photo, Story, Book, and Job with foreign keys, deletion rules, unique constraints, and indexes.
- Persistent job claims use `FOR UPDATE SKIP LOCKED` and bounded retry state.
- The iOS client now uses `/v1/trips` and camelCase canonical DTOs; Album/OPENID transport fields are removed from the active path.
- PGlite is a test-only PostgreSQL runtime for empty-database migration and repository verification; Docker Compose PostgreSQL 17 remains the standard local developer runtime.
- On Windows hosts that forbid symlinks, npm internal `file:` packages are installed with `--install-links`.

**Phase boundary**: Apple JWKS/JWT verification, functional auth/user/trip handlers, OSS, AI, maps, PDF, billing, and cloud provisioning remain out of scope until Phase B is explicitly approved.

## Verification Record: Phase A.1 on PostgreSQL 17

**Date**: 2026-10-17
**Result**: Phase A passed against an empty native PostgreSQL 17.11 database. Migration, repeat development seed, production seed guard, constraints/indexes, Identity uniqueness, hashed Session behavior, Trip owner isolation, concurrent Job claim safety, API health/readiness degradation, and worker polling were verified.

**Corrections**: The database migration directory is relative to `packages/database/src/scripts`, and package export paths must match each package's actual TypeScript `rootDir`/`outDir` output. Domain and Contracts emit `dist/index`; Config and Database emit `dist/src/index`.

**Environment note**: Docker was unavailable, so official native PostgreSQL binaries provided the real PostgreSQL runtime. This validates database behavior but not the Docker Compose wrapper.

## Decision Record: Trailogue Apple application identifier

**Date**: 2026-10-19
**Problem**: Align the Apple Developer App ID, Expo iOS application identifier, and backend Apple identity-token audience before staging integration.

### Decision

**Choice**: Use the explicit Bundle ID `com.qianjin2700.trailogue` for the Trailogue iOS app and use the same value for backend `APPLE_BUNDLE_ID`.

**Reason**: The identifier is registered in Apple Developer and gives the native app and backend verifier one stable audience value.

**Trade-offs**: Changing the Bundle ID later would create a distinct Apple application identity and require new signing/provisioning configuration.

### Impact

- `ios-app/app.json` owns the Expo `ios.bundleIdentifier` value.
- Staging and later production inject the same value as `APPLE_BUNDLE_ID`; the Apple Team ID is not the JWT audience.
- Sign in with Apple remains a required capability and entitlement.

### Reversal condition

Change the identifier only if Apple registration is invalidated before any distributed build; otherwise treat it as permanent.

## Decision Record: Phase B.1 managed staging topology

**Date**: 2026-10-20
**Scope**: Phase B.1 staging only

### Decision

Use Railway for the existing Fastify API and an isolated, empty Neon PostgreSQL project for Phase B.1. Do not use the purchased Alibaba Cloud ECS, deploy the Worker, attach object storage, or create production resources in this phase.

### Deployment convention

- Railway builds the repository-root API Dockerfile so shared TypeScript packages remain available without installing the iOS app or Worker.
- Railway's pre-deploy command is `npm run db:migrate`; staging never runs `npm run db:seed`.
- Railway readiness uses `/ready` so PostgreSQL connectivity is part of the deployment gate.
- The real Neon connection string and session secret exist only in Railway staging variables.
- `NODE_ENV=staging` is an accepted runtime value and uses info-level API logging.

### Reversal condition

This does not select the final production host. Revisit production hosting only after Phase B.1 real-device verification and a separate production decision.

## Deployment Record: Phase B.1 managed staging activated

**Date**: 2026-10-21
**Scope**: Phase B.1 staging only

### Verified state

- Railway serves the API at `https://trailogue-staging.up.railway.app`; `/health` and the PostgreSQL-backed `/ready` both return 200.
- Railway deployment `11d2ec60-1a2f-445e-b96b-8c12f4a17518` is active from commit `bce2a51`.
- The empty Neon migration created the eight expected tables; no staging seed was run.
- Anonymous protected-route calls return generic 401 responses, and a deliberately invalid Apple identity token returns `INVALID_APPLE_TOKEN` without leaking credentials.
- The Railway service explicitly sets non-secret `PORT=3000` to align the runtime listener with the generated public-domain target port.

### Known issue

The current PostgreSQL driver warns that a future major version may change the semantics of `sslmode=require`. TLS is working now, but production configuration must explicitly select full certificate verification or the provider-recommended libpq compatibility mode and repeat readiness tests.

### Remaining gate

This deployment does not complete Phase B.1. A signed real-iPhone build must still verify first and returning Apple login, correct/wrong audience, authenticated user/Trip reads, session persistence and restart restore, 401 cleanup, and cross-user Trip isolation.

## Deployment Record: EAS project linkage

**Date**: 2026-10-22
**Scope**: Phase B.1 iOS staging

- Expo owner is the team account `hardworkgirls-team`.
- The linked EAS project is `@hardworkgirls-team/trailogue` with ID `aef33182-1a9a-4807-83a0-e5b2d2096654`.
- `ios-app/app.json` stores the owner and EAS-issued project ID; neither value is a secret.
- The app continues to use Bundle ID `com.qianjin2700.trailogue` with Sign in with Apple enabled.
- The preview API URL and signed real-device build remain pending; linking the EAS project alone does not make Phase C ready.

## Decision Record: Trip list mutation invalidation

**Date**: 2026-10-27
**Problem**: Expo Router keeps the My Trips screen mounted while create and detail routes are pushed, so a mount-only effect does not reload after Trip creation.

### Decision

Use a process-local Trip-list revision marker. Successful Trip mutations increment the revision, and My Trips compares it inside Expo Router `useFocusEffect`. Initial focus and a changed revision load data; ordinary focus changes do not. Automatic refresh failures preserve the last successful list and expose Retry.

**Trade-offs**: Remote changes from another device are not pushed into the process-local marker and continue to rely on manual pull-to-refresh.

### Reversal condition

Replace this marker with shared query-cache invalidation when multiple Trip mutation screens, background synchronization, or optimistic updates make process-local revision tracking insufficient.

## Decision Record: Wave 3B private photo storage

**Date**: 2026-10-27
**Problem**: Store owner-scoped iPhone photos at low cost without exposing object-storage credentials or making the bucket public.

### Decision

Plan Wave 3B around a private Cloudflare R2 Standard bucket. Railway authenticates and authorizes upload intents, generates short-lived object-specific presigned PUT/GET URLs, verifies completed uploads with R2 HEAD, and stores only verified metadata/state in Neon. The iOS client uploads directly and never receives R2 access keys.

**Trade-offs**: Completed single-part orphan objects require database-aware scheduled cleanup; R2 lifecycle rules alone only cover incomplete multipart uploads. Cloudflare bucket jurisdiction must be selected before creation and cannot later be changed.

### Reversal condition

Reconsider the storage/gateway design if video or >100 MB originals enter scope, strict pre-transfer byte enforcement is mandatory, edge transformation/scanning is required, or legal review rejects the selected R2 jurisdiction.

## Known Issue: Railway connected-branch deploy scope is unverified

**Discovered**: 2026-10-27
**Type**: deployment risk
**Severity**: major

The Railway staging service follows GitHub branch `feature/ios-app`, and the repository contains no Railway path-filter configuration. Although `.dockerignore` excludes `ios-app` and `docs` from the API image, pushing an iOS/docs-only commit may still start a Railway build/deployment webhook. Do not push without confirming dashboard watch paths or obtaining explicit approval for a possible staging redeploy.

## Implementation Record: Wave 3B photo-upload MVP

**Date**: 2026-10-27

- API endpoints are `/v1/trips/{tripId}/photos/uploads`, `/v1/trips/{tripId}/photos/{photoId}/complete`, and `/v1/trips/{tripId}/photos`.
- The client-generated `clientUploadId` must match `Idempotency-Key`; uniqueness is `(user_id, client_upload_id)`. A retry keeps the existing Photo/storage key and refreshes upload expiry.
- Storage keys are generated only on Railway as `users/{userId}/trips/{tripId}/photos/{photoId}/original.{jpg|png}`.
- The production adapter uses the AWS SDK v3 against private Cloudflare R2. Upload and read URL defaults are 300 and 600 seconds. Normalized uploads allow JPEG/PNG up to 15 MiB.
- Completion is ready-only after R2 `HEAD` matches expected bytes and content type; missing objects remain pending for retry, while mismatches become failed.
- iOS normalizes every selected image, including HEIC, to JPEG with longest edge 4096 and quality 0.82, uploads with native progress, retains the prepared file/id for user retry, and reloads owner-scoped signed gallery URLs after completion.
- Migration `0002_photo_upload_mvp.sql` has only been applied to ephemeral PGlite. R2 creation, Railway variables/deploy, Neon staging migration, push, and EAS build require later explicit/manual action.
- Automated orphan cleanup, delete, thumbnails, quotas/rate limits, background restoration, and multipart uploads remain post-MVP work.

## Build Fix Record: Railway API lockfile completeness

**Date**: 2026-10-27

- Railway deployment `381a5ba1` stopped after the database build banner because the following silent `apps/api npm ci` lock validation failed; the database TypeScript build itself was not the root cause.
- `apps/api/package-lock.json` omitted transitive runtime packages supplied by local `file:` dependencies, including `zod`, `drizzle-orm`, `pg`, and their PostgreSQL dependencies.
- Regenerate and validate the API lockfile with Railway's Node 22.22.1 / npm 10.9.4 and `--install-links` whenever local package dependency metadata changes.
- A clean source export must pass the Dockerfile sequence (`npm ci`, `npm run install:api`, API build) before a Railway-triggering push.
