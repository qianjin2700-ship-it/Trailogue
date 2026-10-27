## Handoff Checkpoint

**Updated**: 2026-10-27 +08:00
**Current objective**: Deliver Wave 3A.1 list refresh/date fixes and prepare the Wave 3B private photo-upload design without starting upload implementation.
**Current stage**: Wave 3A.1 implemented and fully verified; Wave 3B design complete; GitHub push intentionally paused for Railway deployment-risk confirmation.
**Completion**: Wave 3A.1 100%; Wave 3B planning 100%; Wave 3B implementation 0%.
**Branch**: `feature/ios-app`
**Commit**: the local commit containing this checkpoint; resolve with `git log -1 --oneline`

### Completed

- Successful Trip creation invalidates My Trips while keeping navigation to the new detail screen.
- My Trips uses Expo Router focus handling but only fetches when its revision is stale; ordinary focus changes do not request again.
- Automatic/manual refresh failures preserve the previous list and show Retry; repository results are deduplicated by Trip id.
- Trip detail displays timezone-stable start/end dates and safely handles missing/same/cross-year values.
- Added regression coverage for empty/non-empty refresh, creation invalidation, failed refresh retry, duplicate ids, mapping, formatting, detail rendering, auth restore, and protected-route 401 sign-out.
- Added `docs/28-wave-3b-photo-upload-plan.md` covering private R2, presigned PUT/GET, Railway authorization, Neon metadata, iOS normalization/progress, cleanup, security, costs, manual configuration, and phased delivery.
- Verification passed: root lint, root typecheck, all 64 tests, root backend/worker build, Expo Doctor 21/21, and iOS export.
- No Railway variable, Neon data/migration, Cloudflare resource, Apple configuration, or EAS build was changed.

### Key decisions

- Use a process-local invalidation revision plus `useFocusEffect` for the current Trip-list scale; manual pull-to-refresh remains the remote-change fallback.
- Parse `YYYY-MM-DD` as calendar components rather than local `Date` values.
- Plan Wave 3B around a private R2 Standard bucket with Railway-generated short-lived URLs and server-side `HEAD` finalization.
- Do not push automatically: Railway follows GitHub branch `feature/ios-app`, and no path-filter configuration is present in the repository. Even an iOS/docs-only push may trigger staging deployment.

### Recovery entry

- **First read**: `docs/28-wave-3b-photo-upload-plan.md`, `ios-app/src/app/(app)/trips/index.tsx`, `ios-app/src/features/trips/formatTripDateRange.ts`, and this checkpoint.
- **Verification commands**: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; then in `ios-app`, `npm run doctor` and `npm run build`.
- **Push gate**: confirm Railway dashboard watch paths or explicitly approve a possible staging redeploy, then run `git push origin feature/ios-app`.

### Blockers / external prerequisites

- GitHub push is waiting on the Railway deployment-risk decision.
- Wave 3B implementation requires manual creation of the private R2 staging bucket/token and approved Railway variables, Neon migration, photo permission wording, and a later authorized EAS Preview build.
