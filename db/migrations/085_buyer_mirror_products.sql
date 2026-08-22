-- 085_buyer_mirror_products.sql
-- Receive-on-buy (Model B, Phase 4): a buyer mirror of the bought level.
--
-- When a wholesaler orders a sealed level (pallet / box / piece) from a distributor, the existing
-- deduct trigger decrements the SELLER's product current_stock. To actually hold what it bought,
-- the buyer needs its OWN products row to carry the on-hand — stock lives per-entity on
-- `products.current_stock`, and `products` is created_by-scoped (one catalog per vendor). So on
-- confirm the order API auto-provisions a buyer "mirror" of the bought level (created_by = buyer)
-- and restocks that. For a PACKAGE the whole tree is mirrored (pallet -> box -> piece) so opening
-- the buyer's pallet releases stock into the buyer's OWN box, not the seller's.
--
-- This migration adds the single-level dedup key. `product_packages.source_package_id` (added in
-- 084) already dedupes the package definition; this adds the matching marker on the products row so
-- both PACKAGE and SINGLE mirrors are idempotent — re-ordering the same level reuses the same buyer
-- product instead of cloning a new one each time.
--
-- No trigger is changed here. In particular deduct_stock_on_confirm / guard_stock_on_confirm stay
-- as-is (already Model B), and restock_buyer_on_delivery is untouched: it only fires on
-- DELIVERED/COMPLETED, which the B2B confirm-and-restock flow never reaches, and the API restock is
-- additionally made idempotent on (reference_id, product_id) so the two paths can never double-count.

BEGIN;

-- Provenance marker for an auto-provisioned buyer mirror product. Points back at the seller's
-- products.id the mirror was cloned from. Nullable (vendor-authored / retailer products leave it
-- NULL); a partial unique index keeps one mirror per (buyer, source) so provisioning is idempotent.
ALTER TABLE "public"."products"
  ADD COLUMN IF NOT EXISTS "source_product_id" uuid REFERENCES "public"."products"("id");

CREATE INDEX IF NOT EXISTS "idx_products_source_product"
  ON "public"."products" ("created_by", "source_product_id")
  WHERE "source_product_id" IS NOT NULL;

COMMIT;
