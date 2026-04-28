-- ────────────────────────────────────────────────────────────────────────────────
-- Migration 039: Fix Cart RLS INSERT Policies
-- Bug #004: Cashier cannot add products to cart due to missing WITH CHECK clause
--
-- Problem: The addItem function in use-cart cannot INSERT into cart_items
-- because existing RLS policies only have USING clause (SELECT/UPDATE/DELETE).
-- INSERT operations require WITH CHECK clause.
-- ────────────────────────────────────────────────────────────────────────────────

-- Drop existing SELECT-only policies and recreate with both USING and WITH CHECK

-- ── Carts table ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "carts_own_entity" ON carts;

CREATE POLICY "carts_own_entity" ON carts
  FOR ALL
  USING (is_super_admin() OR entity_id = auth_entity_id())
  WITH CHECK (is_super_admin() OR entity_id = auth_entity_id());

-- ── Cart items table ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cart_items_own_entity" ON cart_items;

CREATE POLICY "cart_items_own_entity" ON cart_items
  FOR ALL
  USING (
    is_super_admin() OR
    cart_id IN (SELECT id FROM carts WHERE entity_id = auth_entity_id())
  )
  WITH CHECK (
    is_super_admin() OR
    cart_id IN (SELECT id FROM carts WHERE entity_id = auth_entity_id())
  );
