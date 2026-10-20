# Trailogue iOS

The primary client for Trailogue. It is built with React Native, Expo SDK 57,
TypeScript, Expo Router, and Continuous Native Generation.

The WeChat Mini Program is retired. Its code and the existing CloudBase functions
remain in their original locations only as references for business rules and UI;
new iOS work does not preserve their runtime APIs or migrate their data.

## Requirements

- Node.js 22.13 or newer
- npm 11 or newer
- A macOS/Xcode environment for a local native iOS build, or an Expo account for EAS Build

## Commands

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run doctor
```

`npm run build` produces an iOS JavaScript bundle in `dist/`. It does not create a
signed `.ipa`. Use the `development`, `preview`, and `production` profiles in
`eas.json` when Apple credentials, the final bundle identifier, and Expo project
metadata are available.

## Configuration

Copy `.env.example` to `.env.local` and set only public client configuration there.
Any value prefixed with `EXPO_PUBLIC_` is embedded in the app and must never contain
API keys or other secrets.

Wave 2 uses these public values:

- `EXPO_PUBLIC_API_BASE_URL`: mobile HTTPS gateway base URL.
- `EXPO_PUBLIC_PRIVACY_URL`: published privacy policy.
- `EXPO_PUBLIC_TERMS_URL`: published terms of service.

Phase B.1 staging uses the standard TypeScript HTTPS API on Railway with an empty,
isolated Neon PostgreSQL database. Worker and object storage deployment remain
deferred, and the production hosting decision is separate. The current
[`docs/MOBILE_API_CONTRACT.md`](docs/MOBILE_API_CONTRACT.md) is Wave 2 scaffolding,
not an approved production contract. Production screens never fall back to fixture
data.

## Wave 2 client foundation

- `src/contracts`: provisional DTOs based on the legacy `users` and `albums` documents.
- `src/domain`: UI-safe User and Trip models plus DTO mappers.
- `src/api`: one JSON/Bearer/timeout/error client and resource APIs.
- `src/repositories`: domain mapping boundary used by screens.
- `src/auth`: three-state session restoration and global protected routing.
- `src/services`: SecureStore and Apple credential adapters.

Product app icons and store artwork are intentionally deferred until branding is
approved; generated Expo starter artwork is ignored.

Further business-screen expansion is paused until the Alibaba Cloud POC, canonical
schema, Apple authentication, storage flow, and versioned HTTPS contract pass their
decision gates. The closed audit checklist is in
[`docs/BACKEND_REPLATFORMING_AUDIT.md`](docs/BACKEND_REPLATFORMING_AUDIT.md).
The supporting repository-level reports are
[`../docs/20-legacy-cloudbase-audit.md`](../docs/20-legacy-cloudbase-audit.md) and
[`../docs/21-ios-backend-selection.md`](../docs/21-ios-backend-selection.md). The
active ADR is
[`../docs/22-alibaba-cloud-us-architecture.md`](../docs/22-alibaba-cloud-us-architecture.md).
