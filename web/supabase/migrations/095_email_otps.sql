-- 095_email_otps.sql
-- App-managed email OTP for CUSTOMER login/signup (replaces WhatsApp OTP). Codes are hashed; the
-- plaintext is only emailed (via SendGrid). Accessed by the service client only, so RLS stays off.
CREATE TABLE IF NOT EXISTS "public"."email_otps" (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  otp_hash   text NOT NULL,
  used       boolean NOT NULL DEFAULT false,
  attempts   integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_lookup ON "public"."email_otps" (lower(email), created_at DESC);
