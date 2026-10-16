# Backend re-platforming audit

## Purpose

This document is the decision gate between the completed Wave 2 iOS client
foundation and further product implementation. It prevents provisional CloudBase
assumptions from becoming the long-term Trailogue architecture.

No production data, cloud resource, or legacy function should be modified during
this audit. Record evidence first; design the replacement second.

## 1. Legacy Tencent Cloud evidence

For every item, record the environment identifier, access result, export method,
approximate volume, data owner, retention requirement, and evidence date. Unknown
means not yet verified, not unavailable.

| Area | Evidence to collect | Current status |
| --- | --- | --- |
| CloudBase environments | Environment IDs, region, service state, console/CLI access | Unknown |
| Database | Collections, indexes, document counts, representative redacted schemas | Static code references only |
| Object storage | Buckets/prefixes, file counts and sizes, metadata, downloadable originals | Unknown |
| Cloud Functions | Deployed names/versions, triggers, environment variables, logs | Repository source available; deployment unknown |
| Identity | OPENID/user linkage, duplicate-user rules, account deletion state | Static code references only |
| Secrets/integrations | Secret names and owners only; never copy secret values into Git | Unknown |
| Export/recovery | Supported export formats, checksums, retry limits, expiration risks | Unknown |

The source audit must enumerate business behavior in `cloudfunctions/` and data
assumptions in `miniprogram/`, including users, albums, photos, photo groups,
stories, AI jobs, books/PDFs, share records, orders/payments, and deletion flows.
Only entities actually evidenced in source or exports should enter the migration
plan.

## 2. Backend option assessment

Compare the options against the audited workload rather than generic feature
lists. A recommendation is not approved until every mandatory row has evidence.

| Criterion | Supabase | Firebase | Node.js + PostgreSQL |
| --- | --- | --- | --- |
| Apple identity and account linking | To verify | To verify | To design and verify |
| Relational User/Trip/Photo/Story/Book model | To verify | To verify | To verify |
| Object storage and signed upload/download | To verify | To verify | To design and verify |
| Background AI jobs and retries | To verify | To verify | To design and verify |
| Server-side book/PDF generation | To verify | To verify | To design and verify |
| Standard versioned HTTPS API | To verify | To verify | To design and verify |
| Data export, backup, and restore | To verify | To verify | To design and verify |
| Region, privacy, deletion, and App Store needs | To verify | To verify | To verify |
| Expo/React Native client integration | To verify | To verify | To verify |
| Operations burden and observability | To estimate | To estimate | To estimate |
| MVP cost and scale cost | To estimate | To estimate | To estimate |
| Vendor lock-in and exit path | To assess | To assess | To assess |

## 3. Required architecture outputs

The backend decision must produce:

1. An ADR selecting one option and documenting rejected alternatives, costs,
   security ownership, operational ownership, and reversal conditions.
2. A provider-neutral identity model with Trailogue user IDs, Apple subject linkage,
   token/session lifecycle, account deletion, and future provider linking rules.
3. Canonical User, Trip, Photo, Story, and Book schemas, including ownership,
   timestamps, lifecycle states, and deletion behavior.
4. A versioned HTTPS API specification with validation, authorization, pagination,
   idempotency, error semantics, and upload/download flows.
5. Storage, AI-job, book/PDF, audit-log, backup, and disaster-recovery designs.
6. A legacy album migration mapping with dry-run reports, deterministic IDs,
   checksums, retry/idempotency behavior, reconciliation, and rollback strategy.

## 4. Implementation gate

Do not build additional major iOS business pages until items 1–4 above are
approved. Existing Wave 2 client code may be refactored after approval; it must not
force the new backend to reproduce CloudBase or WeChat-specific semantics.

The first post-decision implementation slice should prove the complete production
path: Apple sign-in -> current user -> trip list -> create trip -> signed photo
upload -> persisted trip detail. AI organization follows only after that path is
observable and recoverable.
