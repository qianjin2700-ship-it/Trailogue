# Trailogue iOS

The overseas iOS client for Trailogue. It is built with React Native, Expo SDK 57,
TypeScript, Expo Router, and Continuous Native Generation.

This directory is additive: the existing WeChat Mini Program and CloudBase functions
remain in their original locations.

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

Product app icons and store artwork are intentionally deferred until branding is
approved; generated Expo starter artwork is ignored.
