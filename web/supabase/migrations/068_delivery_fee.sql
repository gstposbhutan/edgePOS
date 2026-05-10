-- Migration 068: Delivery fee tracking
-- Rider submits cost after delivery; customer pays separately;
-- vendor confirms by uploading payment receipt screenshot.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_paid         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee_receipt_url  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee_confirmed_at TIMESTAMPTZ;

-- Also store vendor entity address for rider display
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS address TEXT;
