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

**Choice**: Treat the iOS app as Trailogue's only primary client. Treat `miniprogram/`, `cloudfunctions/`, and CloudBase as read-only business references and possible migration sources, not compatibility targets.

**Consequences**:

- New code does not preserve `wx.cloud.callFunction`, WeChat OPENID, WeChat login, WeChat Pay, WeChat sharing/location/file APIs, or Cloud Function compatibility.
- CloudBase is not the assumed long-term backend. Supabase, Firebase, and independent Node.js + PostgreSQL must be compared after the legacy resource audit.
- New public services use a standard HTTPS API and a provider-neutral Trailogue user identity linked to Apple Sign in.
- User, Trip, Photo, Story, and Book become the canonical product entities. Legacy `albums` data is an import source only if it remains recoverable.
- The existing Wave 2 client layers remain useful, but their DTOs, route names, and repositories are provisional until the backend and canonical schema are approved.
- Do not expand major iOS business screens before the backend ADR, core schema, and API boundary are approved.

**Supersedes**: The Mini Program preservation constraint in the iOS foundation decision, the production-Cloud-Functions assumption in the Wave 2 API decision, and the rule that Trip must remain backed by the legacy Album schema.

**Reversal condition**: Only an explicit product decision to reactivate a legacy client can reintroduce compatibility work; it must not happen implicitly during migration.

## Glossary Update: Trip

**Canonical name**: Trip
**Legacy source alias**: Album
**Definition**: The primary travel aggregate in the new iOS product model.
**Migration rule**: Map recoverable legacy `albums` documents into Trips through an explicit, versioned import process; do not perpetuate legacy field names or identifiers in the canonical schema solely for compatibility.
