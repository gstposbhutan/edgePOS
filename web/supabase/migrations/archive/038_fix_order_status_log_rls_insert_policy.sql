-- ────────────────────────────────────────────────────────────────────────────────
-- Migration 038: Fix order_status_log RLS INSERT Policy
-- Bug #003: Order creation fails with RLS violation on order_status_log
--
-- Problem: The log_order_status_change() trigger cannot INSERT into order_status_log
-- because existing RLS policies only have USING clause (SELECT/UPDATE/DELETE).
-- INSERT operations require WITH CHECK clause.
-- ────────────────────────────────────────────────────────────────────────────────

-- Drop existing SELECT-only policies and recreate with both USING and WITH CHECK

-- ── Seller-side policy (from migration 010) ─────────────────────────────────────
DROP POLICY IF EXISTS "read_own_order_logs" ON order_status_log;

CREATE POLICY "seller_own_order_status_logs" ON order_status_log
  FOR ALL
  USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  )
  WITH CHECK (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  );

-- ── Buyer-side policy (from migration 029) ───────────────────────────────────────
DROP POLICY IF EXISTS "buyer_order_status_log" ON order_status_log;

CREATE POLICY "buyer_own_order_status_logs" ON order_status_log
  FOR ALL
  USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  )
  WITH CHECK (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

-- ── Policy for system-triggered inserts (order status changes) ─────────────────
-- This allows the log_order_status_change() trigger to insert status logs
-- when orders are created or status changes, by checking the actor is related to the order
CREATE POLICY "system_order_status_logs" ON order_status_log
  FOR ALL
  USING (
    is_super_admin() OR
    -- Seller can read logs for their orders
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id()) OR
    -- Buyer can read logs for their orders
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  )
  WITH CHECK (
    is_super_admin() OR
    -- Allow inserts when the order belongs to the authenticated entity (seller or buyer)
    order_id IN (
      SELECT id FROM orders
      WHERE seller_id = auth_entity_id() OR buyer_id = auth_entity_id()
    )
  );
