import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  bookStatuses,
  identityProviders,
  jobStatuses,
  photoStatuses,
  storySources,
  tripStatuses,
} from '@trailogue/domain';

export const identityProviderEnum = pgEnum('identity_provider', identityProviders);
export const tripStatusEnum = pgEnum('trip_status', tripStatuses);
export const storySourceEnum = pgEnum('story_source', storySources);
export const bookStatusEnum = pgEnum('book_status', bookStatuses);
export const jobStatusEnum = pgEnum('job_status', jobStatuses);
export const photoStatusEnum = pgEnum('photo_status', photoStatuses);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: varchar('display_name', { length: 160 }),
  avatarUrl: text('avatar_url'),
  email: varchar('email', { length: 320 }),
  privacyAgreedAt: timestamp('privacy_agreed_at', { withTimezone: true }),
  retentionDays: integer('retention_days').default(90).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProviderEnum('provider').notNull(),
    providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
    email: varchar('email', { length: 320 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('user_identities_provider_subject_uq').on(
      table.provider,
      table.providerUserId,
    ),
    index('user_identities_user_id_idx').on(table.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_active_idx').on(table.expiresAt, table.revokedAt),
  ],
);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    destinationName: varchar('destination_name', { length: 240 }),
    destinationCountry: varchar('destination_country', { length: 2 }),
    destinationRegion: varchar('destination_region', { length: 160 }),
    destinationCity: varchar('destination_city', { length: 160 }),
    destinationLatitude: doublePrecision('destination_latitude'),
    destinationLongitude: doublePrecision('destination_longitude'),
    coverPhotoId: uuid('cover_photo_id'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    idempotencyKey: varchar('idempotency_key', { length: 64 }),
    status: tripStatusEnum('status').default('draft').notNull(),
    storyBackground: text('story_background'),
    peopleNotes: text('people_notes'),
    highlights: text('highlights'),
    writingStyle: varchar('writing_style', { length: 80 }).default('warm_documentary').notNull(),
    customWritingStyle: text('custom_writing_style'),
    avoidExpressions: text('avoid_expressions'),
    contentLength: varchar('content_length', { length: 24 }).default('medium').notNull(),
    arrangement: varchar('arrangement', { length: 24 }).default('timeline').notNull(),
    ...timestamps,
  },
  (table) => [
    index('trips_user_updated_idx').on(table.userId, table.updatedAt),
    index('trips_user_status_idx').on(table.userId, table.status),
    uniqueIndex('trips_user_idempotency_key_uq').on(table.userId, table.idempotencyKey),
  ],
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    thumbnailKey: text('thumbnail_key'),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    width: integer('width'),
    height: integer('height'),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    sortOrder: integer('sort_order').default(0).notNull(),
    status: photoStatusEnum('status').default('ready').notNull(),
    clientUploadId: uuid('client_upload_id'),
    uploadExpiresAt: timestamp('upload_expires_at', { withTimezone: true }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    etag: varchar('etag', { length: 160 }),
    failureCode: varchar('failure_code', { length: 80 }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    caption: text('caption'),
    locationName: varchar('location_name', { length: 240 }),
    userConfirmed: boolean('user_confirmed').default(false).notNull(),
    vision: jsonb('vision').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('photos_storage_key_uq').on(table.storageKey),
    uniqueIndex('photos_user_client_upload_uq').on(table.userId, table.clientUploadId),
    index('photos_trip_sort_idx').on(table.tripId, table.sortOrder),
    index('photos_trip_status_sort_idx').on(table.tripId, table.status, table.sortOrder),
    index('photos_status_expiry_idx').on(table.status, table.uploadExpiresAt),
    index('photos_user_id_idx').on(table.userId),
  ],
);

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    storyType: varchar('story_type', { length: 80 }).notNull(),
    source: storySourceEnum('source').default('user').notNull(),
    version: integer('version').default(1).notNull(),
    degraded: boolean('degraded').default(false).notNull(),
    lockedChapterIds: text('locked_chapter_ids').array().default([]).notNull(),
    ...timestamps,
  },
  (table) => [
    index('stories_trip_updated_idx').on(table.tripId, table.updatedAt),
    uniqueIndex('stories_trip_version_uq').on(table.tripId, table.version),
  ],
);

export const books = pgTable(
  'books',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').references(() => stories.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 200 }).notNull(),
    status: bookStatusEnum('status').default('draft').notNull(),
    pdfStorageKey: text('pdf_storage_key'),
    subtitle: varchar('subtitle', { length: 240 }),
    coverPhotoId: uuid('cover_photo_id').references(() => photos.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [index('books_trip_updated_idx').on(table.tripId, table.updatedAt)],
);

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tripId: uuid('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    storyId: uuid('story_id').notNull().references(() => stories.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    visitCount: integer('visit_count').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('share_links_token_hash_uq').on(table.tokenHash),
    index('share_links_owner_trip_idx').on(table.userId, table.tripId, table.createdAt),
    index('share_links_active_idx').on(table.expiresAt, table.revokedAt),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: jobStatusEnum('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    runAfter: timestamp('run_after', { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 160 }),
    lastError: text('last_error'),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    ...timestamps,
  },
  (table) => [
    index('jobs_available_idx').on(table.status, table.runAfter),
    index('jobs_user_id_idx').on(table.userId),
    uniqueIndex('jobs_idempotency_key_uq').on(table.idempotencyKey),
  ],
);

export const schema = {
  users,
  userIdentities,
  sessions,
  trips,
  photos,
  stories,
  books,
  jobs,
  shareLinks,
};
