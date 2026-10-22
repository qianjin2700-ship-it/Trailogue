## Handoff Checkpoint

**Updated**: 2026-10-21 +08:00
**Current objective**: Complete Trailogue Phase B.1 real-device staging integration without adding business features.
**Current stage**: Railway/Neon infrastructure verification complete; EAS preview signing and real-iPhone authentication/session verification remain.
**Completion**: Infrastructure gates complete; Phase C Ready remains NO.
**Branch**: `feature/ios-app`
**Baseline HEAD**: `bce2a51` before this documentation checkpoint commit

### Completed

- Registered `com.qianjin2700.trailogue` as the explicit Apple App ID and enabled Sign in with Apple as a primary App ID.
- Verified Expo resolves the same Bundle ID and the `com.apple.developer.applesignin = Default` entitlement.
- Deployed the existing Fastify API to the Railway `staging` environment at `https://trailogue-staging.up.railway.app`.
- Ran the empty Neon migration through Railway pre-deploy; verified the eight expected tables and did not run seed data.
- Verified public `/health` and PostgreSQL-backed `/ready` return 200 over HTTPS.
- Verified anonymous `/v1/users/me`, `/v1/trips`, and `/v1/trips/{id}` return generic 401 responses.
- Verified a deliberately invalid Apple identity token is rejected with `INVALID_APPLE_TOKEN`.
- Kept database credentials, session secrets, Apple tokens, and session tokens out of Git and documentation.
- Re-ran root lint, typecheck, all 40 tests, and backend build; exported the iOS bundle and passed Expo Doctor 21/21.
- Bound the `development`, `preview`, and `production` EAS build profiles to their matching EAS environments; no environment value or credential was committed.

### Not completed

- Configure the EAS preview environment with the public staging API base URL.
- Link the local Expo app to the intended EAS project; `app.json` does not yet contain a verified `extra.eas.projectId`.
- Produce and install a signed build on a real iPhone.
- Verify first-time and returning Apple login, correct audience, wrong-audience rejection, session persistence, restart restore, and 401 cleanup.
- Verify authenticated `/v1/users/me`, `/v1/trips`, `/v1/trips/{id}`, and Trip isolation between two identities.

### Key decisions

- Phase B.1 staging uses Railway plus an isolated Neon PostgreSQL database; Alibaba ECS and production resources remain out of scope.
- Railway explicitly sets non-secret `PORT=3000` because its generated public domain targets port 3000.
- The PostgreSQL TLS compatibility warning is accepted only for staging; production must make certificate-verification semantics explicit and re-test readiness.

### Recovery entry

- **First read**: `docs/26-phase-b1-staging-integration.md`, `docs/25-phase-b-authenticated-data.md`, `ios-app/README.md`, and this checkpoint.
- **Verification commands**: from the repository root run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
- **Staging smoke path**: verify `/health`, `/ready`, anonymous protected-route 401s, then continue only with a signed real-device build.

### Blockers / external prerequisites

- A physical iPhone and Apple/Expo signing flow are required for the remaining acceptance gates.
- EAS CLI installation hit a local Windows `EPERM` while creating its temporary dependency tree. Retry from a normal local terminal or use the Expo dashboard; do not invent `extra.eas.projectId`.
- `EXPO_PUBLIC_API_BASE_URL`, privacy URL, and terms URL remain unconfigured for the distributed iOS build.
- The current API issues one opaque session and does not yet exchange Apple authorization codes, refresh sessions, revoke Apple grants, or expose server sign-out; these remain outside Phase B.1 unless required by an acceptance failure.
