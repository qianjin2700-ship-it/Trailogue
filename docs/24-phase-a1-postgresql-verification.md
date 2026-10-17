# Phase A.1 PostgreSQL 17 verification

**Date**: 2026-10-17
**Runtime**: PostgreSQL 17.11 (native Windows binaries, loopback-only temporary instance)
**Database**: Fresh `trailogue_phase_a1` database

## Result

Phase A was verified against a real PostgreSQL 17 server. Docker was not available on this host, so the official PostgreSQL 17.11 Windows binaries were used instead of the Compose wrapper. No production or shared database was touched.

- The checked-in Drizzle migration applied to an empty database and recorded one migration.
- The development seed ran successfully twice and preserved all constraints; production mode correctly rejected seed execution.
- All eight canonical tables were created: `users`, `user_identities`, `sessions`, `trips`, `photos`, `stories`, `books`, and `jobs`.
- Foreign keys, deletion rules, unique constraints, deferred Trip cover-photo reference, session indexes, Trip owner indexes, and Job polling/idempotency indexes were confirmed from the PostgreSQL catalog.
- Identity uniqueness rejected a duplicate provider subject.
- Session tokens were stored only as hashes; active sessions resolved while expired and revoked sessions were rejected.
- Trip repository reads remained isolated by owner.
- Two independent database connections racing to claim one Job produced exactly one claim; the worker completed a claimed Job.
- The compiled API returned `200` from `/health` and `/ready` while PostgreSQL was available. With PostgreSQL stopped, `/health` stayed `200` and `/ready` returned `503`; readiness recovered to `200` after restart.
- The compiled worker started successfully against PostgreSQL 17 and polled an empty queue.

## Defects corrected during verification

- `db:migrate` resolved `packages/drizzle` instead of `packages/database/drizzle`; the migration directory now resolves from the database package.
- The `domain` and `contracts` package exports pointed to non-existent `dist/src` files; they now match the emitted `dist/index` files.

## Seed behavior

The development seed intentionally creates a new fixture set on each execution. It is repeatable without constraint violations but is not idempotent. It remains guarded against production execution.

## Boundary

This checkpoint verifies Phase A only. It does not implement Apple token verification, authenticated API handlers, OSS, AI, maps, PDF, billing, cloud provisioning, or any Phase B feature.
