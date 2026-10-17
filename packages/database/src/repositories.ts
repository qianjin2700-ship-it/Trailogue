import type { IdentityProvider, JobStatus, TripStatus } from '@trailogue/domain';

import type { QueryExecutor } from './executor.js';

export interface UserRecord {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface TripRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  destinationName: string | null;
  status: TripStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobRecord {
  id: string;
  userId: string | null;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class UserRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: {
    displayName?: string | null;
    avatarUrl?: string | null;
    email?: string | null;
  } = {}): Promise<UserRecord> {
    const result = await this.database.query<UserRecord>(
      `insert into users (display_name, avatar_url, email)
       values ($1, $2, $3)
       returning id, display_name as "displayName", avatar_url as "avatarUrl", email,
         created_at as "createdAt", updated_at as "updatedAt"`,
      [input.displayName ?? null, input.avatarUrl ?? null, input.email ?? null],
    );
    return requireRow(result.rows[0]);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await this.database.query<UserRecord>(
      `select id, display_name as "displayName", avatar_url as "avatarUrl", email,
         created_at as "createdAt", updated_at as "updatedAt"
       from users where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}

export class IdentityRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: {
    userId: string;
    provider: IdentityProvider;
    providerUserId: string;
    email?: string | null;
  }): Promise<{ id: string; userId: string; provider: IdentityProvider; providerUserId: string }> {
    const result = await this.database.query<{
      id: string;
      userId: string;
      provider: IdentityProvider;
      providerUserId: string;
    }>(
      `insert into user_identities (user_id, provider, provider_user_id, email)
       values ($1, $2, $3, $4)
       returning id, user_id as "userId", provider, provider_user_id as "providerUserId"`,
      [input.userId, input.provider, input.providerUserId, input.email ?? null],
    );
    return requireRow(result.rows[0]);
  }
}

export class SessionRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<SessionRecord> {
    const result = await this.database.query<SessionRecord>(
      `insert into sessions (user_id, token_hash, expires_at)
       values ($1, $2, $3)
       returning id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt",
         revoked_at as "revokedAt", created_at as "createdAt", last_used_at as "lastUsedAt"`,
      [input.userId, input.tokenHash, input.expiresAt],
    );
    return requireRow(result.rows[0]);
  }

  async findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<SessionRecord | null> {
    const result = await this.database.query<SessionRecord>(
      `update sessions set last_used_at = $2
       where token_hash = $1 and revoked_at is null and expires_at > $2
       returning id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt",
         revoked_at as "revokedAt", created_at as "createdAt", last_used_at as "lastUsedAt"`,
      [tokenHash, now],
    );
    return result.rows[0] ?? null;
  }

  async revoke(id: string, now = new Date()): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      'update sessions set revoked_at = $2 where id = $1 and revoked_at is null returning id',
      [id, now],
    );
    return result.rowCount === 1;
  }
}

export class TripRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: {
    userId: string;
    title: string;
    description?: string | null;
    destinationName?: string | null;
  }): Promise<TripRecord> {
    const result = await this.database.query<TripRecord>(
      `insert into trips (user_id, title, description, destination_name)
       values ($1, $2, $3, $4)
       returning id, user_id as "userId", title, description,
         destination_name as "destinationName", status,
         created_at as "createdAt", updated_at as "updatedAt"`,
      [input.userId, input.title, input.description ?? null, input.destinationName ?? null],
    );
    return requireRow(result.rows[0]);
  }

  async findByIdForUser(id: string, userId: string): Promise<TripRecord | null> {
    const result = await this.database.query<TripRecord>(
      `select id, user_id as "userId", title, description,
         destination_name as "destinationName", status,
         created_at as "createdAt", updated_at as "updatedAt"
       from trips where id = $1 and user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }
}

export class JobRepository {
  constructor(private readonly database: QueryExecutor) {}

  async enqueue(input: {
    userId?: string | null;
    type: string;
    payload: Record<string, unknown>;
    maxAttempts?: number;
    runAfter?: Date;
    idempotencyKey?: string | null;
  }): Promise<JobRecord> {
    const result = await this.database.query<JobRecord>(
      `insert into jobs (user_id, type, payload, max_attempts, run_after, idempotency_key)
       values ($1, $2, $3::jsonb, $4, $5, $6)
       returning ${JOB_RETURNING}`,
      [
        input.userId ?? null,
        input.type,
        JSON.stringify(input.payload),
        input.maxAttempts ?? 3,
        input.runAfter ?? new Date(),
        input.idempotencyKey ?? null,
      ],
    );
    return requireRow(result.rows[0]);
  }

  async claimNext(workerId: string, now = new Date()): Promise<JobRecord | null> {
    const result = await this.database.query<JobRecord>(
      `update jobs
       set status = 'running', locked_at = $2, locked_by = $1,
         attempts = attempts + 1, updated_at = $2
       where id = (
         select id from jobs
         where status = 'pending' and run_after <= $2 and attempts < max_attempts
         order by run_after asc, created_at asc
         for update skip locked
         limit 1
       )
       returning ${JOB_RETURNING}`,
      [workerId, now],
    );
    return result.rows[0] ?? null;
  }

  async complete(id: string, workerId: string, now = new Date()): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `update jobs set status = 'completed', locked_at = null, locked_by = null, updated_at = $3
       where id = $1 and status = 'running' and locked_by = $2 returning id`,
      [id, workerId, now],
    );
    return result.rowCount === 1;
  }

  async fail(
    id: string,
    workerId: string,
    errorMessage: string,
    now = new Date(),
    retryDelayMs = 5_000,
  ): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `update jobs
       set status = case when attempts >= max_attempts then 'failed'::job_status else 'pending'::job_status end,
         locked_at = null, locked_by = null, last_error = $3,
         run_after = case when attempts >= max_attempts then run_after else $4::timestamptz + ($5 * interval '1 millisecond') end,
         updated_at = $4::timestamptz
       where id = $1 and status = 'running' and locked_by = $2
       returning id`,
      [id, workerId, errorMessage.slice(0, 2_000), now, retryDelayMs],
    );
    return result.rowCount === 1;
  }
}

const JOB_RETURNING = `id, user_id as "userId", type, payload, status, attempts,
  max_attempts as "maxAttempts", run_after as "runAfter", locked_at as "lockedAt",
  locked_by as "lockedBy", last_error as "lastError", idempotency_key as "idempotencyKey",
  created_at as "createdAt", updated_at as "updatedAt"`;

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new Error('Database did not return the expected row');
  return row;
}
