## Handoff Checkpoint

**Updated**: 2026-10-16 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Phase A local backend foundation implemented; Docker-host verification and Phase B remain pending
**Completion**: Fastify API, PostgreSQL schema/migration, repositories, worker, shared contracts and iOS Trip contract are implemented and pass non-Docker gates

### Completed

- Created `feature/ios-app` from `47524ed`.
- Initialized `ios-app/` with Expo SDK 57, Expo Router, TypeScript, Development Client, and EAS profiles.
- Added a minimal Trailogue startup screen and one UI test.
- Verified lint, typecheck, 1/1 test, iOS bundle export, and Expo Doctor 21/21.
- Commit: `ef28de5 feat(ios): initialize Expo app`.
- Added DTO contracts and domain mappers based on the existing `users` and `albums` fields.
- Added a unified HTTPS API client, standardized AppError mapping, and Trip repository.
- Added SecureStore-backed three-state authentication restoration and protected route groups.
- Added Apple credential acquisition with nonce/state; credentials are sent to the auth API and never treated as a local login.
- Added My Trips loading, empty, loaded, error, retry, pull-to-refresh, and basic detail screens.
- Added API, mapper, auth restoration, and four-state trip UI tests.
- Documented the proposed mobile gateway in `ios-app/docs/MOBILE_API_CONTRACT.md`.
- Superseded the Mini Program compatibility constraint: `miniprogram/`, `cloudfunctions/`, and CloudBase are now read-only legacy references only.
- Marked the Wave 2 `/v1/auth/apple`, `/v1/users/me`, and `/v1/albums` boundary as provisional rather than the approved production API.
- Added `ios-app/docs/BACKEND_REPLATFORMING_AUDIT.md` as the evidence checklist and decision gate for the new backend.
- Audited all 12 Cloud Function areas, 11 declared collections, storage paths, identity, AI, metadata, sharing, PDF, deletion, and payment placeholders.
- Confirmed repository configuration still targets `lvji-d6g41bt719c85fe54`, conflicting with the historical `yaomiao` migration document.
- Verified CloudBase CLI 3.8.0 is installed; live resource access is blocked by the absence of a valid login session.
- Added `docs/20-legacy-cloudbase-audit.md` with migration priorities and source/data integrity risks.
- Added `docs/21-ios-backend-selection.md`; conditionally recommends Supabase managed core plus a standard TypeScript API, durable queue, and independent Node worker, pending POC and approval.
- Closed the CloudBase audit and cancelled all legacy data migration work by product decision.
- Marked the Supabase recommendation as superseded.
- Added `docs/22-alibaba-cloud-us-architecture.md` as the active ADR for ECS API/worker, RDS PostgreSQL, private OSS, SLS/CloudMonitor, KMS and standard `/v1` HTTPS APIs.
- Preserved both Alibaba Cloud US regions as candidates; final Region must be selected by target-user latency, product inventory, compliance and cost evidence before purchase.

### Next

- Install/start Docker Desktop, run the checked-in migration and seed against `postgres:17-alpine`, then repeat the API readiness check.
- After explicit Phase B approval, implement real Apple verification, session middleware, current-user and Trip handlers.
- Benchmark `us-east-1` and `us-west-1`, obtain a budget, then separately approve the billable Alibaba Cloud POC.
- Run the ADR POC before expanding major iOS business screens.

### Recovery entry

- Read: `CODEX_HANDOFF.md`, `IOS_MIGRATION_ANALYSIS.md`, `.ai-memory/project_memory.md`, `ios-app/README.md`.
- Verify: from `ios-app/`, run `npm run lint`, `npm run typecheck`, `npm test -- --ci`, `npm run build`, and `npm run doctor`.

### Blockers

- Final Apple bundle identifier and Expo project/account are not yet provided; neither is required for the local JS bundle stage.
- A signed iOS build requires Apple credentials through EAS or macOS/Xcode.
- Alibaba Cloud account/project, final US Region, monthly budget, API domain and deployment credentials are not yet provided.
- No billable cloud resources have been created; provisioning requires explicit implementation approval and cost confirmation.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL are not configured.
- The `feature/ios-app` push is blocked in this environment because Git Credential Manager cannot start its helper process.
- Docker CLI/daemon is unavailable on this host; empty-database migration, seed and repository behavior were verified with embedded PostgreSQL (PGlite), but the Compose runtime was not executed.
