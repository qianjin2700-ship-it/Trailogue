ALTER TABLE "users" ADD COLUMN "privacy_agreed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "retention_days" integer DEFAULT 90 NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_retention_days_valid" CHECK ("retention_days" = -1 OR "retention_days" BETWEEN 1 AND 3650);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "story_background" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "people_notes" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "highlights" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "writing_style" varchar(80) DEFAULT 'warm_documentary' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "custom_writing_style" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "avoid_expressions" text;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "content_length" varchar(24) DEFAULT 'medium' NOT NULL;
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "arrangement" varchar(24) DEFAULT 'timeline' NOT NULL;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "caption" text;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "location_name" varchar(240);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "user_confirmed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "vision" jsonb;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "degraded" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "locked_chapter_ids" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_version_positive" CHECK ("version" > 0);
--> statement-breakpoint
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "trip_id" ORDER BY "created_at", "id")::integer AS "next_version"
  FROM "stories"
)
UPDATE "stories" SET "version" = ranked."next_version" FROM ranked WHERE "stories"."id" = ranked."id";
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "subtitle" varchar(240);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "cover_photo_id" uuid;
--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_cover_photo_id_photos_id_fk" FOREIGN KEY ("cover_photo_id") REFERENCES "photos"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE "share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "trip_id" uuid NOT NULL,
  "story_id" uuid NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "visit_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX "stories_user_trip_version_idx" ON "stories" ("user_id", "trip_id", "version");
--> statement-breakpoint
CREATE UNIQUE INDEX "stories_trip_version_uq" ON "stories" ("trip_id", "version");
--> statement-breakpoint
CREATE INDEX "books_user_trip_updated_idx" ON "books" ("user_id", "trip_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_hash_uq" ON "share_links" ("token_hash");
--> statement-breakpoint
CREATE INDEX "share_links_owner_trip_idx" ON "share_links" ("user_id", "trip_id", "created_at");
--> statement-breakpoint
CREATE INDEX "share_links_active_idx" ON "share_links" ("expires_at", "revoked_at");
