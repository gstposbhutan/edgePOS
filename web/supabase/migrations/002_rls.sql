-- Migration 010: Row-Level Security Policies

-- Enable RLS
ALTER TABLE categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE products             ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailer_wholesalers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE replacements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION auth_entity_id() RETURNS UUID AS $$
  SELECT (auth.jwt() ->> 'entity_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_sub_role() RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'sub_role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN AS $$
  SELECT auth_role() = 'SUPER_ADMIN';
$$ LANGUAGE SQL STABLE;

-- Drop existing policies before recreating (safe re-run)
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- user_profiles
CREATE POLICY "users_read_own_profile" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR is_super_admin());

CREATE POLICY "users_update_own_profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- entities
CREATE POLICY "super_admin_all_entities" ON entities
  FOR ALL USING (is_super_admin());

CREATE POLICY "distributor_category_entities" ON entities
  FOR SELECT USING (
    auth_role() = 'DISTRIBUTOR' AND (
      id = auth_entity_id() OR
      id IN (
        SELECT ec.entity_id FROM entity_categories ec
        JOIN categories c ON c.id = ec.category_id
        WHERE c.distributor_id = auth_entity_id()
      )
    )
  );

CREATE POLICY "wholesaler_sees_retailers" ON entities
  FOR SELECT USING (
    auth_role() = 'WHOLESALER' AND (
      id = auth_entity_id() OR
      id IN (
        SELECT retailer_id FROM retailer_wholesalers
        WHERE wholesaler_id = auth_entity_id() AND active = TRUE
      )
    )
  );

CREATE POLICY "retailer_own_entity" ON entities
  FOR SELECT USING (
    auth_role() = 'RETAILER' AND id = auth_entity_id()
  );

-- orders
CREATE POLICY "super_admin_all_orders" ON orders
  FOR ALL USING (is_super_admin());

CREATE POLICY "seller_own_orders" ON orders
  FOR ALL USING (seller_id = auth_entity_id());

CREATE POLICY "wholesaler_retailer_orders" ON orders
  FOR SELECT USING (
    auth_role() = 'WHOLESALER' AND
    seller_id IN (
      SELECT retailer_id FROM retailer_wholesalers
      WHERE wholesaler_id = auth_entity_id() AND active = TRUE
    )
  );

CREATE POLICY "distributor_category_orders" ON orders
  FOR SELECT USING (
    auth_role() = 'DISTRIBUTOR' AND
    seller_id IN (
      SELECT ec.entity_id FROM entity_categories ec
      JOIN categories c ON c.id = ec.category_id
      WHERE c.distributor_id = auth_entity_id()
    )
  );

-- order_status_log
CREATE POLICY "read_own_order_logs" ON order_status_log
  FOR SELECT USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  );

-- payment_attempts
CREATE POLICY "payment_attempts_manager_plus" ON payment_attempts
  FOR SELECT USING (
    is_super_admin() OR (
      auth_sub_role() IN ('MANAGER', 'OWNER', 'ADMIN') AND
      order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
    )
  );

-- refunds
CREATE POLICY "refunds_own_entity" ON refunds
  FOR ALL USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  );

-- products
CREATE POLICY "products_public_read" ON products
  FOR SELECT USING (TRUE);

CREATE POLICY "products_entity_write" ON products
  FOR INSERT WITH CHECK (created_by = auth_entity_id());

CREATE POLICY "products_entity_update" ON products
  FOR UPDATE USING (created_by = auth_entity_id() OR is_super_admin());

-- inventory_movements
CREATE POLICY "inventory_own_entity" ON inventory_movements
  FOR ALL USING (
    is_super_admin() OR entity_id = auth_entity_id()
  );

-- audit_logs
CREATE POLICY "audit_logs_admin_read" ON audit_logs
  FOR SELECT USING (
    is_super_admin() OR auth_sub_role() IN ('OWNER', 'ADMIN')
  );

