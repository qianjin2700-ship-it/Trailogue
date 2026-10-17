CREATE TYPE "identity_provider" AS ENUM ('apple', 'google', 'email');
--> statement-breakpoint
CREATE TYPE "trip_status" AS ENUM ('draft', 'published', 'archived');
--> statement-breakpoint
CREATE TYPE "story_source" AS ENUM ('user', 'ai', 'mixed');
--> statement-breakpoint
CREATE TYPE "book_status" AS ENUM ('draft', 'generating', 'ready', 'failed');
--> statement-breakpoint
CREATE TYPE "job_status" AS ENUM ('pending', 'running', 'completed', 'failed');
--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "display_name" varchar(160), "avatar_url" text, "email" varchar(320),
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "provider" "identity_provider" NOT NULL,
  "provider_user_id" varchar(255) NOT NULL, "email" varchar(320),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL, "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "title" varchar(200) NOT NULL, "description" text,
  "destination_name" varchar(240), "destination_country" varchar(2),
  "destination_region" varchar(160), "destination_city" varchar(160),
  "destination_latitude" double precision, "destination_longitude" double precision,
  "cover_photo_id" uuid, "start_date" date, "end_date" date,
  "status" "trip_status" DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "storage_key" text NOT NULL,
  "thumbnail_key" text, "original_filename" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL, "width" integer, "height" integer,
  "file_size" bigint NOT NULL, "captured_at" timestamp with time zone,
  "latitude" double precision, "longitude" double precision,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "title" varchar(200) NOT NULL,
  "content" jsonb NOT NULL, "story_type" varchar(80) NOT NULL,
  "source" "story_source" DEFAULT 'user' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "books" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "story_id" uuid,
  "title" varchar(200) NOT NULL, "status" "book_status" DEFAULT 'draft' NOT NULL,
  "pdf_storage_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid, "type" varchar(100) NOT NULL, "payload" jsonb NOT NULL,
  "status" "job_status" DEFAULT 'pending' NOT NULL, "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL, "run_after" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_at" timestamp with time zone, "locked_by" varchar(160), "last_error" text,
  "idempotency_key" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_identities" ADD CONSTRAINT "user_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cover_photo_id_photos_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "photos"("id") ON DELETE set null DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE UNIQUE INDEX "user_identities_provider_subject_uq" ON "user_identities" ("provider", "provider_user_id");
--> statement-breakpoint
CREATE INDEX "user_identities_user_id_idx" ON "user_identities" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "sessions_active_idx" ON "sessions" ("expires_at", "revoked_at");
--> statement-breakpoint
CREATE INDEX "trips_user_updated_idx" ON "trips" ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "trips_user_status_idx" ON "trips" ("user_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "photos_storage_key_uq" ON "photos" ("storage_key");
--> statement-breakpoint
CREATE INDEX "photos_trip_sort_idx" ON "photos" ("trip_id", "sort_order");
--> statement-breakpoint
CREATE INDEX "photos_user_id_idx" ON "photos" ("user_id");
--> statement-breakpoint
CREATE INDEX "stories_trip_updated_idx" ON "stories" ("trip_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "books_trip_updated_idx" ON "books" ("trip_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "jobs_available_idx" ON "jobs" ("status", "run_after");
--> statement-breakpoint
CREATE INDEX "jobs_user_id_idx" ON "jobs" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_key_uq" ON "jobs" ("idempotency_key");
