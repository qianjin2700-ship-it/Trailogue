## Handoff Checkpoint

**Updated**: 2026-10-16 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Architecture selection — legacy source audit complete; live CloudBase audit and backend POC pending
**Completion**: Static backend audit and conditional recommendation complete; product implementation remains paused

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
- Superseded the Mini Program compatibility constraint: `miniprogram/`, `cloudfunctions/`, and CloudBase are now legacy reference and migration sources only.
- Marked the Wave 2 `/v1/auth/apple`, `/v1/users/me`, and `/v1/albums` boundary as provisional rather than the approved production API.
- Added `ios-app/docs/BACKEND_REPLATFORMING_AUDIT.md` as the evidence checklist and decision gate for the new backend.
- Audited all 12 Cloud Function areas, 11 declared collections, storage paths, identity, AI, metadata, sharing, PDF, deletion, and payment placeholders.
- Confirmed repository configuration still targets `lvji-d6g41bt719c85fe54`, conflicting with the historical `yaomiao` migration document.
- Verified CloudBase CLI 3.8.0 is installed; live resource access is blocked by the absence of a valid login session.
- Added `docs/20-legacy-cloudbase-audit.md` with migration priorities and source/data integrity risks.
- Added `docs/21-ios-backend-selection.md`; conditionally recommends Supabase managed core plus a standard TypeScript API, durable queue, and independent Node worker, pending POC and approval.

### Next

- Have the Tencent account owner run `cloudbase login`, then perform the documented read-only audit against both candidate environment IDs.
- Confirm or reject the conditional Supabase recommendation.
- If confirmed, run the seven-item backend POC before recording the formal ADR or expanding iOS screens.
- After the POC, specify SQL migrations, OpenAPI contracts, RLS policies, storage keys, worker deployment, and legacy import tooling.

### Recovery entry

- Read: `CODEX_HANDOFF.md`, `IOS_MIGRATION_ANALYSIS.md`, `.ai-memory/project_memory.md`, `ios-app/README.md`.
- Verify: from `ios-app/`, run `npm run lint`, `npm run typecheck`, `npm test -- --ci`, `npm run build`, and `npm run doctor`.

### Blockers

- Final Apple bundle identifier and Expo project/account are not yet provided; neither is required for the local JS bundle stage.
- A signed iOS build requires Apple credentials through EAS or macOS/Xcode.
- Actual access to the expired Tencent CloudBase environment and its exportable data is not yet verified.
- CloudBase CLI has no valid identity session; online read-only inspection requires the Tencent account owner to log in.
- The Supabase-based architecture is a recommendation, not an approved ADR, until its POC passes and the user confirms it.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL are not configured.
- The `feature/ios-app` push is blocked in this environment because Git Credential Manager cannot start its helper process.