-- categories
CREATE POLICY "categories_read_all" ON categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "categories_distributor_manage" ON categories
  FOR ALL USING (
    is_super_admin() OR
    (auth_role() = 'DISTRIBUTOR' AND distributor_id = auth_entity_id())
  );
-- Migration 027: Fix RLS helper functions to read from app_metadata
--
-- Supabase nests custom claims (role, sub_role, entity_id) inside
-- app_metadata in the JWT. The original functions read from the top
-- level which returned wrong values:
--   auth_role()   -> 'authenticated' (Supabase auth role) instead of 'RETAILER'
--   auth_entity_id() -> NULL instead of the actual entity UUID
--   auth_sub_role()  -> NULL instead of 'CASHIER'/'MANAGER'/'OWNER'

CREATE OR REPLACE FUNCTION auth_entity_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'entity_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_sub_role() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'sub_role';
$$ LANGUAGE SQL STABLE;
-- Migration 028: Wholesaler signup RLS policies
-- Allows entity owners/managers to manage team member profiles,
-- and wholesalers to update their own entity details.

-- Team read: owners and managers can see all profiles in their entity
CREATE POLICY "entity_owners_read_team" ON user_profiles
  FOR SELECT USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() IN ('OWNER', 'MANAGER')
  );

-- Team create: owners can add new team members
CREATE POLICY "entity_owners_manage_team" ON user_profiles
  FOR INSERT WITH CHECK (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Team update: owners can edit team member roles/permissions
CREATE POLICY "entity_owners_update_team" ON user_profiles
  FOR UPDATE USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Team delete: owners can remove team members
CREATE POLICY "entity_owners_delete_team" ON user_profiles
  FOR DELETE USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Wholesaler/distributor can update their own entity
CREATE POLICY "wholesaler_update_own_entity" ON entities
  FOR UPDATE USING (
    id = auth_entity_id()
    AND auth_role() IN ('WHOLESALER', 'DISTRIBUTOR')
  );
-- Migration 029: Wholesale order RLS + buyer restock trigger
-- Enables retailers to create/view WHOLESALE purchase orders,
-- and auto-restocks retailer inventory when orders are delivered.

-- ── Buyer-side RLS on orders ──────────────────────────────────────────────

CREATE POLICY "buyer_own_wholesale_orders" ON orders
  FOR SELECT USING (
    buyer_id = auth_entity_id()
  );

CREATE POLICY "retailer_create_wholesale_order" ON orders
  FOR INSERT WITH CHECK (
    buyer_id = auth_entity_id()
    AND order_type = 'WHOLESALE'
  );

-- Retailers need to update their own wholesale orders (for cancellation)
CREATE POLICY "buyer_update_wholesale_orders" ON orders
  FOR UPDATE USING (
    buyer_id = auth_entity_id()
    AND order_type = 'WHOLESALE'
  );

-- ── Buyer-side RLS on order_items ────────────────────────────────────────

CREATE POLICY "order_items_buyer_read" ON order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

CREATE POLICY "order_items_buyer_insert" ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

-- ── Buyer-side RLS on order_status_log ──────────────────────────────────

CREATE POLICY "buyer_order_status_log" ON order_status_log
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

-- ── Retailer connections visibility ──────────────────────────────────────

CREATE POLICY "retailer_own_connections" ON retailer_wholesalers
  FOR SELECT USING (
    retailer_id = auth_entity_id()
  );

-- ── Wholesaler can also read connections where they are the supplier ─────

CREATE POLICY "wholesaler_own_connections" ON retailer_wholesalers
  FOR SELECT USING (
    wholesaler_id = auth_entity_id()
  );

-- ── Index for buyer-side order queries ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_buyer_type ON orders(buyer_id, order_type);

-- ── Restock trigger: auto-create RESTOCK movements for buyer on delivery ─

CREATE OR REPLACE FUNCTION restock_buyer_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('DELIVERED', 'COMPLETED')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.order_type = 'WHOLESALE'
     AND NEW.buyer_id IS NOT NULL THEN

    INSERT INTO inventory_movements (id, product_id, entity_id, movement_type, quantity, reference_id, timestamp)
    SELECT
      gen_random_uuid(),
      oi.product_id,
      NEW.buyer_id,
      'RESTOCK',
      oi.quantity,
      NEW.id,
      NOW()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_restock_buyer ON orders;
CREATE TRIGGER orders_restock_buyer
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION restock_buyer_on_delivery();
-- Migration 030: Fix JWT claims location in access token hook
-- The hook was writing to event->'claims' but RLS functions read from app_metadata

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  app_metadata  JSONB;
  profile RECORD;
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles
  WHERE id = (event->>'user_id')::UUID;

  IF profile IS NULL THEN
    RETURN event;
  END IF;

  app_metadata := event->'app_metadata';
  app_metadata := jsonb_set(app_metadata, '{entity_id}',  to_jsonb(profile.entity_id::TEXT));
  app_metadata := jsonb_set(app_metadata, '{role}',        to_jsonb(profile.role));
  app_metadata := jsonb_set(app_metadata, '{sub_role}',    to_jsonb(profile.sub_role));
  app_metadata := jsonb_set(app_metadata, '{permissions}', to_jsonb(profile.permissions));

  RETURN jsonb_set(event, '{app_metadata}', app_metadata);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
-- Migration 031: Allow retailers to read wholesaler entities they're connected to
-- This is needed for the vendor restock feature to display wholesaler names

CREATE POLICY "retailer_read_connected_wholesalers" ON entities
  FOR SELECT USING (
    auth_role() = 'RETAILER' AND id IN (
      SELECT wholesaler_id FROM retailer_wholesalers
      WHERE retailer_id = auth_entity_id() AND active = TRUE
    )
  );
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
-- Migration 042: Add service role bypass policy for user_profiles
-- Allows service role client to read/write user_profiles for authentication flows

-- Drop existing policies
DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;

-- Create new policies that also allow service role
CREATE POLICY "users_read_own_profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR auth.jwt()->>'role' = 'service_role');

CREATE POLICY "service_role_all_user_profiles" ON user_profiles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "users_update_own_profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "service_role_insert_user_profiles" ON user_profiles
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
-- Migration 043: Add service role bypass policy for entities
-- Allows service role client to create entities for customer signup

CREATE POLICY "service_role_all_entities" ON entities
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "service_role_insert_entities" ON entities
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
-- Migration 044: DISABLE RLS for development
-- Re-enable with migration 045_enable_rls_prod.sql when ready

ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE carts DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE face_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_repayments DISABLE ROW LEVEL SECURITY;
-- Tables created in later migrations — RLS disabled in their own migrations:
-- owner_stores (050), riders (047), wholesale_orders
-- ALTER TABLE wholesale_orders DISABLE ROW LEVEL SECURITY; -- May not exist yet

-- Note: These tables will be re-enabled in production
-- Migration 045: RE-ENABLE RLS for production
-- Run this when development is complete and ready for production

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wholesale_orders ENABLE ROW LEVEL SECURITY;
-- Disable RLS on all tables
-- Development convenience: all auth is handled at the application layer

ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE carts DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE category_properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE draft_purchase_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE draft_purchases DISABLE ROW LEVEL SECURITY;
ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE entity_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE entity_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE entity_product_specifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE entity_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE hsn_master DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_alerts DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_cancellation_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE owner_stores DISABLE ROW LEVEL SECURITY;
ALTER TABLE package_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE refunds DISABLE ROW LEVEL SECURITY;
ALTER TABLE replacements DISABLE ROW LEVEL SECURITY;
ALTER TABLE retailer_wholesalers DISABLE ROW LEVEL SECURITY;
ALTER TABLE riders DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_reconciliations DISABLE ROW LEVEL SECURITY;
ALTER TABLE shift_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE shifts DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_lead_times DISABLE ROW LEVEL SECURITY;
ALTER TABLE units DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
