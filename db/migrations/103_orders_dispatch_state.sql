-- 103_orders_dispatch_state.sql
-- Make the rider-dispatch outcome visible to the customer and vendor.
--
-- dispatch_state reflects how the delivery-rider search is going for a MARKETPLACE delivery order:
--   ASSIGNED       — a rider currently holds it (orders.rider_id set)
--   SEARCHING      — unassigned; waiting for a rider to come on shift (transient, self-resolves)
--   UNDELIVERABLE  — no eligible rider remains (every on-shift rider has declined it) — it will NOT
--                    self-resolve, so the customer or vendor should cancel (or wait for new riders)
-- NULL for pickup orders and non-marketplace orders (no rider flow).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_state text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_dispatch_state_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_dispatch_state_check
  CHECK (dispatch_state IS NULL OR dispatch_state IN ('ASSIGNED', 'SEARCHING', 'UNDELIVERABLE'));

-- Find orders needing attention (undeliverable / still searching) quickly.
CREATE INDEX IF NOT EXISTS idx_orders_dispatch_state
  ON public.orders (dispatch_state)
  WHERE dispatch_state IN ('SEARCHING', 'UNDELIVERABLE');
