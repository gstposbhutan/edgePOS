-- 088_marketplace_vendor.sql
-- Marketplace vendor support: per-vendor delivery mode (enable/bypass the rider flow) + product
-- fields needed for second-hand / used-item listings (condition + free-text description).
BEGIN;

-- Per-vendor fulfilment: DELIVERY = current behaviour (auto-assign a rider at checkout);
-- PICKUP = cart+checkout but NO rider (buyer collects in person); NONE = catalog only.
ALTER TABLE "public"."entities"
  ADD COLUMN IF NOT EXISTS "delivery_mode" text NOT NULL DEFAULT 'DELIVERY';
DO $$ BEGIN
  ALTER TABLE "public"."entities"
    ADD CONSTRAINT entities_delivery_mode_chk CHECK (delivery_mode IN ('DELIVERY','PICKUP','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product listing fields (used-goods): condition (free text; template suggests a standard set) +
-- a longer marketing description shown on the marketplace product page.
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "condition" text;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "description" text;

COMMIT;
