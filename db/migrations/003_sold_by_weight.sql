-- Weighed-at-counter goods (loose rice / sugar / vegetables / fruit). When true,
-- `selling_price` is the per-unit (per-kg) rate; the retailer POS cashier enters a weight
-- at checkout. Mirrors the desktop PocketBase products.sold_by_weight
-- (desktop/pb/pb_migrations/006_sold_by_weight.js) so the central catalog + sync carry it.
ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "sold_by_weight" boolean NOT NULL DEFAULT false;
