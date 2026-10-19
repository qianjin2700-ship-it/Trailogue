# Phase B.1 Staging Integration

## Scope

Phase B.1 deploys the existing authenticated read path to a staging-only environment and verifies the real-device flow from Sign in with Apple through the HTTPS API to PostgreSQL. It does not add Trip creation, media upload, AI, PDF, payment, subscriptions, or other product features.

## Verified baseline

| Gate | Status | Evidence |
| --- | --- | --- |
| Git branch | Pass | Local and GitHub `feature/ios-app` both resolved to `f2430d5e40c7f57dc30fcb475b2446c5c0fcaad6` before Phase B.1 configuration work. |
| Apple App ID | Pass | An explicit App ID was registered for `com.qianjin2700.trailogue`. |
| Apple capability | Pass | The App ID has **Sign in with Apple** enabled as a primary App ID. |
| Expo bundle identifier | Pass | `ios.bundleIdentifier` resolves to `com.qianjin2700.trailogue`. |
| Backend Apple audience template | Pass | `.env.example` uses `APPLE_BUNDLE_ID=com.qianjin2700.trailogue`; real staging configuration must be injected outside Git. |
| Expo Apple auth package | Pass | `expo-apple-authentication` is installed and configured as an Expo plugin. |
| Expo Apple entitlement | Pass | Expo config introspection resolves `com.apple.developer.applesignin` to `Default`. |
| Staging SSH reachability | Pass | The provided staging host accepts TCP connections on port 22 and advertises Ubuntu OpenSSH. No login was attempted. |

## Apple integration still to verify

- Confirm that the Expo account can create or access the EAS project for this bundle identifier.
- Generate a development build with the matching provisioning profile and install it on a real iPhone.
- Do not create a Services ID or Sign in with Apple private key for the current native-token verification path.

## Proposed staging topology

Until the purchased server specification and any managed database purchase are confirmed, the minimum staging topology is:

```text
Real iPhone
  -> HTTPS :443
  -> reverse proxy / TLS termination
  -> Trailogue API
  -> private PostgreSQL
```

For a single-host staging deployment, PostgreSQL must not expose its port publicly. Only SSH and HTTPS may be reachable from the internet, with SSH restricted at the cloud firewall where practical. Production architecture remains a separate decision and is not created in Phase B.1.

## Secret handling

- Never commit Apple identity tokens, Trailogue session tokens, database credentials, private keys, or staging environment files.
- Keep the real `DATABASE_URL` and `SESSION_SECRET` in the staging host secret store or a root-readable environment file outside the checkout.
- Set `APPLE_BUNDLE_ID` to `com.qianjin2700.trailogue` in the staging runtime.
- Redact authorization headers and credential-bearing connection strings from logs and handoff documents.

## Pending deployment gates

- Identify the Alibaba Cloud product type, US region, CPU, memory, disk, operating system, and SSH username.
- Confirm whether ApsaraDB RDS for PostgreSQL exists; otherwise approve single-host PostgreSQL for staging.
- Select a user-controlled domain and staging API hostname for HTTPS.
- Audit the server before installing or changing software.
- Deploy API and PostgreSQL, inject secrets, and execute the empty-database migration without production seed data.
- Verify `/health`, `/ready`, Apple authentication, authenticated user access, Trip list/detail ownership, session persistence, restart restore, and 401 cleanup.
- Verify first-time and returning Sign in with Apple behavior on a real iPhone.

## Current result

Phase C Ready: **NO**. The App ID and capability configuration are complete, but EAS signing, staging deployment, HTTPS, PostgreSQL migration, and real-device verification remain open.
