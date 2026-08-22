-- 112: manufacturer rate (buy cost) on products.
--
-- The top of the chain (a distributor) buys from the manufacturer at a cost the platform should track
-- for margin. This is the landed cost that already flows in per batch as product_batches.unit_cost;
-- mirror the latest cost onto the product so the catalog can show cost + margin without a batch join.
-- Nullable and additive — no existing flow depends on it. Populated on receive / PO-PI, editable in
-- the vendor product form. Wholesalers can also see it (chain visibility); retailers ignore it.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_price numeric(12,2);
