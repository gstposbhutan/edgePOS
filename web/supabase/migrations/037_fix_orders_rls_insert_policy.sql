-- Migration 037: Fix Orders RLS Policy for INSERT Operations
-- Bug fix: Retailer cashiers cannot create orders because seller_own_orders policy
-- only had USING clause (for SELECT/UPDATE/DELETE) but no WITH CHECK clause (for INSERT)

-- ============================================================================
-- Background: RLS Policy Behavior
-- ============================================================================
-- FOR ALL USING (condition)     -- Applies to SELECT, UPDATE, DELETE
-- FOR ALL WITH CHECK (condition) -- Applies to INSERT, and UPDATE (new values)
-- FOR ALL USING (...) WITH CHECK (...) -- Applies to all operations

-- The existing seller_own_orders policy only had USING, so INSERT failed.
-- This migration recreates the policy with both USING and WITH CHECK.

-- ============================================================================
-- Fix: Recreate seller_own_orders policy with WITH CHECK clause
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS seller_own_orders ON orders;

-- Recreate with both USING and WITH CHECK clauses
CREATE POLICY seller_own_orders ON orders
  FOR ALL
  USING (seller_id = auth_entity_id())
  WITH CHECK (seller_id = auth_entity_id());

-- ============================================================================
-- Verification
-- ============================================================================

-- Test the fix by checking if a retailer can insert an order:
-- SET REQUEST jwt_claim.app_metadata TO '{"entity_id": "<retailer_id>", "role": "RETAILER"}';
-- INSERT INTO orders (order_type, order_no, seller_id, items, subtotal, gst_total, grand_total)
-- VALUES ('POS_SALE', 'TEST-123', '<retailer_id>', '[]', 0, 0, 0);

-- Expected: Insert succeeds
-- Before fix: Insert fails with "new row violates row-level security policy"
