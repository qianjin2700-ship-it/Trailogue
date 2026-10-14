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
