-- 125 — P4 follow-up (2): re-home next_pos_order_no into the `pos` schema.
--
-- Migration 122 re-homed 8 app RPCs from public → pos but MISSED next_pos_order_no,
-- the atomic per-seller/per-year order-number allocator called on EVERY web POS sale
-- (apps/pos/app/api/pos/orders/route.js). Since the P4 flip (121) the pos service client
-- resolves rpc() against the `pos` PostgREST profile, so `pos.next_pos_order_no(...)` was
-- "not found in the schema cache" and checkout 500'd at order-number generation.
--
-- Same clean move as 122 — ALTER ... SET SCHEMA preserves ownership, grants and the
-- search_path=pos,public 121 pinned on it. Verified before moving: the only rpc caller is
-- the checkout (default pos client), there are zero .schema('public').rpc sites, no DB
-- function/trigger references it, and the desktop sync/ingest path does not use it.
-- Reload PostgREST afterwards: NOTIFY pgrst, 'reload schema';
--
-- Idempotent: only moves the function if it is still in public.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'next_pos_order_no'
  ) THEN
    ALTER FUNCTION public.next_pos_order_no(p_seller_id uuid, p_prefix text) SET SCHEMA pos;
  END IF;
END $$;
