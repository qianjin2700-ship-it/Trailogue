## Handoff Checkpoint

**Updated**: 2026-10-17 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Phase A.1 complete on real PostgreSQL 17; Phase B awaits explicit approval
**Completion**: Fastify API, PostgreSQL schema/migration/seed, repositories, worker, shared contracts and iOS Trip contract pass real PostgreSQL 17 and repository quality gates

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
- Verified the empty-database migration, development seed, constraints, indexes, identity/session/Trip repository behavior, concurrent Job claiming, API health/readiness degradation, and worker polling against PostgreSQL 17.11.
- Corrected the migration folder resolution and the emitted-file exports for the shared Domain and Contracts packages.
- Recorded the evidence and Phase A.1 boundary in `docs/24-phase-a1-postgresql-verification.md`.

### Next

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
- Docker CLI/daemon is unavailable on this host. This is no longer a Phase A.1 verification blocker because the same migration, API and worker were exercised against a real PostgreSQL 17.11 server; the Compose wrapper itself remains untested here.
