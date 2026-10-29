import type {
  ActualStoryLanguage,
  BookStyle,
  GenerationLanguage,
  BookStatus,
  IdentityProvider,
  JobStatus,
  PhotoStatus,
  StorySource,
  StoryVersionType,
  TripStatus,
} from '@trailogue/domain';

import type { QueryExecutor } from './executor.js';

export interface UserRecord {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  privacyAgreedAt: Date | null;
  retentionDays: number;
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

export interface IdentityRecord {
  id: string;
  userId: string;
  provider: IdentityProvider;
  providerUserId: string;
  email: string | null;
}

export interface TripRecord {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  destinationName: string | null;
  status: TripStatus;
  coverPhotoId: string | null;
  coverStorageKey?: string | null;
  coverPhotoUrl?: string | null;
  photoCount: number;
  startDate: string | null;
  endDate: string | null;
  storyBackground: string | null;
  peopleNotes: string | null;
  highlights: string | null;
  writingStyle: string;
  customWritingStyle: string | null;
  avoidExpressions: string | null;
  contentLength: string;
  arrangement: string;
  creativeRequirements?: object;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoRecord {
  id: string;
  userId: string;
  tripId: string;
  storageKey: string;
  thumbnailKey: string | null;
  originalFilename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  capturedAt: Date | null;
  sortOrder: number;
  status: PhotoStatus;
  clientUploadId: string | null;
  uploadExpiresAt: Date | null;
  uploadedAt: Date | null;
  etag: string | null;
  failureCode: string | null;
  caption: string | null;
  locationName: string | null;
  userConfirmed: boolean;
  vision: Record<string, unknown> | null;
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

export interface StoryRecord {
  id: string;
  userId: string;
  tripId: string;
  title: string;
  content: Record<string, unknown>;
  storyType: string;
  source: StorySource;
  version: number;
  degraded: boolean;
  lockedChapterIds: string[];
  generationLanguageMode?: GenerationLanguage;
  actualLanguage?: ActualStoryLanguage;
  versionType?: StoryVersionType;
  creativeSnapshot?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookRecord {
  id: string;
  userId: string;
  tripId: string;
  storyId: string | null;
  title: string;
  subtitle: string | null;
  coverPhotoId: string | null;
  status: BookStatus;
  pdfStorageKey: string | null;
  bookStyle?: BookStyle;
  layout?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareLinkRecord {
  id: string;
  userId: string;
  tripId: string;
  storyId: string;
  tokenHash: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  visitCount: number;
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
         privacy_agreed_at as "privacyAgreedAt", retention_days as "retentionDays",
         created_at as "createdAt", updated_at as "updatedAt"`,
      [input.displayName ?? null, input.avatarUrl ?? null, input.email ?? null],
    );
    return requireRow(result.rows[0]);
  }

  async findById(id: string): Promise<UserRecord | null> {
    const result = await this.database.query<UserRecord>(
      `select id, display_name as "displayName", avatar_url as "avatarUrl", email,
         privacy_agreed_at as "privacyAgreedAt", retention_days as "retentionDays",
         created_at as "createdAt", updated_at as "updatedAt"
       from users where id = $1 and deleted_at is null`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async updateSettings(input: {
    id: string;
    displayName: string | null;
    retentionDays: number;
    privacyAgreedAt: Date | null;
  }): Promise<UserRecord | null> {
    const result = await this.database.query<UserRecord>(
      `update users set display_name = $2, retention_days = $3, privacy_agreed_at = $4,
         updated_at = now()
       where id = $1 and deleted_at is null
       returning id, display_name as "displayName", avatar_url as "avatarUrl", email,
         privacy_agreed_at as "privacyAgreedAt", retention_days as "retentionDays",
         created_at as "createdAt", updated_at as "updatedAt"`,
      [input.id, input.displayName, input.retentionDays, input.privacyAgreedAt],
    );
    return result.rows[0] ?? null;
  }

  async deleteForUser(id: string): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      'delete from users where id = $1 returning id',
      [id],
    );
    return result.rowCount === 1;
  }
}

export class IdentityRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: {
    userId: string;
    provider: IdentityProvider;
    providerUserId: string;
    email?: string | null;
  }): Promise<IdentityRecord> {
    const result = await this.database.query<IdentityRecord>(
      `insert into user_identities (user_id, provider, provider_user_id, email)
       values ($1, $2, $3, $4)
       returning id, user_id as "userId", provider, provider_user_id as "providerUserId", email`,
      [input.userId, input.provider, input.providerUserId, input.email ?? null],
    );
    return requireRow(result.rows[0]);
  }

  async lockProviderSubject(provider: IdentityProvider, providerUserId: string): Promise<void> {
    await this.database.query(
      'select pg_advisory_xact_lock(hashtext($1))',
      [`${provider}:${providerUserId}`],
    );
  }

  async findByProviderSubject(
    provider: IdentityProvider,
    providerUserId: string,
  ): Promise<IdentityRecord | null> {
    const result = await this.database.query<IdentityRecord>(
      `select id, user_id as "userId", provider, provider_user_id as "providerUserId", email
       from user_identities
       where provider = $1 and provider_user_id = $2`,
      [provider, providerUserId],
    );
    return result.rows[0] ?? null;
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
    startDate?: string | null;
    endDate?: string | null;
    idempotencyKey?: string | null;
  }): Promise<TripRecord> {
    const result = await this.database.query<TripRecord>(
      `insert into trips (user_id, title, description, destination_name, start_date, end_date, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, idempotency_key)
       do update set idempotency_key = excluded.idempotency_key
       returning id, user_id as "userId", title, description,
         destination_name as "destinationName", status,
         cover_photo_id as "coverPhotoId", 0::int as "photoCount",
         NULL::text as "coverStorageKey",
         start_date as "startDate", end_date as "endDate",
         story_background as "storyBackground", people_notes as "peopleNotes",
         highlights, writing_style as "writingStyle",
         custom_writing_style as "customWritingStyle", avoid_expressions as "avoidExpressions",
         content_length as "contentLength", arrangement,
         creative_requirements as "creativeRequirements",
         created_at as "createdAt", updated_at as "updatedAt"`,
      [input.userId, input.title, input.description ?? null, input.destinationName ?? null,
        input.startDate ?? null, input.endDate ?? null, input.idempotencyKey ?? null],
    );
    return requireRow(result.rows[0]);
  }

  async findByIdForUser(id: string, userId: string): Promise<TripRecord | null> {
    const result = await this.database.query<TripRecord>(
      `select t.id, t.user_id as "userId", t.title, t.description,
         t.destination_name as "destinationName", t.status,
         t.cover_photo_id as "coverPhotoId", count(p.id)::int as "photoCount",
         (select c.storage_key from photos c where c.id = t.cover_photo_id and c.user_id = t.user_id and c.status = 'ready' and c.deleted_at is null) as "coverStorageKey",
         t.start_date as "startDate", t.end_date as "endDate",
         t.story_background as "storyBackground", t.people_notes as "peopleNotes",
         t.highlights, t.writing_style as "writingStyle",
         t.custom_writing_style as "customWritingStyle", t.avoid_expressions as "avoidExpressions",
         t.content_length as "contentLength", t.arrangement,
         t.creative_requirements as "creativeRequirements",
         t.created_at as "createdAt", t.updated_at as "updatedAt"
       from trips t
       left join photos p on p.trip_id = t.id and p.status = 'ready'
       where t.id = $1 and t.user_id = $2
       group by t.id`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }

  async listForUser(input: {
    userId: string;
    limit: number;
    cursor?: { updatedAt: Date; id: string } | null;
  }): Promise<TripRecord[]> {
    const result = await this.database.query<TripRecord>(
      `select t.id, t.user_id as "userId", t.title, t.description,
         t.destination_name as "destinationName", t.status,
         t.cover_photo_id as "coverPhotoId", count(p.id)::int as "photoCount",
         (select c.storage_key from photos c where c.id = t.cover_photo_id and c.user_id = t.user_id and c.status = 'ready' and c.deleted_at is null) as "coverStorageKey",
         t.start_date as "startDate", t.end_date as "endDate",
         t.story_background as "storyBackground", t.people_notes as "peopleNotes",
         t.highlights, t.writing_style as "writingStyle",
         t.custom_writing_style as "customWritingStyle", t.avoid_expressions as "avoidExpressions",
         t.content_length as "contentLength", t.arrangement,
         t.creative_requirements as "creativeRequirements",
         t.created_at as "createdAt", t.updated_at as "updatedAt"
       from trips t
       left join photos p on p.trip_id = t.id and p.status = 'ready'
       where t.user_id = $1
         and ($2::timestamptz is null or (t.updated_at, t.id) < ($2::timestamptz, $3::uuid))
       group by t.id
       order by t.updated_at desc, t.id desc
       limit $4`,
      [input.userId, input.cursor?.updatedAt ?? null, input.cursor?.id ?? null, input.limit],
    );
    return result.rows;
  }

  async updateForUser(
    id: string,
    userId: string,
    input: {
      title: string;
      description: string | null;
      destinationName: string | null;
      startDate: string | null;
      endDate: string | null;
      storyBackground: string | null;
      peopleNotes: string | null;
      highlights: string | null;
      writingStyle: string;
      customWritingStyle: string | null;
      avoidExpressions: string | null;
      contentLength: string;
      arrangement: string;
      creativeRequirements?: object;
    },
  ): Promise<TripRecord | null> {
    const result = await this.database.query<TripRecord>(
      `with updated as (
         update trips
         set title = $3, description = $4, destination_name = $5,
           start_date = $6, end_date = $7, story_background = $8, people_notes = $9,
           highlights = $10, writing_style = $11, custom_writing_style = $12,
           avoid_expressions = $13, content_length = $14, arrangement = $15,
           creative_requirements = $16::jsonb,
           updated_at = now()
         where id = $1 and user_id = $2
         returning *
       )
       select t.id, t.user_id as "userId", t.title, t.description,
         t.destination_name as "destinationName", t.status,
         t.cover_photo_id as "coverPhotoId", count(p.id)::int as "photoCount",
         (select c.storage_key from photos c where c.id = t.cover_photo_id and c.user_id = t.user_id and c.status = 'ready' and c.deleted_at is null) as "coverStorageKey",
         t.start_date as "startDate", t.end_date as "endDate",
         t.story_background as "storyBackground", t.people_notes as "peopleNotes",
         t.highlights, t.writing_style as "writingStyle",
         t.custom_writing_style as "customWritingStyle", t.avoid_expressions as "avoidExpressions",
         t.content_length as "contentLength", t.arrangement,
         t.creative_requirements as "creativeRequirements",
         t.created_at as "createdAt", t.updated_at as "updatedAt"
       from updated t
       left join photos p on p.trip_id = t.id and p.status = 'ready' and p.deleted_at is null
       group by t.id, t.user_id, t.title, t.description, t.destination_name, t.status,
         t.cover_photo_id, t.start_date, t.end_date, t.story_background, t.people_notes,
         t.highlights, t.writing_style, t.custom_writing_style, t.avoid_expressions,
         t.content_length, t.arrangement, t.creative_requirements, t.created_at, t.updated_at`,
      [
        id, userId, input.title, input.description, input.destinationName,
        input.startDate, input.endDate, input.storyBackground, input.peopleNotes,
        input.highlights, input.writingStyle, input.customWritingStyle,
        input.avoidExpressions, input.contentLength, input.arrangement,
        JSON.stringify(input.creativeRequirements ?? {}),
      ],
    );
    return result.rows[0] ?? null;
  }

  async updateCreativeRequirementsForUser(
    id: string,
    userId: string,
    creativeRequirements: object,
  ): Promise<TripRecord | null> {
    const result = await this.database.query<{ id: string }>(
      `update trips
       set creative_requirements = $3::jsonb, updated_at = now()
       where id = $1 and user_id = $2
       returning id`,
      [id, userId, JSON.stringify(creativeRequirements)],
    );
    return result.rowCount === 1 ? this.findByIdForUser(id, userId) : null;
  }

  async deleteForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      'delete from trips where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    return result.rowCount === 1;
  }

  async setCoverPhoto(id: string, userId: string, photoId: string | null): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `update trips set cover_photo_id = $3, updated_at = now()
       where id = $1 and user_id = $2
         and ($3::uuid is null or exists (
           select 1 from photos where photos.id = $3 and photos.trip_id = $1
             and photos.user_id = $2 and photos.status = 'ready' and photos.deleted_at is null
         ))
       returning id`,
      [id, userId, photoId],
    );
    return result.rowCount === 1;
  }
}

export class PhotoRepository {
  constructor(private readonly database: QueryExecutor) {}

  async createUploadIntent(input: {
    id: string;
    userId: string;
    tripId: string;
    clientUploadId: string;
    storageKey: string;
    originalFilename: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    capturedAt?: Date | null;
    uploadExpiresAt: Date;
  }): Promise<PhotoRecord> {
    const result = await this.database.query<PhotoRecord>(
      `insert into photos (
         id, user_id, trip_id, storage_key, original_filename, mime_type,
         width, height, file_size, captured_at, status, client_upload_id, upload_expires_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
       on conflict (user_id, client_upload_id)
         do update set upload_expires_at = excluded.upload_expires_at, updated_at = now()
       returning ${PHOTO_RETURNING}`,
      [
        input.id, input.userId, input.tripId, input.storageKey, input.originalFilename,
        input.mimeType, input.width, input.height, input.fileSize, input.capturedAt ?? null,
        input.clientUploadId, input.uploadExpiresAt,
      ],
    );
    return requireRow(result.rows[0]);
  }

  async findByIdForUserAndTrip(
    id: string,
    userId: string,
    tripId: string,
  ): Promise<PhotoRecord | null> {
    const result = await this.database.query<PhotoRecord>(
      `select ${PHOTO_RETURNING}
       from photos
       where id = $1 and user_id = $2 and trip_id = $3 and deleted_at is null`,
      [id, userId, tripId],
    );
    return result.rows[0] ?? null;
  }

  async markReady(input: {
    id: string;
    userId: string;
    tripId: string;
    etag?: string | null;
    uploadedAt: Date;
  }): Promise<PhotoRecord | null> {
    const result = await this.database.query<PhotoRecord>(
      `update photos
       set status = 'ready', etag = $4, uploaded_at = $5, failure_code = null, updated_at = $5
       where id = $1 and user_id = $2 and trip_id = $3 and status = 'pending'
       returning ${PHOTO_RETURNING}`,
      [input.id, input.userId, input.tripId, input.etag ?? null, input.uploadedAt],
    );
    return result.rows[0] ?? null;
  }

  async markFailed(input: {
    id: string;
    userId: string;
    tripId: string;
    failureCode: string;
    updatedAt: Date;
  }): Promise<void> {
    await this.database.query(
      `update photos
       set status = 'failed', failure_code = $4, updated_at = $5
       where id = $1 and user_id = $2 and trip_id = $3 and status = 'pending'`,
      [input.id, input.userId, input.tripId, input.failureCode, input.updatedAt],
    );
  }

  async listReadyForTrip(userId: string, tripId: string, limit: number): Promise<PhotoRecord[]> {
    const result = await this.database.query<PhotoRecord>(
      `select ${PHOTO_RETURNING}
       from photos
       where user_id = $1 and trip_id = $2 and status = 'ready' and deleted_at is null
       order by sort_order asc, created_at asc, id asc
       limit $3`,
      [userId, tripId, limit],
    );
    return result.rows;
  }

  async listStorageKeysForTrip(userId: string, tripId: string): Promise<string[]> {
    const result = await this.database.query<{ storageKey: string; thumbnailKey: string | null }>(
      `select storage_key as "storageKey", thumbnail_key as "thumbnailKey"
       from photos where user_id = $1 and trip_id = $2`,
      [userId, tripId],
    );
    return result.rows.flatMap((photo) =>
      photo.thumbnailKey ? [photo.storageKey, photo.thumbnailKey] : [photo.storageKey],
    );
  }

  async listStorageKeysForUser(userId: string): Promise<string[]> {
    const result = await this.database.query<{ storageKey: string; thumbnailKey: string | null }>(
      `select storage_key as "storageKey", thumbnail_key as "thumbnailKey"
       from photos where user_id = $1`,
      [userId],
    );
    return result.rows.flatMap((photo) =>
      photo.thumbnailKey ? [photo.storageKey, photo.thumbnailKey] : [photo.storageKey],
    );
  }

  async reorderForTrip(userId: string, tripId: string, photoIds: string[]): Promise<boolean> {
    if (photoIds.length === 0) return false;
    const result = await this.database.query<{ updatedCount: number }>(
      `with input as (
         select id, position
         from unnest($3::uuid[]) with ordinality as ordered(id, position)
       ), valid_input as (
         select count(*)::int = cardinality($3::uuid[]) as valid
         from input
         join photos p on p.id = input.id
         where p.user_id = $1 and p.trip_id = $2 and p.status = 'ready' and p.deleted_at is null
       ), updated as (
         update photos p
         set sort_order = input.position - 1, updated_at = now()
         from input, valid_input
         where valid_input.valid and p.id = input.id and p.user_id = $1 and p.trip_id = $2
         returning p.id
       )
       select count(*)::int as "updatedCount" from updated`,
      [userId, tripId, photoIds],
    );
    return result.rows[0]?.updatedCount === photoIds.length;
  }

  async deleteForUserAndTrip(
    id: string,
    userId: string,
    tripId: string,
  ): Promise<PhotoRecord | null> {
    const result = await this.database.query<PhotoRecord>(
      `delete from photos
       where id = $1 and user_id = $2 and trip_id = $3
       returning ${PHOTO_RETURNING}`,
      [id, userId, tripId],
    );
    return result.rows[0] ?? null;
  }

  async updateDetails(input: {
    id: string;
    userId: string;
    tripId: string;
    caption: string | null;
    locationName: string | null;
    capturedAt: Date | null;
  }): Promise<PhotoRecord | null> {
    const result = await this.database.query<PhotoRecord>(
      `update photos set caption = $4, location_name = $5, captured_at = $6,
         user_confirmed = true, updated_at = now()
       where id = $1 and user_id = $2 and trip_id = $3 and status = 'ready'
         and deleted_at is null
       returning ${PHOTO_RETURNING}`,
      [input.id, input.userId, input.tripId, input.caption, input.locationName, input.capturedAt],
    );
    return result.rows[0] ?? null;
  }

  async updateVision(input: {
    id: string;
    userId: string;
    tripId: string;
    vision: Record<string, unknown>;
  }): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `update photos set vision = $4::jsonb, updated_at = now()
       where id = $1 and user_id = $2 and trip_id = $3 and status = 'ready'
         and deleted_at is null returning id`,
      [input.id, input.userId, input.tripId, JSON.stringify(input.vision)],
    );
    return result.rowCount === 1;
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

  async findByIdForUser(id: string, userId: string): Promise<JobRecord | null> {
    const result = await this.database.query<JobRecord>(
      `select ${JOB_RETURNING} from jobs where id = $1 and user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ?? null;
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

export class StoryRepository {
  constructor(private readonly database: QueryExecutor) {}

  async createVersion(input: {
    userId: string;
    tripId: string;
    title: string;
    content: Record<string, unknown>;
    storyType?: string;
    source?: StorySource;
    degraded?: boolean;
    lockedChapterIds?: string[];
    generationLanguageMode?: GenerationLanguage;
    actualLanguage?: ActualStoryLanguage;
    versionType?: StoryVersionType;
    creativeSnapshot?: Record<string, unknown>;
  }): Promise<StoryRecord> {
    const result = await this.database.query<StoryRecord>(
      `with locked as (
         select pg_advisory_xact_lock(hashtext($2::text))
       ), next_version as (
         select coalesce(max(version), 0)::int + 1 as version
         from stories, locked where trip_id = $2::uuid
       )
       insert into stories (
         user_id, trip_id, title, content, story_type, source,
         version, degraded, locked_chapter_ids, generation_language_mode,
         actual_language, version_type, creative_snapshot
       )
       select $1::uuid, $2::uuid, $3, $4::jsonb, $5, $6::story_source,
         next_version.version, $7, $8::text[], $9, $10, $11, $12::jsonb
       from next_version
       returning ${STORY_RETURNING}`,
      [
        input.userId, input.tripId, input.title, JSON.stringify(input.content),
        input.storyType ?? 'travel_story', input.source ?? 'ai', input.degraded ?? false,
        input.lockedChapterIds ?? [], input.generationLanguageMode ?? 'auto',
        input.actualLanguage ?? 'en', input.versionType ?? 'generated',
        JSON.stringify(input.creativeSnapshot ?? {}),
      ],
    );
    return requireRow(result.rows[0]);
  }

  async findLatestForTrip(userId: string, tripId: string): Promise<StoryRecord | null> {
    const result = await this.database.query<StoryRecord>(
      `select ${STORY_RETURNING} from stories
       where user_id = $1 and trip_id = $2
       order by version desc limit 1`,
      [userId, tripId],
    );
    return result.rows[0] ?? null;
  }

  async listVersionsForTrip(userId: string, tripId: string): Promise<StoryRecord[]> {
    const result = await this.database.query<StoryRecord>(
      `select ${STORY_RETURNING} from stories
       where user_id = $1 and trip_id = $2 order by version desc`,
      [userId, tripId],
    );
    return result.rows;
  }

  async findByIdForUser(id: string, userId: string): Promise<StoryRecord | null> {
    const result = await this.database.query<StoryRecord>(
      `select ${STORY_RETURNING} from stories where id = $1 and user_id = $2`,
      [id, userId],
    );
    return result.rows[0] ?? null;
  }
}

export class BookRepository {
  constructor(private readonly database: QueryExecutor) {}

  async upsertForTrip(input: {
    userId: string;
    tripId: string;
    storyId: string;
    title: string;
    subtitle?: string | null;
    coverPhotoId?: string | null;
    bookStyle?: BookStyle;
    layout?: Record<string, unknown>;
  }): Promise<BookRecord> {
    const existing = await this.database.query<BookRecord>(
      `select ${BOOK_RETURNING} from books where user_id = $1 and trip_id = $2
       order by updated_at desc limit 1`,
      [input.userId, input.tripId],
    );
    if (existing.rows[0]) {
      const updated = await this.database.query<BookRecord>(
        `update books set story_id = $3, title = $4, subtitle = $5, cover_photo_id = $6,
           book_style = $7, layout = $8::jsonb, status = 'ready', updated_at = now()
         where id = $1 and user_id = $2 returning ${BOOK_RETURNING}`,
        [existing.rows[0].id, input.userId, input.storyId, input.title,
          input.subtitle ?? null, input.coverPhotoId ?? null,
          input.bookStyle ?? 'travel_magazine', JSON.stringify(input.layout ?? {})],
      );
      return requireRow(updated.rows[0]);
    }
    const created = await this.database.query<BookRecord>(
      `insert into books (user_id, trip_id, story_id, title, subtitle, cover_photo_id, status, book_style, layout)
       values ($1, $2, $3, $4, $5, $6, 'ready', $7, $8::jsonb) returning ${BOOK_RETURNING}`,
      [input.userId, input.tripId, input.storyId, input.title,
        input.subtitle ?? null, input.coverPhotoId ?? null,
        input.bookStyle ?? 'travel_magazine', JSON.stringify(input.layout ?? {})],
    );
    return requireRow(created.rows[0]);
  }

  async findForTrip(userId: string, tripId: string): Promise<BookRecord | null> {
    const result = await this.database.query<BookRecord>(
      `select ${BOOK_RETURNING} from books where user_id = $1 and trip_id = $2
       order by updated_at desc limit 1`,
      [userId, tripId],
    );
    return result.rows[0] ?? null;
  }

  async updateLayoutForTrip(
    userId: string,
    tripId: string,
    layout: Record<string, unknown>,
  ): Promise<BookRecord | null> {
    const result = await this.database.query<BookRecord>(
      `update books set layout = $3::jsonb, updated_at = now()
       where id = (
         select id from books where user_id = $1 and trip_id = $2
         order by updated_at desc limit 1
       ) and user_id = $1 returning ${BOOK_RETURNING}`,
      [userId, tripId, JSON.stringify(layout)],
    );
    return result.rows[0] ?? null;
  }
}

export class ShareLinkRepository {
  constructor(private readonly database: QueryExecutor) {}

  async create(input: {
    userId: string;
    tripId: string;
    storyId: string;
    tokenHash: string;
    expiresAt: Date | null;
  }): Promise<ShareLinkRecord> {
    const result = await this.database.query<ShareLinkRecord>(
      `insert into share_links (user_id, trip_id, story_id, token_hash, expires_at)
       values ($1, $2, $3, $4, $5) returning ${SHARE_LINK_RETURNING}`,
      [input.userId, input.tripId, input.storyId, input.tokenHash, input.expiresAt],
    );
    return requireRow(result.rows[0]);
  }

  async findActiveByTokenHash(tokenHash: string, now = new Date()): Promise<ShareLinkRecord | null> {
    const result = await this.database.query<ShareLinkRecord>(
      `select ${SHARE_LINK_RETURNING} from share_links
       where token_hash = $1 and revoked_at is null
         and (expires_at is null or expires_at > $2)`,
      [tokenHash, now],
    );
    return result.rows[0] ?? null;
  }

  async revokeForUser(id: string, userId: string): Promise<boolean> {
    const result = await this.database.query<{ id: string }>(
      `update share_links set revoked_at = now(), updated_at = now()
       where id = $1 and user_id = $2 and revoked_at is null returning id`,
      [id, userId],
    );
    return result.rowCount === 1;
  }

  async incrementVisit(id: string): Promise<void> {
    await this.database.query(
      'update share_links set visit_count = visit_count + 1, updated_at = now() where id = $1',
      [id],
    );
  }
}

const JOB_RETURNING = `id, user_id as "userId", type, payload, status, attempts,
  max_attempts as "maxAttempts", run_after as "runAfter", locked_at as "lockedAt",
  locked_by as "lockedBy", last_error as "lastError", idempotency_key as "idempotencyKey",
  created_at as "createdAt", updated_at as "updatedAt"`;

const PHOTO_RETURNING = `id, user_id as "userId", trip_id as "tripId",
  storage_key as "storageKey", thumbnail_key as "thumbnailKey",
  original_filename as "originalFilename", mime_type as "mimeType",
  width, height, file_size::int as "fileSize", captured_at as "capturedAt",
  sort_order as "sortOrder", status, client_upload_id as "clientUploadId",
  upload_expires_at as "uploadExpiresAt", uploaded_at as "uploadedAt", etag,
  failure_code as "failureCode", caption, location_name as "locationName",
  user_confirmed as "userConfirmed", vision,
  created_at as "createdAt", updated_at as "updatedAt"`;

const STORY_RETURNING = `id, user_id as "userId", trip_id as "tripId", title, content,
  story_type as "storyType", source, version, degraded,
  locked_chapter_ids as "lockedChapterIds", generation_language_mode as "generationLanguageMode",
  actual_language as "actualLanguage", version_type as "versionType",
  creative_snapshot as "creativeSnapshot", created_at as "createdAt", updated_at as "updatedAt"`;

const BOOK_RETURNING = `id, user_id as "userId", trip_id as "tripId",
  story_id as "storyId", title, subtitle, cover_photo_id as "coverPhotoId", status,
  pdf_storage_key as "pdfStorageKey", book_style as "bookStyle", layout,
  created_at as "createdAt", updated_at as "updatedAt"`;

const SHARE_LINK_RETURNING = `id, user_id as "userId", trip_id as "tripId",
  story_id as "storyId", token_hash as "tokenHash", expires_at as "expiresAt",
  revoked_at as "revokedAt", visit_count as "visitCount",
  created_at as "createdAt", updated_at as "updatedAt"`;

function requireRow<T>(row: T | undefined): T {
  if (!row) throw new Error('Database did not return the expected row');
  return row;
}
