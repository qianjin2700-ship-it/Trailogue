## Handoff Checkpoint

**Updated**: 2026-10-16 +08:00
**Current objective**: Deliver Trailogue as an iOS-first product on a maintainable long-term backend.
**Current stage**: Architecture discovery — Wave 2 client foundation complete; backend re-platforming decision pending
**Completion**: Wave 2 client foundation preserved; further product slices are paused at the backend decision gate

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

### Next

- Audit legacy CloudBase collections, storage, functions, configuration, and export paths without changing production data.
- Establish whether the expired Tencent resources are still accessible and which data can be exported or recovered.
- Compare Supabase, Firebase, and independent Node.js + PostgreSQL against the audited workload and record the choice in an ADR.
- Define the canonical User / Trip / Photo / Story / Book model, standard HTTPS API, Apple identity lifecycle, storage, and legacy album migration mapping.
- Resume create-trip and photo-upload work only after the backend ADR and core contracts are approved.

### Recovery entry

- Read: `CODEX_HANDOFF.md`, `IOS_MIGRATION_ANALYSIS.md`, `.ai-memory/project_memory.md`, `ios-app/README.md`.
- Verify: from `ios-app/`, run `npm run lint`, `npm run typecheck`, `npm test -- --ci`, `npm run build`, and `npm run doctor`.

### Blockers

- Final Apple bundle identifier and Expo project/account are not yet provided; neither is required for the local JS bundle stage.
- A signed iOS build requires Apple credentials through EAS or macOS/Xcode.
- Actual access to the expired Tencent CloudBase environment and its exportable data is not yet verified.
- The long-term backend, public API, identity/session strategy, and canonical data model are not yet selected.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL are not configured.
- The `feature/ios-app` push is blocked in this environment because Git Credential Manager cannot start its helper process.
