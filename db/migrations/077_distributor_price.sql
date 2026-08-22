-- 077: Distributor price tier (Phase 3 price-list toggle).
-- Nullable by design: the POS price-list logic falls back to wholesale_price
-- when this is unset, so existing products keep working unchanged until an
-- admin sets a distributor rate. No index — it is a per-product attribute,
-- never a query/join column.
ALTER TABLE products ADD COLUMN IF NOT EXISTS distributor_price numeric(12,2);

COMMENT ON COLUMN products.distributor_price IS
  'Per-unit 3rd-tier (distributor) selling price. NULL → falls back to wholesale_price at the POS.';
