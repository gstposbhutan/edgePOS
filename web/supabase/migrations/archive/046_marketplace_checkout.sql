-- Migration 046: Marketplace Checkout — payment token + delivery columns
-- Adds fields needed for post-delivery payment link flow and customer delivery address

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_token               TEXT,
  ADD COLUMN IF NOT EXISTS payment_token_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_address            TEXT,
  ADD COLUMN IF NOT EXISTS delivery_lat                DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng                DECIMAL(10,7);

-- Sparse index — only rows with a token need to be looked up by token
CREATE INDEX IF NOT EXISTS idx_orders_payment_token
  ON orders(payment_token)
  WHERE payment_token IS NOT NULL;
