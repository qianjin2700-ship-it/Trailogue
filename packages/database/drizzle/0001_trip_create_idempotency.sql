ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trips_user_idempotency_key_uq"
  ON "trips" ("user_id", "idempotency_key");
