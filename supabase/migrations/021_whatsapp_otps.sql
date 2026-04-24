-- Migration 021: WhatsApp OTP storage table
-- Used by the WhatsApp OTP login flow (F-AUTH-001)
-- No RLS — this table is only accessed server-side via service role key

CREATE TABLE whatsapp_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  otp_hash      TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT FALSE,
  attempt_count INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_otps_lookup
  ON whatsapp_otps(phone, used, expires_at DESC);

-- Auto-purge expired OTPs older than 1 hour (keeps table small)
CREATE INDEX idx_whatsapp_otps_cleanup
  ON whatsapp_otps(created_at)
  WHERE used = TRUE OR expires_at < NOW();
