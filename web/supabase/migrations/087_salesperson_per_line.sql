-- 087_salesperson_per_line.sql
-- Salesperson moves from invoice-level (orders.salesperson_id, migration 078) to PER-LINE. Each
-- cart/order line records the salesperson who sold it. orders.salesperson_id is kept (back-compat /
-- "default salesperson" for the sale); the per-line value is authoritative for attribution.
BEGIN;
ALTER TABLE "public"."cart_items"
  ADD COLUMN IF NOT EXISTS "salesperson_id" uuid REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;
ALTER TABLE "public"."order_items"
  ADD COLUMN IF NOT EXISTS "salesperson_id" uuid REFERENCES "public"."user_profiles"("id") ON DELETE SET NULL;
COMMIT;
