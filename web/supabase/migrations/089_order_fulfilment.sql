-- 089_order_fulfilment.sql
-- Per-order fulfilment mode so a marketplace order records whether it ships (rider) or is collected.
-- Set from the seller's entities.delivery_mode at checkout (migration 088).
ALTER TABLE "public"."orders"
  ADD COLUMN IF NOT EXISTS "fulfilment_mode" text NOT NULL DEFAULT 'DELIVERY';
