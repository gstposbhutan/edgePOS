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
