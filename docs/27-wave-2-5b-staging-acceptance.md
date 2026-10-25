# Wave 2.5B — Staging Trip Read Acceptance

This runbook prepares one **Staging-only** Trip row for the already authenticated iPhone test user. It is intentionally separate from development seed data and from the product's future Trip-create API.

## Safety boundary

- Run only in the Neon project used by `trailogue-staging`; never run it against development or production.
- Do not run `npm run db:seed`. That seed creates a new development user and is not an acceptance fixture.
- Do not insert or change `users`, `user_identities`, or `sessions`. The existing Apple-authenticated user is selected by its internal `users.id` only.
- Do not paste Apple identity tokens, Trailogue bearer tokens, or `DATABASE_URL` into this file, terminal history, Git, or chat.
- The SQL is transaction-scoped, requires a deliberate target UUID, is idempotent for its fixture marker, and has a matching cleanup transaction.

## Read-only preflight

In the Neon **Staging** SQL editor, first run this read-only query. Confirm the database name/project in the console before copying an ID.

```sql
select
  current_database() as database_name,
  u.id as user_id,
  u.display_name,
  u.created_at,
  s.last_used_at
from users u
join sessions s on s.user_id = u.id
where u.deleted_at is null
  and s.revoked_at is null
  and s.expires_at > now()
order by s.last_used_at desc;
```

Choose the row corresponding to the iPhone test session and copy only its UUID as `TARGET_USER_ID`. Do not copy the session token hash or Apple provider subject.

## Write plan — requires explicit approval

After an operator confirms the selected Neon project and `TARGET_USER_ID`, replace the UUID in the first statement below and run the entire transaction once. It creates at most one row for this user and marker; repeated execution returns the existing row.

```sql
begin;

select pg_advisory_xact_lock(hashtext('trailogue:wave-2-5b:TARGET_USER_ID'));

with target_user as (
  select id
  from users
  where id = 'TARGET_USER_ID'::uuid
    and deleted_at is null
), existing_fixture as (
  select id
  from trips
  where user_id = (select id from target_user)
    and description = 'Trailogue staging acceptance fixture: wave-2-5b'
  limit 1
), inserted_fixture as (
  insert into trips (user_id, title, description, destination_name, status, start_date, end_date)
  select
    id,
    'Wave 2.5B — Pacific Coast',
    'Trailogue staging acceptance fixture: wave-2-5b',
    'California',
    'draft',
    date '2026-10-01',
    date '2026-10-07'
  from target_user
  where not exists (select 1 from existing_fixture)
  returning id, user_id, title, destination_name, status, start_date, end_date
)
select * from inserted_fixture
union all
select id, user_id, title, destination_name, status, start_date, end_date
from trips
where id = (select id from existing_fixture);

commit;
```

Expected result: exactly one row owned by `TARGET_USER_ID`, with title **Wave 2.5B — Pacific Coast**. If it returns zero rows, stop and investigate: the UUID did not identify an active Staging user. The transaction has made no data change in that case.

## Device verification after the row exists

1. Keep the same iPhone signed in and pull to refresh the Trip list. The fixture must appear.
2. Open it and verify title, destination, zero photos, and dates are rendered from the API.
3. Sign out, sign in with the second test identity, refresh, and confirm the fixture is absent.
4. With the second identity, attempt to open the first user's trip only through a captured route/API test if available; the API must return `404 NOT_FOUND`, not the Trip payload.

## Cleanup — requires explicit approval

Run only in the same verified Staging project after acceptance is complete. It deletes only the marker row for the selected user and leaves the user, Apple identity, and sessions intact.

```sql
begin;

delete from trips
where user_id = 'TARGET_USER_ID'::uuid
  and description = 'Trailogue staging acceptance fixture: wave-2-5b'
returning id, title;

commit;
```

## Automated coverage paired with this runbook

- API tests use two independent bearer sessions and confirm list/detail owner scoping.
- Database tests confirm `trips.user_id` isolation via repository queries.
- iOS tests confirm a protected Trip-list `401` invokes local sign-out, while restore and non-auth network failures retain or clear the SecureStore token as appropriate.

No deployment, environment-variable change, database connection, or database write is performed by adding this document.
