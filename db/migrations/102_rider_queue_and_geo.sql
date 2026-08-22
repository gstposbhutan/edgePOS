-- 102_rider_queue_and_geo.sql
-- Rider delivery QUEUE + even, location-aware distribution + email-OTP login support.
--
-- Old model: a rider held exactly ONE order — capacity was gated by riders.is_available (bool) +
-- riders.current_order_id (single FK). When every rider was "busy", auto-assign found nobody and the
-- order was silently orphaned (no owner, nothing re-drove assignment). See app/api/shop/checkout and
-- app/api/shop/orders/[id].
--
-- New model: a rider works a QUEUE of orders and completes them in any sequence. is_available now
-- means "on shift / accepting new orders" (a duty switch, NOT a one-order lock). New delivery orders
-- are pushed to the on-shift rider with the fewest ACTIVE orders (even distribution), ties broken by
-- proximity of the rider to the pickup (vendor) location, then round-robin (least-recently-assigned).

-- ── riders: shift + geo + round-robin bookkeeping ──────────────────────────────
ALTER TABLE public.riders
  ADD COLUMN IF NOT EXISTS last_lat            numeric,       -- rider live/last-known latitude
  ADD COLUMN IF NOT EXISTS last_lng            numeric,       -- rider live/last-known longitude
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz,   -- when last_lat/lng was reported
  ADD COLUMN IF NOT EXISTS last_assigned_at    timestamptz;   -- last time an order was pushed here

-- Login moves to email-OTP; the self-set numeric PIN is no longer used for auth. Keep the column for
-- history but drop NOT NULL so riders can be created without one.
ALTER TABLE public.riders ALTER COLUMN pin_hash DROP NOT NULL;

-- ── entities: vendor pickup coordinates (nullable; used to weight rider proximity) ──
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric;

-- ── orders: assignment bookkeeping ─────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_at        timestamptz,               -- when pushed to a rider
  ADD COLUMN IF NOT EXISTS declined_rider_ids uuid[] NOT NULL DEFAULT '{}'; -- riders who rejected it

-- Active-load counting: a rider's in-progress deliveries. Partial index over the "active" states so
-- "how many orders does rider X have on the go" is a cheap index scan.
CREATE INDEX IF NOT EXISTS idx_orders_active_rider
  ON public.orders (rider_id)
  WHERE rider_id IS NOT NULL AND status IN ('CONFIRMED', 'PROCESSING', 'DISPATCHED');

-- ── one-time data hygiene: the meaning of is_available changed ──────────────────
-- current_order_id no longer gates capacity; clear it and put every ACTIVE rider on shift so the new
-- queue model starts clean. (Assignments live on orders.rider_id, not here.)
UPDATE public.riders
   SET current_order_id = NULL,
       is_available     = true
 WHERE is_active = true;
