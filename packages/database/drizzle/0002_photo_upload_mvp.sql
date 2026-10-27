CREATE TYPE "photo_status" AS ENUM ('pending', 'ready', 'failed', 'deleting');
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "status" "photo_status" DEFAULT 'ready' NOT NULL;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "client_upload_id" uuid;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "upload_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "uploaded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "etag" varchar(160);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "failure_code" varchar(80);
--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_file_size_positive" CHECK ("file_size" > 0);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_width_positive" CHECK ("width" IS NULL OR "width" > 0);
--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_height_positive" CHECK ("height" IS NULL OR "height" > 0);
--> statement-breakpoint
CREATE UNIQUE INDEX "photos_user_client_upload_uq" ON "photos" ("user_id", "client_upload_id");
--> statement-breakpoint
CREATE INDEX "photos_trip_status_sort_idx" ON "photos" ("trip_id", "status", "sort_order");
--> statement-breakpoint
CREATE INDEX "photos_status_expiry_idx" ON "photos" ("status", "upload_expires_at");
