## Handoff Checkpoint

**Updated**: 2026-10-27 +08:00
**Current objective**: Deliver the Wave 3B MVP private R2 photo upload and Trip-detail gallery as a local commit, then pause for manual cloud configuration/migration/deployment.
**Current stage**: Wave 3B MVP code, migration, tests, OpenAPI, and runbook complete and fully verified; local commit pending at this checkpoint.
**Completion**: Wave 3B MVP local implementation 100%; cloud provisioning/deployment/real-device acceptance 0%.
**Branch**: `feature/ios-app`
**Commit**: the local commit containing this checkpoint; resolve with `git log -1 --oneline`

### Completed

- Added authenticated, owner-scoped photo upload-intent/completion/list APIs, private R2 signer/HEAD adapter, server-generated keys, idempotency, validation, and signed reads.
- Added photo-state migration/repository and ready-only Trip counts without applying anything to Neon Staging.
- Added iOS 1-5 system selection, HEIC/JPEG/PNG normalization to compressed JPEG, native PUT progress, user retry with stable clientUploadId, automatic gallery/count refresh, and signed-image thumbnails.
- Updated Expo config, shared contracts/domain/config, checked-in OpenAPI, mobile contract, environment template, and Wave 3B plan/status.
- Added integration/regression coverage for 401, cross-user 404, type/size rejection, upload/completion idempotency, missing/mismatched object, Trip association, iOS retry/gallery, and all prior authentication/Trip behavior.
- Verification passed: root lint/typecheck, 73 automated tests, root build, Expo Doctor 21/21, iOS export, migration on ephemeral PGlite, OpenAPI parse, and secret scan.
- No Railway variable, Neon data/migration, Cloudflare resource, Apple configuration, or EAS build was changed.

### Key decisions

- Keep the R2 bucket private and credentials only in Railway; iOS receives per-object short-lived PUT/GET URLs.
- Normalize selected images sequentially to cap device memory use and remove original HEIC/EXIF from the uploaded derivative.
- Missing objects stay pending so a retry can re-PUT; metadata mismatch marks the intent failed.
- Do not push: the user explicitly requested a local commit only because a push can auto-deploy Railway.

### Recovery entry

- **First read**: `docs/28-wave-3b-photo-upload-plan.md`, `apps/api/src/modules/photos/photoService.ts`, `packages/database/drizzle/0002_photo_upload_mvp.sql`, `ios-app/src/features/photos/PhotoSection.tsx`, and this checkpoint.
- **Verification commands**: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`; then in `ios-app`, `npm run doctor` and `npm run build`.
- **Next gate**: manually create/configure private R2, set Railway variables, review/apply Neon migration, then explicitly authorize push/deploy and a new EAS Preview build.

### Blockers / external prerequisites

- Create a private R2 Standard staging bucket/token and set the seven documented Railway variables.
- Review/apply `0002_photo_upload_mvp.sql` to Neon Staging, deploy Railway, verify `/health` and `/ready`, then build a new iOS Preview binary because native Expo modules were added.
- GitHub push and EAS Build remain prohibited until the user explicitly starts those steps.
