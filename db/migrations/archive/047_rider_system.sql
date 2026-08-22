-- Migration 047: Rider System
-- Creates riders table and adds OTP + rider assignment columns to orders

-- ── riders table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS riders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  whatsapp_no      TEXT NOT NULL UNIQUE,
  pin_hash         TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_available     BOOLEAN NOT NULL DEFAULT true,
  current_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riders_whatsapp ON riders(whatsapp_no);
CREATE INDEX IF NOT EXISTS idx_riders_available ON riders(is_active, is_available) WHERE is_active = true;

-- ── OTP + rider assignment columns on orders ──────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_otp               TEXT,
  ADD COLUMN IF NOT EXISTS pickup_otp_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp             TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_id                 UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_accepted_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id) WHERE rider_id IS NOT NULL;

-- ── RLS: riders table ─────────────────────────────────────────────────────────
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by all API routes)
CREATE POLICY "service_role_all_riders" ON riders
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Riders can read their own record
CREATE POLICY "rider_read_own" ON riders
  FOR SELECT USING (auth_user_id = auth.uid());
