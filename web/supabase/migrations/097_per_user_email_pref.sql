-- 097_per_user_email_pref.sql
-- Email-notification opt-in is PER USER, not per shop. Covers customers + sellers/staff
-- (user_profiles) and riders (riders). Default OFF. The entities-level flag from 096 is left in place
-- but no longer used by the notify logic.
ALTER TABLE "public"."user_profiles" ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "public"."riders"        ADD COLUMN IF NOT EXISTS "email_notifications_enabled" boolean NOT NULL DEFAULT false;
