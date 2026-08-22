-- 096_notifications.sql
-- In-app notifications + per-entity email opt-in (default OFF, so we don't accumulate email costs).
-- Auth emails (OTP / password reset) are unaffected — this only governs *notification* emails.
ALTER TABLE "public"."entities"
  ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "public"."notifications" (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid NOT NULL REFERENCES "public"."entities"(id) ON DELETE CASCADE,
  type       text NOT NULL,                 -- ORDER | LOW_STOCK | RECEIPT | SYSTEM
  title      text NOT NULL,
  body       text,
  link       text,
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON "public"."notifications" (entity_id, created_at DESC);

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
-- A signed-in user reads + updates only their own entity's notifications; inserts come from the
-- service client (the notify helper), so no insert policy is granted.
DROP POLICY IF EXISTS notif_select ON "public"."notifications";
CREATE POLICY notif_select ON "public"."notifications" FOR SELECT TO authenticated USING (entity_id = auth_entity_id());
DROP POLICY IF EXISTS notif_update ON "public"."notifications";
CREATE POLICY notif_update ON "public"."notifications" FOR UPDATE TO authenticated USING (entity_id = auth_entity_id());
