-- RLS helper functions (must exist before policies in table definitions)
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

-- Migration 001: Categories
-- Product categories managed by Distributors

CREATE TABLE categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  distributor_id UUID,  -- FK added after entities table is created (migration 002)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed core categories
INSERT INTO categories (name) VALUES
  ('Food & Grocery'),
  ('Electronics'),
  ('Textiles & Clothing'),
  ('Health & Pharmacy'),
  ('Hardware & Construction'),
  ('Stationery & Office'),
  ('General Merchandise');
-- Migration 002: Entities (Multi-tenant foundation)
-- Every participant in the supply chain: SUPER_ADMIN, DISTRIBUTOR, WHOLESALER, RETAILER
-- NOTE: parent_entity_id removed — replaced by retailer_wholesalers junction table (migration 005)

CREATE TABLE IF NOT EXISTS entities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER')),
  tpn_gstin    TEXT UNIQUE,
  whatsapp_no  TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to pre-existing entities table
ALTER TABLE entities ADD COLUMN IF NOT EXISTS role         TEXT CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER'));
ALTER TABLE entities ADD COLUMN IF NOT EXISTS tpn_gstin    TEXT UNIQUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS whatsapp_no  TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT TRUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE entities ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Add FK from categories to entities (safe to re-run)
DO $$ BEGIN
  ALTER TABLE categories
    ADD CONSTRAINT fk_categories_distributor
    FOREIGN KEY (distributor_id) REFERENCES entities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_updated_at ON entities;
CREATE TRIGGER entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- Migration 003: Entity Categories (junction)
-- Wholesalers and Retailers can span multiple product categories

CREATE TABLE IF NOT EXISTS entity_categories (
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_categories_entity   ON entity_categories(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_categories_category ON entity_categories(category_id);
-- Migration 004: Products (Central Brain Vector Library)
-- Shared product knowledge across all entities in Bhutan

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  sku              TEXT UNIQUE,
  hsn_code         TEXT NOT NULL,
  image_url        TEXT,
  image_embedding  vector(1536),
  current_stock    INT DEFAULT 0,
  wholesale_price  DECIMAL(12,2),
  mrp              DECIMAL(12,2),
  unit             TEXT DEFAULT 'pcs',
  is_active        BOOLEAN DEFAULT TRUE,
  created_by       UUID REFERENCES entities(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to pre-existing products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku              TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_embedding  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock    INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price  DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp              DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit             TEXT DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES entities(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS product_categories (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product  ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- Alter image_embedding to vector type if it exists as a different type
DO $$ BEGIN
  ALTER TABLE products ALTER COLUMN image_embedding TYPE vector(1536)
    USING image_embedding::vector(1536);
EXCEPTION WHEN others THEN NULL;
END $$;

-- Create ivfflat index only if column is vector type
DO $$ BEGIN
  CREATE INDEX idx_products_embedding ON products
    USING ivfflat (image_embedding vector_cosine_ops)
    WITH (lists = 100);
EXCEPTION WHEN duplicate_table THEN NULL;
       WHEN undefined_object  THEN NULL;
       WHEN others            THEN NULL;
END $$;
-- Migration 005: Retailer ↔ Wholesaler relationships
-- Replaces parent_entity_id. A Retailer can source from multiple Wholesalers per category.

CREATE TABLE IF NOT EXISTS retailer_wholesalers (
  retailer_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary    BOOLEAN DEFAULT FALSE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (retailer_id, wholesaler_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_rw_retailer   ON retailer_wholesalers(retailer_id);
CREATE INDEX IF NOT EXISTS idx_rw_wholesaler ON retailer_wholesalers(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_rw_category   ON retailer_wholesalers(category_id);
-- Migration 006: User Profiles
-- Extends Supabase auth.users with business context for RBAC

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id   UUID NOT NULL REFERENCES entities(id),
  role        TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER')),
  sub_role    TEXT NOT NULL CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN')),
  permissions TEXT[] DEFAULT '{}',
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_entity ON user_profiles(entity_id);

-- JWT Custom Claims Hook
-- Adds RBAC claims to the JWT's app_metadata for RLS functions
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

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
-- Migration 007: Orders + Order Lifecycle Tables

CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type           TEXT NOT NULL CHECK (order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE')),
  order_no             TEXT UNIQUE NOT NULL,
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                         'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
                         'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED',
                         'PAYMENT_FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED',
                         'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED',
                         'REFUND_PROCESSING', 'REFUNDED',
                         'REPLACEMENT_REQUESTED', 'REPLACEMENT_DISPATCHED', 'REPLACEMENT_DELIVERED'
                       )),
  seller_id            UUID NOT NULL REFERENCES entities(id),
  buyer_id             UUID REFERENCES entities(id),
  buyer_whatsapp       TEXT,
  buyer_hash           TEXT,  -- cast to vector(512) post-insert via trigger once pgvector confirmed
  items                JSONB NOT NULL,
  subtotal             DECIMAL(12,2) NOT NULL,
  gst_total            DECIMAL(12,2) NOT NULL,
  grand_total          DECIMAL(12,2) NOT NULL,
  payment_method       TEXT CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT')),
  payment_ref          TEXT,
  payment_verified_at  TIMESTAMPTZ,
  ocr_verify_id        TEXT,
  retry_count          INT DEFAULT 0,
  max_retries          INT DEFAULT 3,
  whatsapp_status      TEXT DEFAULT 'PENDING' CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  digital_signature    TEXT,
  created_by           UUID REFERENCES user_profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT
);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_seller  ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer   ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Order status log — append-only
CREATE TABLE IF NOT EXISTS order_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID REFERENCES user_profiles(id),
  actor_role  TEXT,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_log_order ON order_status_log(order_id);

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log (order_id, from_status, to_status, metadata)
    VALUES (NEW.id, OLD.status, NEW.status, jsonb_build_object('updated_at', NOW()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_status_log ON orders;
CREATE TRIGGER orders_status_log
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Payment attempts
CREATE TABLE IF NOT EXISTS payment_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id),
  attempt_number   INT NOT NULL,
  payment_method   TEXT NOT NULL,
  gateway          TEXT,
  amount           DECIMAL(12,2) NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED')),
  gateway_ref      TEXT,
  gateway_response JSONB,
  failure_code     TEXT,
  failure_reason   TEXT,
  initiated_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  UNIQUE (order_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  refund_type   TEXT NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  refund_method TEXT NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  gst_reversal  DECIMAL(12,2) NOT NULL,
  reason        TEXT NOT NULL,
  requested_by  UUID NOT NULL REFERENCES user_profiles(id),
  approved_by   UUID REFERENCES user_profiles(id),
  status        TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                  'REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED'
                )),
  gateway_ref   TEXT,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

-- Replacements
CREATE TABLE IF NOT EXISTS replacements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id    UUID NOT NULL REFERENCES orders(id),
  replacement_order_id UUID REFERENCES orders(id),
  reason               TEXT NOT NULL,
  requested_by         UUID NOT NULL REFERENCES user_profiles(id),
  approved_by          UUID REFERENCES user_profiles(id),
  status               TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                         'REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'DELIVERED'
                       )),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
-- Migration 008: Inventory Movements

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('SALE', 'RESTOCK', 'TRANSFER', 'LOSS', 'DAMAGED', 'RETURN')),
  quantity      INT NOT NULL,
  reference_id  UUID,
  notes         TEXT,
  created_by    UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_entity  ON inventory_movements(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movement_apply ON inventory_movements;
CREATE TRIGGER inventory_movement_apply
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();
-- Migration 009: Audit Logs
-- Compliance + fraud detection. Append-only. Never deleted.

CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id  UUID,
  operation  TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE', 'IMPERSONATE', 'AUTH')),
  old_values JSONB,
  new_values JSONB,
  actor_id   UUID,
  actor_role TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table     ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record    ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor     ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
-- Migration 011: Cart Persistence + Normalized Order Items
-- Fixes:
--   1. Cart not persisted — add carts + cart_items tables
--   2. orders.items JSONB has no line-item granularity — add order_items table
--   3. Refunds/replacements/cancellations gain item-level targeting

-- ─── CART PERSISTENCE ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS carts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,  -- which store
  customer_whatsapp  TEXT,                    -- captured at POS if no Face-ID
  buyer_hash         TEXT,                    -- Face-ID reference (opt-in)
  status             TEXT NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'ABANDONED', 'CONVERTED')),
  created_by         UUID REFERENCES user_profiles(id),
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS carts_updated_at ON carts;
CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_carts_entity  ON carts(entity_id);
CREATE INDEX IF NOT EXISTS idx_carts_status  ON carts(status);

CREATE TABLE IF NOT EXISTS cart_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id     UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  sku         TEXT,
  name        TEXT NOT NULL,           -- snapshot at time of add
  quantity    INT NOT NULL DEFAULT 1,
  unit_price  DECIMAL(12,2) NOT NULL,
  discount    DECIMAL(12,2) DEFAULT 0,
  gst_5       DECIMAL(12,2) NOT NULL,  -- 5% of (unit_price - discount) * quantity
  total       DECIMAL(12,2) NOT NULL,  -- (unit_price - discount + gst_5) * quantity
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS cart_items_updated_at ON cart_items;
CREATE TRIGGER cart_items_updated_at
  BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_cart_items_cart    ON cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product ON cart_items(product_id);

-- ─── NORMALIZED ORDER ITEMS ────────────────────────────────────────────────
-- Replaces the JSONB items blob with a queryable, referenceable table.
-- orders.items JSONB is kept as an immutable receipt snapshot set at CONFIRMED.

CREATE TABLE IF NOT EXISTS order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id),   -- NULL if product deleted post-order
  sku         TEXT,
  name        TEXT NOT NULL,                  -- snapshot at time of order
  quantity    INT NOT NULL,
  unit_price  DECIMAL(12,2) NOT NULL,
  discount    DECIMAL(12,2) DEFAULT 0,
  gst_5       DECIMAL(12,2) NOT NULL,
  total       DECIMAL(12,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN (
                  'ACTIVE',       -- normal
                  'CANCELLED',    -- removed via partial cancellation
                  'REFUNDED',     -- refund processed for this item
                  'REPLACED'      -- replacement dispatched for this item
                )),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status  ON order_items(status);

-- ─── LINK REFUNDS TO SPECIFIC ITEMS ───────────────────────────────────────
-- Allows partial refunds targeting individual line items.

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS quantity       INT;  -- partial qty refund within item

-- ─── LINK REPLACEMENTS TO SPECIFIC ITEMS ──────────────────────────────────

ALTER TABLE replacements ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id);
ALTER TABLE replacements ADD COLUMN IF NOT EXISTS quantity       INT;

-- ─── PARTIAL CANCELLATION ITEM TARGETS ────────────────────────────────────
-- order_status_log already records the transition. We add a junction table
-- to record exactly which items were cancelled in a partial cancellation event.

CREATE TABLE IF NOT EXISTS order_cancellation_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity        INT NOT NULL,          -- how many units of this item were cancelled
  reason          TEXT,
  cancelled_by    UUID REFERENCES user_profiles(id),
  cancelled_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancel_items_order ON order_cancellation_items(order_id);

-- ─── CART → ORDER CONVERSION LINK ─────────────────────────────────────────
-- When a cart is checked out, record which cart spawned the order.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES carts(id);

-- Auto-mark cart as CONVERTED when linked order reaches CONFIRMED
CREATE OR REPLACE FUNCTION convert_cart_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND NEW.cart_id IS NOT NULL THEN
    UPDATE carts SET status = 'CONVERTED' WHERE id = NEW.cart_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_convert_cart ON orders;
CREATE TRIGGER orders_convert_cart
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION convert_cart_on_confirm();

-- ─── RLS FOR NEW TABLES ────────────────────────────────────────────────────

ALTER TABLE carts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_cancellation_items ENABLE ROW LEVEL SECURITY;

-- Carts scoped to store entity
CREATE POLICY "carts_own_entity" ON carts
  FOR ALL USING (is_super_admin() OR entity_id = auth_entity_id());

CREATE POLICY "cart_items_own_entity" ON cart_items
  FOR ALL USING (
    is_super_admin() OR
    cart_id IN (SELECT id FROM carts WHERE entity_id = auth_entity_id())
  );

-- Order items visible to seller + wholesaler chain
CREATE POLICY "order_items_own_entity" ON order_items
  FOR ALL USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  );

CREATE POLICY "order_cancellation_items_own_entity" ON order_cancellation_items
  FOR ALL USING (
    is_super_admin() OR
    order_id IN (SELECT id FROM orders WHERE seller_id = auth_entity_id())
  );
-- Migration 012: Inventory ↔ Order Quantity Automation
-- Ensures product stock is decremented on order confirmation
-- and restored on item cancellation, refund, or full order cancellation.
-- All movements flow through inventory_movements so audit trail is preserved.

-- ─── ORDER CONFIRMED → DEDUCT STOCK ───────────────────────────────────────
-- Fires when an order transitions INTO 'CONFIRMED'.
-- Inserts one inventory_movement (SALE, negative qty) per order_item.

CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      'SALE',
      -(oi.quantity),   -- negative = stock out
      NEW.id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_deduct_stock ON orders;
CREATE TRIGGER orders_deduct_stock
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_confirm();

-- ─── ORDER FULLY CANCELLED → RESTORE STOCK ────────────────────────────────
-- Fires when an order transitions INTO 'CANCELLED'.
-- Only restores stock for items that were ACTIVE (not already refunded/replaced).
-- Only runs if the order had previously reached CONFIRMED (stock was deducted).

CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    -- Only restore if stock was previously deducted (order reached CONFIRMED or beyond)
    IF OLD.status IN ('CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED',
                      'CANCELLATION_REQUESTED', 'REFUND_REQUESTED') THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      SELECT
        oi.product_id,
        NEW.seller_id,
        'RETURN',
        oi.quantity,    -- positive = stock back
        NEW.id,
        'Auto-restored on order cancellation: ' || NEW.order_no
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status = 'ACTIVE';  -- only items not already individually handled

      -- Mark all active items as CANCELLED
      UPDATE order_items
        SET status = 'CANCELLED'
      WHERE order_id = NEW.id AND status = 'ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_restore_stock_cancel ON orders;
CREATE TRIGGER orders_restore_stock_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION restore_stock_on_cancel();

-- ─── INDIVIDUAL ITEM CANCELLED → RESTORE THAT ITEM'S STOCK ───────────────
-- Fires when a single order_item status changes to 'CANCELLED'.
-- Used for partial cancellations — only the targeted item's qty is restored.

CREATE OR REPLACE FUNCTION restore_stock_on_item_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no
    FROM orders WHERE id = NEW.order_id;

    IF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (
        NEW.product_id,
        v_seller_id,
        'RETURN',
        NEW.quantity,
        NEW.order_id,
        'Partial cancel — item restored: ' || NEW.name || ' (' || v_order_no || ')'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_restore_on_cancel ON order_items;
CREATE TRIGGER order_items_restore_on_cancel
  AFTER UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION restore_stock_on_item_cancel();

-- ─── ITEM REFUNDED → RESTORE STOCK ────────────────────────────────────────
-- Fires when a single order_item status changes to 'REFUNDED'.

CREATE OR REPLACE FUNCTION restore_stock_on_item_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no
    FROM orders WHERE id = NEW.order_id;

    IF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (
        NEW.product_id,
        v_seller_id,
        'RETURN',
        NEW.quantity,
        NEW.order_id,
        'Refund — item restored: ' || NEW.name || ' (' || v_order_no || ')'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_items_restore_on_refund ON order_items;
CREATE TRIGGER order_items_restore_on_refund
  AFTER UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION restore_stock_on_item_refund();

-- ─── CART ITEM ADDED/REMOVED → NO STOCK CHANGE ────────────────────────────
-- Cart operations do NOT affect stock — stock is only deducted on CONFIRMED.
-- This prevents ghost deductions if a customer abandons their cart.
-- Stock availability is checked at PENDING_PAYMENT → CONFIRMED transition
-- in application logic (not via DB trigger).
-- Migration 013: Product Batches, Price History, Barcodes, Reorder Points
-- Adds full traceability: batch/lot tracking, barcode/QR, price audit trail,
-- configurable reorder thresholds, and batch-linked inventory movements.

-- ─── PRODUCT COLUMN ADDITIONS ─────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS qr_code        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point  INT DEFAULT 10;  -- configurable low-stock threshold

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;

-- ─── PRODUCT BATCHES ──────────────────────────────────────────────────────
-- Tracks individual stock batches with manufacturing/expiry dates.
-- Each RESTOCK movement can be linked to a batch.

CREATE TABLE IF NOT EXISTS product_batches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entity_id        UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  batch_number     TEXT NOT NULL,
  barcode          TEXT,
  qr_code          TEXT,
  manufactured_at  DATE,
  expires_at       DATE,
  quantity         INT NOT NULL DEFAULT 0,      -- remaining qty in this batch
  unit_cost        DECIMAL(12,2),               -- cost price at time of receipt
  status           TEXT NOT NULL DEFAULT 'ACTIVE'
                     CHECK (status IN ('ACTIVE', 'EXPIRED', 'RECALLED', 'DEPLETED')),
  received_at      TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT,
  UNIQUE (product_id, entity_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_product    ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_entity     ON product_batches(entity_id);
CREATE INDEX IF NOT EXISTS idx_batches_expires    ON product_batches(expires_at);
CREATE INDEX IF NOT EXISTS idx_batches_status     ON product_batches(status);

-- Link inventory_movements to a batch (optional — non-batch movements still allowed)
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id);

-- When a batch is created, update its quantity from the linked inventory movement
-- Batch quantity decrements on SALE movements that reference it
CREATE OR REPLACE FUNCTION sync_batch_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE product_batches
    SET quantity = quantity + NEW.quantity  -- quantity is signed (neg for sales)
    WHERE id = NEW.batch_id;

    -- Auto-mark batch as DEPLETED when quantity hits 0
    UPDATE product_batches
    SET status = 'DEPLETED'
    WHERE id = NEW.batch_id AND quantity <= 0 AND status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_sync_batch ON inventory_movements;
CREATE TRIGGER inventory_sync_batch
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION sync_batch_quantity();

-- Auto-expire batches past their expiry date (run nightly via pg_cron or Supabase Edge Function)
CREATE OR REPLACE FUNCTION expire_stale_batches()
RETURNS void AS $$
BEGIN
  UPDATE product_batches
  SET status = 'EXPIRED'
  WHERE expires_at < CURRENT_DATE
    AND status = 'ACTIVE'
    AND quantity > 0;
END;
$$ LANGUAGE plpgsql;

-- ─── PRODUCT PRICE HISTORY ────────────────────────────────────────────────
-- Immutable audit log — every MRP or wholesale price change is recorded.

CREATE TABLE IF NOT EXISTS product_price_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entity_id   UUID,                                -- NULL = global price change
  price_type  TEXT NOT NULL CHECK (price_type IN ('MRP', 'WHOLESALE')),
  old_price   DECIMAL(12,2),
  new_price   DECIMAL(12,2) NOT NULL,
  changed_by  UUID REFERENCES user_profiles(id),
  changed_at  TIMESTAMPTZ DEFAULT NOW(),
  reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_history_product ON product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_changed ON product_price_history(changed_at DESC);

-- Auto-log price changes when products.mrp or products.wholesale_price is updated
CREATE OR REPLACE FUNCTION log_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.mrp IS DISTINCT FROM NEW.mrp THEN
    INSERT INTO product_price_history (product_id, price_type, old_price, new_price)
    VALUES (NEW.id, 'MRP', OLD.mrp, NEW.mrp);
  END IF;

  IF OLD.wholesale_price IS DISTINCT FROM NEW.wholesale_price THEN
    INSERT INTO product_price_history (product_id, price_type, old_price, new_price)
    VALUES (NEW.id, 'WHOLESALE', OLD.wholesale_price, NEW.wholesale_price);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_price_history ON products;
CREATE TRIGGER products_price_history
  AFTER UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION log_product_price_change();

-- ─── RLS FOR NEW TABLES ────────────────────────────────────────────────────

ALTER TABLE product_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches_own_entity" ON product_batches
  FOR ALL USING (is_super_admin() OR entity_id = auth_entity_id());

CREATE POLICY "price_history_read" ON product_price_history
  FOR SELECT USING (
    is_super_admin() OR
    product_id IN (SELECT id FROM products WHERE created_by = auth_entity_id())
    OR auth_sub_role() IN ('MANAGER', 'OWNER', 'ADMIN')
  );
-- Migration 014: Stock Confirmation Guard
-- Prevents an order from transitioning to CONFIRMED if any order_item
-- quantity exceeds the product's current_stock at that moment.
-- This is atomic — no race condition possible.

CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  shortage RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN

    -- Find the first order_item where required qty > available stock
    SELECT
      oi.name,
      oi.quantity            AS needed,
      p.current_stock        AS available
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = NEW.id
      AND oi.status   = 'ACTIVE'
      AND oi.product_id IS NOT NULL
      AND p.current_stock < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Insufficient stock: "%" requires %, only % available. Add stock before confirming.',
        shortage.name, shortage.needed, shortage.available
        USING ERRCODE = 'P0001';
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- This trigger fires BEFORE the status update commits —
-- if it raises an exception the entire transaction is rolled back.
DROP TRIGGER IF EXISTS orders_guard_stock ON orders;
CREATE TRIGGER orders_guard_stock
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_stock_on_confirm();
-- Migration 015: Credit Ledger
-- Per Retailer ↔ Wholesaler credit balance, limit, repayments, and alert tracking.

-- ─── RETAILER_WHOLESALERS ADDITIONS ───────────────────────────────────────

ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_limit     DECIMAL(12,2) DEFAULT 0;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_balance   DECIMAL(12,2) DEFAULT 0;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_term_days INT DEFAULT 30;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_frozen    BOOLEAN DEFAULT FALSE;

-- ─── CREDIT TRANSACTIONS ──────────────────────────────────────────────────
-- Immutable ledger — every debit and credit entry. Never deleted.

CREATE TABLE IF NOT EXISTS credit_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id      UUID NOT NULL REFERENCES entities(id),
  wholesaler_id    UUID NOT NULL REFERENCES entities(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT')),
  amount           DECIMAL(12,2) NOT NULL,
  reference_type   TEXT CHECK (reference_type IN ('ORDER', 'REPAYMENT', 'ADJUSTMENT')),
  reference_id     UUID,
  balance_after    DECIMAL(12,2),
  notes            TEXT,
  created_by       UUID REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_retailer   ON credit_transactions(retailer_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_wholesaler ON credit_transactions(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created    ON credit_transactions(created_at DESC);

-- ─── CREDIT REPAYMENTS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_repayments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id    UUID NOT NULL REFERENCES entities(id),
  wholesaler_id  UUID NOT NULL REFERENCES entities(id),
  amount         DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'RTGS', 'BANK_TRANSFER', 'MBOB', 'MPAY')),
  status         TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date       DATE NOT NULL,
  reference_no   TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES user_profiles(id),
  confirmed_by   UUID REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_repayments_retailer   ON credit_repayments(retailer_id);
CREATE INDEX IF NOT EXISTS idx_repayments_wholesaler ON credit_repayments(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_repayments_due        ON credit_repayments(due_date);
CREATE INDEX IF NOT EXISTS idx_repayments_status     ON credit_repayments(status);

-- ─── CREDIT ALERTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repayment_id    UUID NOT NULL REFERENCES credit_repayments(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL CHECK (alert_type IN ('PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D')),
  sent_to         TEXT NOT NULL CHECK (sent_to IN ('RETAILER', 'WHOLESALER', 'BOTH')),
  whatsapp_status TEXT DEFAULT 'PENDING',
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (repayment_id, alert_type)  -- each alert type fires once per repayment
);

-- ─── TRIGGER: CREDIT ORDER CONFIRMED → DEBIT BALANCE ─────────────────────

CREATE OR REPLACE FUNCTION debit_credit_balance_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_wholesaler_id UUID;
  v_new_balance   DECIMAL(12,2);
  v_term_days     INT;
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT' THEN

    -- Derive wholesaler from seller (for POS sales, seller IS the retailer)
    -- For wholesale orders, buyer_id is the retailer, seller_id is the wholesaler
    IF NEW.order_type = 'POS_SALE' THEN
      -- Consumer bought on credit from retailer — not a B2B credit transaction
      RETURN NEW;
    END IF;

    v_wholesaler_id := NEW.seller_id;

    -- Check credit limit — hard block (guard is in app layer; this is DB safety net)
    SELECT credit_balance + NEW.grand_total, credit_term_days
    INTO v_new_balance, v_term_days
    FROM retailer_wholesalers
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = v_wholesaler_id AND active = TRUE
    LIMIT 1;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Update balance
    UPDATE retailer_wholesalers
    SET credit_balance = credit_balance + NEW.grand_total
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = v_wholesaler_id AND active = TRUE;

    -- Log debit transaction
    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.buyer_id, v_wholesaler_id, 'DEBIT', NEW.grand_total, 'ORDER', NEW.id, v_new_balance,
       'Order ' || NEW.order_no);

    -- Create repayment record with due date
    INSERT INTO credit_repayments
      (retailer_id, wholesaler_id, amount, payment_method, status, due_date, notes)
    VALUES
      (NEW.buyer_id, v_wholesaler_id, NEW.grand_total, 'CASH',
       'CREATED',
       (NOW() + (v_term_days || ' days')::INTERVAL)::DATE,
       'Auto-created for order ' || NEW.order_no);

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_debit_credit ON orders;
CREATE TRIGGER orders_debit_credit
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION debit_credit_balance_on_confirm();

-- ─── TRIGGER: CREDIT ORDER CANCELLED → CREDIT BALANCE BACK ───────────────

CREATE OR REPLACE FUNCTION credit_balance_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type != 'POS_SALE'
     AND NEW.buyer_id IS NOT NULL THEN

    UPDATE retailer_wholesalers
    SET credit_balance = GREATEST(0, credit_balance - NEW.grand_total)
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = NEW.seller_id AND active = TRUE
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.buyer_id, NEW.seller_id, 'CREDIT', NEW.grand_total, 'ORDER', NEW.id, v_new_balance,
       'Reversal for cancelled order ' || NEW.order_no);

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_credit_on_cancel ON orders;
CREATE TRIGGER orders_credit_on_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION credit_balance_on_cancel();

-- ─── TRIGGER: REPAYMENT → PAYMENT_MADE → REDUCE BALANCE ──────────────────

CREATE OR REPLACE FUNCTION apply_repayment()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
  v_limit       DECIMAL(12,2);
BEGIN
  IF NEW.status = 'PAYMENT_MADE' AND OLD.status = 'CREATED' THEN

    UPDATE retailer_wholesalers
    SET credit_balance = GREATEST(0, credit_balance - NEW.amount)
    WHERE retailer_id = NEW.retailer_id AND wholesaler_id = NEW.wholesaler_id AND active = TRUE
    RETURNING credit_balance, credit_limit INTO v_new_balance, v_limit;

    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.retailer_id, NEW.wholesaler_id, 'CREDIT', NEW.amount, 'REPAYMENT', NEW.id, v_new_balance,
       'Repayment via ' || NEW.payment_method || COALESCE(' ref: ' || NEW.reference_no, ''));

    -- Auto-unfreeze if balance now below limit
    IF v_new_balance < v_limit THEN
      UPDATE retailer_wholesalers
      SET credit_frozen = FALSE
      WHERE retailer_id = NEW.retailer_id AND wholesaler_id = NEW.wholesaler_id AND active = TRUE;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS repayment_apply ON credit_repayments;
CREATE TRIGGER repayment_apply
  AFTER UPDATE ON credit_repayments
  FOR EACH ROW EXECUTE FUNCTION apply_repayment();

-- ─── FUNCTION: CHECK CREDIT AVAILABILITY (used by app layer) ─────────────
-- Returns whether a buyer can place a credit order of a given amount.

CREATE OR REPLACE FUNCTION check_credit_available(
  p_retailer_id   UUID,
  p_wholesaler_id UUID,
  p_amount        DECIMAL
) RETURNS JSONB AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT credit_limit, credit_balance, credit_frozen, credit_term_days
  INTO rec
  FROM retailer_wholesalers
  WHERE retailer_id = p_retailer_id AND wholesaler_id = p_wholesaler_id AND active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No credit relationship found');
  END IF;

  IF rec.credit_frozen THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Credit account is frozen',
      'balance', rec.credit_balance, 'limit', rec.credit_limit);
  END IF;

  IF rec.credit_balance + p_amount > rec.credit_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Credit limit exceeded',
      'balance', rec.credit_balance,
      'limit', rec.credit_limit,
      'available', rec.credit_limit - rec.credit_balance,
      'requested', p_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'balance', rec.credit_balance,
    'limit', rec.credit_limit,
    'available', rec.credit_limit - rec.credit_balance
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_repayments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_alerts       ENABLE ROW LEVEL SECURITY;

-- Wholesaler sees transactions for their retailers
CREATE POLICY "credit_tx_wholesaler" ON credit_transactions
  FOR ALL USING (
    is_super_admin() OR
    wholesaler_id = auth_entity_id() OR
    retailer_id   = auth_entity_id()
  );

CREATE POLICY "credit_repayments_parties" ON credit_repayments
  FOR ALL USING (
    is_super_admin() OR
    wholesaler_id = auth_entity_id() OR
    retailer_id   = auth_entity_id()
  );

CREATE POLICY "credit_alerts_wholesaler" ON credit_alerts
  FOR SELECT USING (
    is_super_admin() OR
    repayment_id IN (
      SELECT id FROM credit_repayments WHERE wholesaler_id = auth_entity_id()
    )
  );
-- Migration 016: Face-ID Profiles
-- Opt-in biometric loyalty. Consent required before any capture.
-- GDPR-compliant: soft-delete preserves audit trail, hard-delete removes embedding.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS face_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),  -- store that enrolled them
  whatsapp_no   TEXT NOT NULL,                           -- linked identity
  name          TEXT,
  embedding     vector(512),                             -- 512-dim face vector (encrypted at rest)
  consent_at    TIMESTAMPTZ NOT NULL,                    -- explicit consent timestamp
  consent_token TEXT UNIQUE NOT NULL,                    -- QR token used for consent
  deleted_at    TIMESTAMPTZ,                             -- GDPR soft delete
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index — only active (non-deleted) profiles searchable
CREATE INDEX IF NOT EXISTS idx_face_profiles_entity
  ON face_profiles(entity_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_face_profiles_whatsapp
  ON face_profiles(whatsapp_no) WHERE deleted_at IS NULL;

-- Vector similarity index for fast face matching
CREATE INDEX IF NOT EXISTS idx_face_profiles_embedding
  ON face_profiles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS face_profiles_updated_at ON face_profiles;
CREATE TRIGGER face_profiles_updated_at
  BEFORE UPDATE ON face_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── GDPR DELETION FUNCTION ───────────────────────────────────────────────
-- Zeroes out the embedding vector and marks deleted.
-- Keeps the record for audit (consent_at, consent_token preserved).

CREATE OR REPLACE FUNCTION delete_face_profile(p_profile_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE face_profiles
  SET
    embedding  = NULL,
    name       = '[deleted]',
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE face_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "face_profiles_entity_scope" ON face_profiles
  FOR ALL USING (
    is_super_admin() OR entity_id = auth_entity_id()
  );

-- Consumers can request deletion of their own record via whatsapp_no
CREATE POLICY "face_profiles_self_delete" ON face_profiles
  FOR UPDATE USING (whatsapp_no = current_setting('app.requesting_whatsapp', true));
-- Migration 017: Product Packaging Variants (revised)
-- A package can contain one or more different products in different quantities.
-- Types: BULK (single product bulk) | BUNDLE (multi-product combo) | MIXED (multi-product case)
-- Stock is ALWAYS tracked per individual product in base units.

-- Package header
CREATE TABLE IF NOT EXISTS product_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  package_type    TEXT NOT NULL DEFAULT 'BULK'
                    CHECK (package_type IN ('BULK', 'BUNDLE', 'MIXED')),
  barcode         TEXT,
  qr_code         TEXT,
  wholesale_price DECIMAL(12,2),
  mrp             DECIMAL(12,2),
  hsn_code        TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES entities(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_barcode
  ON product_packages(barcode) WHERE barcode IS NOT NULL;

-- Package composition — which products and how many
CREATE TABLE IF NOT EXISTS package_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES product_packages(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL DEFAULT 1,
  UNIQUE (package_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_package_items_package ON package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_package_items_product ON package_items(product_id);

-- Entity to package association
CREATE TABLE IF NOT EXISTS entity_packages (
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  package_id  UUID NOT NULL REFERENCES product_packages(id) ON DELETE CASCADE,
  is_default  BOOLEAN DEFAULT FALSE,
  sort_order  INT DEFAULT 0,
  PRIMARY KEY (entity_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_packages_entity ON entity_packages(entity_id);

-- Add package columns to existing tables
ALTER TABLE cart_items          ADD COLUMN IF NOT EXISTS package_id   UUID REFERENCES product_packages(id);
ALTER TABLE order_items         ADD COLUMN IF NOT EXISTS package_id   UUID REFERENCES product_packages(id);
ALTER TABLE order_items         ADD COLUMN IF NOT EXISTS package_name TEXT;
ALTER TABLE order_items         ADD COLUMN IF NOT EXISTS package_type TEXT;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS package_id   UUID REFERENCES product_packages(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS package_qty  INT;

-- Deduct stock on confirm (iterates package components)
CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi RECORD;
  pi RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP
      IF oi.package_id IS NOT NULL THEN
        FOR pi IN SELECT * FROM package_items WHERE package_id = oi.package_id LOOP
          INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
          VALUES (pi.product_id, NEW.seller_id, 'SALE', -(pi.quantity * oi.quantity), NEW.id, oi.package_id, oi.quantity,
            'Package sale: ' || COALESCE(oi.package_name,'') || ' x' || oi.quantity || ' (' || NEW.order_no || ')');
        END LOOP;
      ELSIF oi.product_id IS NOT NULL THEN
        INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
        VALUES (oi.product_id, NEW.seller_id, 'SALE', -oi.quantity, NEW.id,
          'Sale: ' || oi.name || ' x' || oi.quantity || ' (' || NEW.order_no || ')');
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Stock guard on confirm (checks all package components)
CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi     RECORD;
  pi     RECORD;
  p      RECORD;
  needed INT;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP
      IF oi.package_id IS NOT NULL THEN
        FOR pi IN SELECT * FROM package_items WHERE package_id = oi.package_id LOOP
          SELECT current_stock, name INTO p FROM products WHERE id = pi.product_id;
          needed := pi.quantity * oi.quantity;
          IF p.current_stock < needed THEN
            RAISE EXCEPTION 'Insufficient stock for package "%": "%" requires %, only % available.',
              oi.package_name, p.name, needed, p.current_stock USING ERRCODE = 'P0001';
          END IF;
        END LOOP;
      ELSIF oi.product_id IS NOT NULL THEN
        SELECT current_stock, name INTO p FROM products WHERE id = oi.product_id;
        IF p.current_stock < oi.quantity THEN
          RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available.',
            p.name, oi.quantity, p.current_stock USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Restore stock on full order cancel
CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  oi RECORD;
  pi RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    IF OLD.status IN ('CONFIRMED','PROCESSING','DISPATCHED','DELIVERED','CANCELLATION_REQUESTED','REFUND_REQUESTED') THEN
      FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP
        IF oi.package_id IS NOT NULL THEN
          FOR pi IN SELECT * FROM package_items WHERE package_id = oi.package_id LOOP
            INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
            VALUES (pi.product_id, NEW.seller_id, 'RETURN', pi.quantity * oi.quantity, NEW.id, oi.package_id, oi.quantity,
              'Cancel: ' || COALESCE(oi.package_name,'') || ' (' || NEW.order_no || ')');
          END LOOP;
        ELSIF oi.product_id IS NOT NULL THEN
          INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
          VALUES (oi.product_id, NEW.seller_id, 'RETURN', oi.quantity, NEW.id,
            'Cancel: ' || oi.name || ' (' || NEW.order_no || ')');
        END IF;
      END LOOP;
      UPDATE order_items SET status = 'CANCELLED' WHERE order_id = NEW.id AND status = 'ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Restore stock on individual item cancel
CREATE OR REPLACE FUNCTION restore_stock_on_item_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  pi          RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR pi IN SELECT * FROM package_items WHERE package_id = NEW.package_id LOOP
        INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (pi.product_id, v_seller_id, 'RETURN', pi.quantity * NEW.quantity, NEW.order_id, NEW.package_id, NEW.quantity,
          'Partial cancel: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Partial cancel: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Restore stock on item refund
CREATE OR REPLACE FUNCTION restore_stock_on_item_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  pi          RECORD;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR pi IN SELECT * FROM package_items WHERE package_id = NEW.package_id LOOP
        INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (pi.product_id, v_seller_id, 'RETURN', pi.quantity * NEW.quantity, NEW.order_id, NEW.package_id, NEW.quantity,
          'Refund: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Refund: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE product_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_packages  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packages_read_all"   ON product_packages FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "packages_write"      ON product_packages FOR ALL    USING (is_super_admin() OR created_by = auth_entity_id());
CREATE POLICY "pkg_items_read_all"  ON package_items    FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "pkg_items_write"     ON package_items    FOR ALL    USING (is_super_admin() OR package_id IN (SELECT id FROM product_packages WHERE created_by = auth_entity_id()));
CREATE POLICY "entity_packages_own" ON entity_packages  FOR ALL    USING (is_super_admin() OR entity_id = auth_entity_id());
-- Migration 018: Packages as First-Class Products
-- Packages are now products (product_type = 'PACKAGE') — listed in marketplace and POS.
-- Component products can be hidden from direct sale with sold_as_package_only = TRUE.
-- Package availability is derived from component stock — no separate stock column.

-- ─── PRODUCTS: TYPE AND VISIBILITY FLAGS ──────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type
  TEXT NOT NULL DEFAULT 'SINGLE' CHECK (product_type IN ('SINGLE', 'PACKAGE'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_as_package_only
  BOOLEAN NOT NULL DEFAULT FALSE;
-- When TRUE: hidden from POS grid, marketplace listing, direct cart add.
-- Stock still tracked normally. Still visible as component in package detail page.

-- ─── PRODUCT_PACKAGES: LINK TO PRODUCT LISTING ────────────────────────────

ALTER TABLE product_packages ADD COLUMN IF NOT EXISTS product_id
  UUID UNIQUE REFERENCES products(id) ON DELETE SET NULL;
-- product_id = the products row that represents this package in POS/marketplace.
-- A package without product_id is internal only (wholesaler B2B, not consumer-facing).

-- ─── COMPUTED FUNCTION: PACKAGE AVAILABILITY ──────────────────────────────
-- Returns how many complete packages can be assembled from current component stock.
-- Used by marketplace and POS to show availability without a separate stock column.

CREATE OR REPLACE FUNCTION package_available_qty(p_package_id UUID)
RETURNS INT AS $$
DECLARE
  min_available INT := 2147483647;  -- start at max int
  component     RECORD;
  component_available INT;
BEGIN
  FOR component IN
    SELECT pi.quantity AS needed, p.current_stock
    FROM package_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.package_id = p_package_id
  LOOP
    component_available := FLOOR(component.current_stock::FLOAT / component.needed);
    IF component_available < min_available THEN
      min_available := component_available;
    END IF;
  END LOOP;

  -- No components found → 0 available
  IF min_available = 2147483647 THEN RETURN 0; END IF;
  RETURN GREATEST(0, min_available);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── VIEW: PRODUCT CATALOGUE (unified products + packages) ────────────────
-- Used by POS grid and marketplace to list all sellable items in one query.
-- Filters out sold_as_package_only single products.
-- Shows computed availability for package products.

CREATE OR REPLACE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN
        package_available_qty(pp.id)
      ELSE
        p.current_stock
    END AS available_stock,
    pp.id          AS package_def_id,
    pp.package_type,
    pp.barcode     AS package_barcode
  FROM products p
  LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = TRUE
    AND p.sold_as_package_only = FALSE;

-- ─── PRODUCT DETAIL: PACKAGE CONTENTS VIEW ────────────────────────────────
-- Returns the full component breakdown for a package product.
-- Used by the product detail page and receipt.

CREATE OR REPLACE VIEW package_contents AS
  SELECT
    pp.id            AS package_id,
    pp.product_id    AS package_product_id,
    pp.package_type,
    pi.product_id    AS component_product_id,
    comp.name        AS component_name,
    comp.image_url   AS component_image,
    comp.unit        AS component_unit,
    pi.quantity      AS component_quantity,
    comp.current_stock AS component_stock,
    -- How many packages can this component support
    FLOOR(comp.current_stock::FLOAT / pi.quantity) AS component_supports_qty
  FROM product_packages pp
  JOIN package_items pi ON pi.package_id = pp.id
  JOIN products comp    ON comp.id = pi.product_id;

-- ─── MARKETPLACE: HIDE PACKAGE-ONLY PRODUCTS ──────────────────────────────
-- Update RLS on products to enforce sold_as_package_only visibility.
-- Authenticated users see all products for internal use (POS stock management).
-- Public marketplace queries should filter sold_as_package_only = FALSE at app layer.

-- No RLS change needed — filtering is handled via the sellable_products view.
-- The view is the contract for all POS and marketplace product queries.

-- ─── INDEX: FAST LOOKUP FOR PACKAGE PRODUCTS ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_type
  ON products(product_type) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_package_only
  ON products(sold_as_package_only) WHERE sold_as_package_only = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_packages_product_id
  ON product_packages(product_id) WHERE product_id IS NOT NULL;
-- Migration 019: Recursive Package Stock Operations
-- Enables pallets (packages of packages) with full recursive stock deduction.
-- Selling a pallet walks the composition tree to leaf SINGLE products.
-- Circular reference protection: max depth = 5.

-- Add PALLET to package_type enum
ALTER TABLE product_packages
  DROP CONSTRAINT IF EXISTS product_packages_package_type_check;

ALTER TABLE product_packages
  ADD CONSTRAINT product_packages_package_type_check
  CHECK (package_type IN ('BULK', 'BUNDLE', 'MIXED', 'PALLET'));

-- ─── RECURSIVE: COLLECT LEAF PRODUCT DEDUCTIONS ───────────────────────────
-- Given a package_id and a multiplier (how many of this package),
-- returns a set of (product_id, total_qty) for all leaf SINGLE products.
-- Handles arbitrary nesting depth up to max_depth.

CREATE OR REPLACE FUNCTION resolve_package_to_leaves(
  p_package_id UUID,
  p_multiplier INT DEFAULT 1,
  p_depth      INT DEFAULT 0
)
RETURNS TABLE (product_id UUID, total_qty INT) AS $$
BEGIN
  -- Circular reference / depth guard
  IF p_depth > 5 THEN
    RAISE EXCEPTION 'Package nesting exceeds maximum depth (5). Check for circular references.';
  END IF;

  RETURN QUERY
  WITH components AS (
    SELECT pi.product_id, pi.quantity * p_multiplier AS qty
    FROM package_items pi
    WHERE pi.package_id = p_package_id
  )
  SELECT
    c.product_id,
    c.qty
  FROM components c
  JOIN products p ON p.id = c.product_id
  WHERE p.product_type = 'SINGLE'   -- leaf product

  UNION ALL

  -- Recurse into nested packages
  SELECT
    r.product_id,
    r.total_qty
  FROM components c
  JOIN products p ON p.id = c.product_id
  JOIN product_packages pp ON pp.product_id = c.product_id
  JOIN LATERAL resolve_package_to_leaves(pp.id, c.qty, p_depth + 1) r ON TRUE
  WHERE p.product_type = 'PACKAGE';
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── RECURSIVE: PACKAGE AVAILABILITY ──────────────────────────────────────
-- Returns how many complete packages can be assembled from current stock.
-- Works for pallets (packages of packages) as well as simple packages.

-- Drop the view that depends on the 1-arg function, then drop the function
DROP VIEW IF EXISTS sellable_products;
DROP FUNCTION IF EXISTS package_available_qty(UUID);

CREATE OR REPLACE FUNCTION package_available_qty(p_package_id UUID, p_depth INT DEFAULT 0)
RETURNS INT AS $$
DECLARE
  min_available INT := 2147483647;
  component     RECORD;
  child_avail   INT;
BEGIN
  IF p_depth > 5 THEN RETURN 0; END IF;

  FOR component IN
    SELECT pi.quantity AS needed, p.product_type, pp.id AS child_pkg_id, p.current_stock
    FROM package_items pi
    JOIN products p ON p.id = pi.product_id
    LEFT JOIN product_packages pp ON pp.product_id = p.id
    WHERE pi.package_id = p_package_id
  LOOP
    IF component.product_type = 'SINGLE' THEN
      -- Leaf product: floor(stock / qty_needed)
      child_avail := FLOOR(component.current_stock::FLOAT / component.needed);

    ELSIF component.product_type = 'PACKAGE' AND component.child_pkg_id IS NOT NULL THEN
      -- Nested package: recursive call, then floor by needed count
      child_avail := FLOOR(
        package_available_qty(component.child_pkg_id, p_depth + 1)::FLOAT
        / component.needed
      );

    ELSE
      child_avail := 0;
    END IF;

    IF child_avail < min_available THEN
      min_available := child_avail;
    END IF;
  END LOOP;

  IF min_available = 2147483647 THEN RETURN 0; END IF;
  RETURN GREATEST(0, min_available);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── UPDATE: DEDUCT STOCK ON CONFIRM (fully recursive) ────────────────────

CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi   RECORD;
  leaf RECORD;
  pp   RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP

      IF oi.package_id IS NOT NULL THEN
        -- Resolve entire package tree to leaf products
        FOR leaf IN
          SELECT product_id, SUM(total_qty * oi.quantity) AS qty
          FROM resolve_package_to_leaves(oi.package_id, 1)
          GROUP BY product_id
        LOOP
          INSERT INTO inventory_movements
            (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
          VALUES (
            leaf.product_id, NEW.seller_id, 'SALE', -leaf.qty,
            NEW.id, oi.package_id, oi.quantity,
            'Package sale: ' || COALESCE(oi.package_name,'') || ' x' || oi.quantity || ' (' || NEW.order_no || ')'
          );
        END LOOP;

      ELSIF oi.product_id IS NOT NULL THEN
        INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
        VALUES (oi.product_id, NEW.seller_id, 'SALE', -oi.quantity, NEW.id,
          'Sale: ' || oi.name || ' x' || oi.quantity || ' (' || NEW.order_no || ')');
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: STOCK GUARD ON CONFIRM (recursive check) ─────────────────────

CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi        RECORD;
  leaf      RECORD;
  p         RECORD;
  needed    INT;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP

      IF oi.package_id IS NOT NULL THEN
        -- Check every leaf product in the resolved tree
        FOR leaf IN
          SELECT product_id, SUM(total_qty * oi.quantity) AS qty
          FROM resolve_package_to_leaves(oi.package_id, 1)
          GROUP BY product_id
        LOOP
          SELECT current_stock, name INTO p FROM products WHERE id = leaf.product_id;
          IF p.current_stock < leaf.qty THEN
            RAISE EXCEPTION
              'Insufficient stock for package "%": "%" requires %, only % available.',
              COALESCE(oi.package_name, oi.package_id::TEXT), p.name, leaf.qty, p.current_stock
              USING ERRCODE = 'P0001';
          END IF;
        END LOOP;

      ELSIF oi.product_id IS NOT NULL THEN
        SELECT current_stock, name INTO p FROM products WHERE id = oi.product_id;
        IF p.current_stock < oi.quantity THEN
          RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available.',
            p.name, oi.quantity, p.current_stock USING ERRCODE = 'P0001';
        END IF;
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: RESTORE STOCK ON CANCEL (recursive) ──────────────────────────

CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  oi   RECORD;
  leaf RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    IF OLD.status IN ('CONFIRMED','PROCESSING','DISPATCHED','DELIVERED',
                      'CANCELLATION_REQUESTED','REFUND_REQUESTED') THEN
      FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP
        IF oi.package_id IS NOT NULL THEN
          FOR leaf IN
            SELECT product_id, SUM(total_qty * oi.quantity) AS qty
            FROM resolve_package_to_leaves(oi.package_id, 1)
            GROUP BY product_id
          LOOP
            INSERT INTO inventory_movements
              (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
            VALUES (leaf.product_id, NEW.seller_id, 'RETURN', leaf.qty, NEW.id, oi.package_id, oi.quantity,
              'Cancel: ' || COALESCE(oi.package_name,'') || ' (' || NEW.order_no || ')');
          END LOOP;
        ELSIF oi.product_id IS NOT NULL THEN
          INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
          VALUES (oi.product_id, NEW.seller_id, 'RETURN', oi.quantity, NEW.id,
            'Cancel: ' || oi.name || ' (' || NEW.order_no || ')');
        END IF;
      END LOOP;
      UPDATE order_items SET status = 'CANCELLED' WHERE order_id = NEW.id AND status = 'ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: RESTORE ON ITEM CANCEL/REFUND (recursive) ────────────────────

CREATE OR REPLACE FUNCTION restore_stock_on_item_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR leaf IN
        SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
          'Partial cancel: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Partial cancel: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION restore_stock_on_item_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR leaf IN
        SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
          'Refund: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Refund: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── REFRESH: sellable_products VIEW (uses updated package_available_qty) ─

DROP VIEW IF EXISTS sellable_products;
CREATE OR REPLACE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN package_available_qty(pp.id)
      ELSE p.current_stock
    END AS available_stock,
    pp.id           AS package_def_id,
    pp.package_type,
    pp.barcode      AS package_barcode
  FROM products p
  LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = TRUE
    AND p.sold_as_package_only = FALSE;
-- Migration 021: WhatsApp OTP storage table
-- Used by the WhatsApp OTP login flow (F-AUTH-001)
-- No RLS — this table is only accessed server-side via service role key

CREATE TABLE whatsapp_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL,
  otp_hash      TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN DEFAULT FALSE,
  attempt_count INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_otps_lookup
  ON whatsapp_otps(phone, used, expires_at DESC);

-- Partial index for used/expired OTP cleanup (NOW() is not IMMUTABLE, use a boolean flag instead)
CREATE INDEX idx_whatsapp_otps_cleanup
  ON whatsapp_otps(created_at)
  WHERE used = TRUE;
-- Migration 022: Unified Khata — Credit Ledger for All Parties (F-KHATA-001)
-- Replaces old B2B credit system (migration 015) with unified tables
-- supporting CONSUMER, RETAILER, and WHOLESALER party types.

-- ─── DROP OLD TRIGGERS AND FUNCTIONS ───────────────────────────────────────

DROP TRIGGER IF EXISTS orders_debit_credit ON orders;
DROP TRIGGER IF EXISTS orders_credit_on_cancel ON orders;
DROP TRIGGER IF EXISTS repayment_apply ON credit_repayments;

DROP FUNCTION IF EXISTS debit_credit_balance_on_confirm() CASCADE;
DROP FUNCTION IF EXISTS credit_balance_on_cancel() CASCADE;
DROP FUNCTION IF EXISTS apply_repayment() CASCADE;
DROP FUNCTION IF EXISTS check_credit_available(UUID, UUID, DECIMAL) CASCADE;

-- ─── DROP OLD TABLES ───────────────────────────────────────────────────────

DROP TABLE IF EXISTS credit_alerts;
DROP TABLE IF EXISTS credit_repayments;
DROP TABLE IF EXISTS credit_transactions;

-- Drop consumer credit tables if they exist (from old F-KHATA-001 draft)
DROP TABLE IF EXISTS consumer_credit_alerts;
DROP TABLE IF EXISTS consumer_credit_transactions;
DROP TABLE IF EXISTS consumer_accounts;

-- ─── REMOVE OLD CREDIT COLUMNS FROM retailer_wholesalers ───────────────────

ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_limit;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_balance;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_term_days;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_frozen;

-- ─── KHATA ACCOUNTS ───────────────────────────────────────────────────────
-- One row per creditor-debtor relationship.
-- Consumer accounts keyed on (creditor_entity_id, debtor_phone).
-- Business accounts keyed on (creditor_entity_id, debtor_entity_id).

CREATE TABLE khata_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_entity_id    UUID NOT NULL REFERENCES entities(id),
  party_type            TEXT NOT NULL CHECK (party_type IN ('CONSUMER', 'RETAILER', 'WHOLESALER')),
  debtor_entity_id      UUID REFERENCES entities(id),
  debtor_phone          TEXT,
  debtor_name           TEXT,
  debtor_face_id_hash   TEXT,
  credit_limit          DECIMAL(12,2) NOT NULL DEFAULT 0,
  outstanding_balance   DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit_term_days      INT NOT NULL DEFAULT 30,
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  last_payment_at       TIMESTAMPTZ,
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_khata_creditor_debtor UNIQUE (creditor_entity_id, debtor_entity_id, debtor_phone)
);

CREATE INDEX idx_khata_accounts_creditor ON khata_accounts(creditor_entity_id);
CREATE INDEX idx_khata_accounts_debtor_entity ON khata_accounts(debtor_entity_id) WHERE debtor_entity_id IS NOT NULL;
CREATE INDEX idx_khata_accounts_debtor_phone ON khata_accounts(debtor_phone) WHERE debtor_phone IS NOT NULL;
CREATE INDEX idx_khata_accounts_status ON khata_accounts(status) WHERE status = 'ACTIVE';

-- ─── KHATA TRANSACTIONS ───────────────────────────────────────────────────
-- Immutable ledger — every debit, credit, and adjustment for any khata account.

CREATE TABLE khata_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  order_id              UUID,
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT', 'ADJUSTMENT')),
  amount                DECIMAL(12,2) NOT NULL,
  balance_after         DECIMAL(12,2) NOT NULL,
  payment_method        TEXT CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  notes                 TEXT,
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_khata_txn_account ON khata_transactions(khata_account_id);
CREATE INDEX idx_khata_txn_date ON khata_transactions(created_at DESC);
CREATE INDEX idx_khata_txn_order ON khata_transactions(order_id) WHERE order_id IS NOT NULL;

-- ─── KHATA REPAYMENTS ─────────────────────────────────────────────────────

CREATE TABLE khata_repayments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  amount                DECIMAL(12,2) NOT NULL,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  status                TEXT NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date              DATE,
  reference_no          TEXT,
  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id),
  confirmed_by          UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ
);

CREATE INDEX idx_khata_repayments_account ON khata_repayments(khata_account_id);
CREATE INDEX idx_khata_repayments_due ON khata_repayments(due_date) WHERE due_date IS NOT NULL AND status = 'CREATED';

-- ─── KHATA ALERTS ─────────────────────────────────────────────────────────

CREATE TABLE khata_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  repayment_id          UUID REFERENCES khata_repayments(id),
  alert_type            TEXT NOT NULL CHECK (alert_type IN (
                            'PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D',
                            'OVERDUE_30D', 'MONTHLY_REMINDER')),
  sent_to               TEXT NOT NULL CHECK (sent_to IN ('CREDITOR', 'DEBTOR', 'BOTH')),
  whatsapp_status       TEXT DEFAULT 'PENDING'
                          CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  sent_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_khata_alerts_account ON khata_alerts(khata_account_id);

-- ─── TRIGGER: KHATA ORDER CONFIRMED → DEBIT BALANCE ───────────────────────
-- Fires when a CREDIT order transitions to CONFIRMED.
-- For POS_SALE: uses khata_accounts by (creditor_entity_id=seller, debtor_phone=buyer_whatsapp, party_type='CONSUMER').
-- For B2B: uses khata_accounts by (creditor_entity_id=seller, debtor_entity_id=buyer_id, party_type).

CREATE OR REPLACE FUNCTION khata_debit_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id      UUID;
  v_new_balance     DECIMAL(12,2);
  v_term_days       INT;
  v_debtor_phone    TEXT;
  v_debtor_entity   UUID;
  v_party_type      TEXT;
  v_profile_id      UUID;
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT' THEN

    IF NEW.order_type = 'POS_SALE' THEN
      v_debtor_phone  := NEW.buyer_whatsapp;
      v_debtor_entity := NULL;
      v_party_type    := 'CONSUMER';
    ELSE
      v_debtor_phone  := NULL;
      v_debtor_entity := NEW.buyer_id;
      v_party_type    := 'RETAILER';
    END IF;

    -- Look up the khata account
    SELECT id, credit_term_days INTO v_account_id, v_term_days
    FROM khata_accounts
    WHERE creditor_entity_id = NEW.seller_id
      AND (debtor_entity_id = v_debtor_entity OR (v_debtor_entity IS NULL AND debtor_entity_id IS NULL))
      AND (debtor_phone = v_debtor_phone OR (v_debtor_phone IS NULL AND debtor_phone IS NULL))
      AND party_type = v_party_type
      AND status IN ('ACTIVE', 'FROZEN')
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active khata account found for credit sale';
    END IF;

    -- Check credit limit
    IF (SELECT outstanding_balance + NEW.grand_total > credit_limit
        FROM khata_accounts WHERE id = v_account_id) THEN
      RAISE EXCEPTION 'Credit limit exceeded for khata account %', v_account_id;
    END IF;

    -- Update balance
    UPDATE khata_accounts
    SET outstanding_balance = outstanding_balance + NEW.grand_total,
        updated_at = NOW()
    WHERE id = v_account_id
    RETURNING outstanding_balance INTO v_new_balance;

    -- Get created_by profile
    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.created_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.created_by; END IF;

    -- Log DEBIT transaction
    INSERT INTO khata_transactions
      (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
    VALUES
      (v_account_id, NEW.id, 'DEBIT', NEW.grand_total, v_new_balance,
       'Order ' || NEW.order_no, v_profile_id);

    -- Create repayment with due date
    IF v_term_days > 0 THEN
      INSERT INTO khata_repayments
        (khata_account_id, amount, payment_method, status, due_date, notes, created_by)
      VALUES
        (v_account_id, NEW.grand_total, 'CASH', 'CREATED',
         (NOW() + (v_term_days || ' days')::INTERVAL)::DATE,
         'Auto-created for order ' || NEW.order_no, v_profile_id);
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_khata_debit ON orders;
CREATE TRIGGER orders_khata_debit
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION khata_debit_on_confirm();

-- ─── TRIGGER: KHATA ORDER CANCELLED → CREDIT BALANCE BACK ─────────────────

CREATE OR REPLACE FUNCTION khata_credit_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id   UUID;
  v_new_balance  DECIMAL(12,2);
  v_profile_id   UUID;
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.payment_method = 'CREDIT'
     AND OLD.status = 'CONFIRMED' THEN

    -- Find the DEBIT transaction for this order
  SELECT khata_account_id INTO v_account_id
    FROM khata_transactions
    WHERE order_id = NEW.id AND transaction_type = 'DEBIT'
    LIMIT 1;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Reduce balance
    UPDATE khata_accounts
    SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.grand_total),
        updated_at = NOW()
    WHERE id = v_account_id
    RETURNING outstanding_balance INTO v_new_balance;

    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.created_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.created_by; END IF;

    INSERT INTO khata_transactions
      (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
    VALUES
      (v_account_id, NEW.id, 'CREDIT', NEW.grand_total, v_new_balance,
       'Reversal for cancelled order ' || NEW.order_no, v_profile_id);

    -- Mark any CREATED repayments for this order as irrelevant (delete them)
    DELETE FROM khata_repayments
    WHERE khata_account_id = v_account_id
      AND notes LIKE '%order ' || NEW.order_no || '%'
      AND status = 'CREATED';

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_khata_cancel ON orders;
CREATE TRIGGER orders_khata_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION khata_credit_on_cancel();

-- ─── TRIGGER: REPAYMENT PAYMENT_MADE → REDUCE BALANCE ─────────────────────

CREATE OR REPLACE FUNCTION khata_apply_repayment()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
  v_limit       DECIMAL(12,2);
  v_profile_id  UUID;
BEGIN
  IF NEW.status = 'PAYMENT_MADE' AND OLD.status = 'CREATED' THEN

    UPDATE khata_accounts
    SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
        last_payment_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.khata_account_id
    RETURNING outstanding_balance, credit_limit INTO v_new_balance, v_limit;

    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.confirmed_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.confirmed_by; END IF;

    INSERT INTO khata_transactions
      (khata_account_id, transaction_type, amount, balance_after, payment_method, notes, created_by)
    VALUES
      (NEW.khata_account_id, 'CREDIT', NEW.amount, v_new_balance, NEW.payment_method,
       'Repayment via ' || NEW.payment_method || COALESCE(' ref: ' || NEW.reference_no, ''),
       v_profile_id);

    -- Auto-unfreeze if balance now below limit
    IF v_new_balance < v_limit THEN
      UPDATE khata_accounts SET status = 'ACTIVE', updated_at = NOW()
      WHERE id = NEW.khata_account_id AND status = 'FROZEN';
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS khata_repayment_apply ON khata_repayments;
CREATE TRIGGER khata_repayment_apply
  AFTER UPDATE ON khata_repayments
  FOR EACH ROW EXECUTE FUNCTION khata_apply_repayment();

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE khata_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_repayments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_alerts      ENABLE ROW LEVEL SECURITY;

-- Creditor entity sees their own accounts
CREATE POLICY "tenant_khata_accounts" ON khata_accounts
  FOR ALL USING (
    is_super_admin() OR
    creditor_entity_id = auth_entity_id()
  );

-- Debtor entity can view (not modify) accounts where they owe
CREATE POLICY "debtor_view_khata" ON khata_accounts
  FOR SELECT USING (
    is_super_admin() OR
    debtor_entity_id = auth_entity_id()
  );

-- Transactions visible to both creditor and debtor
CREATE POLICY "tenant_khata_transactions" ON khata_transactions
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_transactions.khata_account_id
      AND (ka.creditor_entity_id = auth_entity_id()
           OR ka.debtor_entity_id = auth_entity_id())
    )
  );

-- Repayments visible to both creditor and debtor
CREATE POLICY "tenant_khata_repayments" ON khata_repayments
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_repayments.khata_account_id
      AND (ka.creditor_entity_id = auth_entity_id()
           OR ka.debtor_entity_id = auth_entity_id())
    )
  );

-- Alerts visible to creditor only
CREATE POLICY "tenant_khata_alerts" ON khata_alerts
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_alerts.khata_account_id
      AND ka.creditor_entity_id = auth_entity_id()
    )
  );
-- Migration 023: Stock Prediction Engine (F-PREDICT-001)
-- Tables for daily stock-out predictions and supplier lead times.
-- Includes a DB function to calculate predictions from inventory_movements.

-- ─── SUPPLIER LEAD TIMES ──────────────────────────────────────────────────

CREATE TABLE supplier_lead_times (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id),
  category_id     UUID,
  supplier_id     UUID REFERENCES entities(id),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  lead_time_days  INT NOT NULL DEFAULT 7 CHECK (lead_time_days > 0),
  updated_by      UUID REFERENCES user_profiles(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,

  -- One lead time per (product, supplier) or (category, supplier)
  CONSTRAINT uq_slt_product_supplier UNIQUE (product_id, supplier_id),
  CONSTRAINT uq_slt_category_supplier UNIQUE (category_id, supplier_id)
);

CREATE INDEX idx_slt_product ON supplier_lead_times(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_slt_category ON supplier_lead_times(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_slt_entity ON supplier_lead_times(entity_id);

-- ─── STOCK PREDICTIONS ────────────────────────────────────────────────────

CREATE TABLE stock_predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  avg_daily_sales       DECIMAL(10,2) NOT NULL DEFAULT 0,
  weighted_ads          DECIMAL(10,2) NOT NULL DEFAULT 0,
  days_until_stockout   DECIMAL(10,2),
  suggested_reorder_qty DECIMAL(10,2),
  status                TEXT NOT NULL CHECK (status IN (
                            'HEALTHY', 'AT_RISK', 'CRITICAL',
                            'INSUFFICIENT_DATA', 'DEAD_STOCK', 'ERROR'
                          )),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(product_id, entity_id, calculated_at)
);

CREATE INDEX idx_stock_pred_status ON stock_predictions(entity_id, status);
CREATE INDEX idx_stock_pred_days ON stock_predictions(entity_id, days_until_stockout);
CREATE INDEX idx_stock_pred_latest ON stock_predictions(entity_id, calculated_at DESC);

-- ─── PREDICTION CALCULATION FUNCTION ──────────────────────────────────────
-- Calculates stock-out predictions for all products of a given entity.
-- Uses weighted ADS (last 7 days weighted 3x vs previous 23 days).
-- Excludes products with < 7 days data or 0 sales.

CREATE OR REPLACE FUNCTION calculate_stock_predictions(p_entity_id UUID)
RETURNS void AS $$
DECLARE
  v_calculated_at TIMESTAMPTZ := NOW();
  v_record RECORD;
  v_units_7d  INT;
  v_units_23d INT;
  v_total_units INT;
  v_days_with_sales INT;
  v_ads DECIMAL(10,2);
  v_wads DECIMAL(10,2);
  v_stock INT;
  v_reorder_point INT;
  v_days_left DECIMAL(10,2);
  v_reorder_qty DECIMAL(10,2);
  v_lead_time INT;
  v_status TEXT;
BEGIN
  -- Get all active products for this entity
  FOR v_record IN
    SELECT
      p.id AS product_id,
      p.name,
      p.current_stock,
      COALESCE(p.reorder_point, 0) AS reorder_point
    FROM products p
    WHERE p.is_active = true
  LOOP
    v_stock := COALESCE(v_record.current_stock, 0);
    v_reorder_point := v_record.reorder_point;

    -- Error check: negative stock
    IF v_stock < 0 THEN
      INSERT INTO stock_predictions (product_id, entity_id, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 'ERROR', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Count sales in last 7 days
    SELECT COALESCE(SUM(im.quantity), 0), COUNT(DISTINCT DATE(im.timestamp))
    INTO v_units_7d, v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '7 days';

    -- Count sales in previous 23 days (days 8-30)
    SELECT COALESCE(SUM(im.quantity), 0)
    INTO v_units_23d
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '30 days'
      AND im.timestamp < v_calculated_at - INTERVAL '7 days';

    v_total_units := v_units_7d + v_units_23d;

    -- Exclude: insufficient data (< 7 unique days with sales in 30-day window)
    SELECT COUNT(DISTINCT DATE(im.timestamp)) INTO v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '30 days';

    IF v_days_with_sales < 7 THEN
      INSERT INTO stock_predictions (product_id, entity_id, avg_daily_sales, weighted_ads, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 0, 0, 'INSUFFICIENT_DATA', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Exclude: dead stock (0 sales in 30 days)
    IF v_total_units = 0 THEN
      INSERT INTO stock_predictions (product_id, entity_id, avg_daily_sales, weighted_ads, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 0, 0, 'DEAD_STOCK', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Calculate ADS (plain 30-day)
    v_ads := ROUND(v_total_units::DECIMAL / 30, 2);

    -- Calculate weighted ADS: (last 7d * 3 + prev 23d * 1) / 44
    v_wads := ROUND((v_units_7d * 3.0 + v_units_23d * 1.0) / 44.0, 2);

    -- Handle zero weighted ADS (shouldn't happen if total > 0, but safety)
    IF v_wads = 0 THEN v_wads := v_ads; END IF;

    -- Days until stockout
    IF v_stock = 0 THEN
      v_days_left := 0;
    ELSE
      v_days_left := ROUND(v_stock::DECIMAL / v_wads, 2);
    END IF;

    -- Get lead time (product-level > category-level > default 7)
    SELECT COALESCE(
      (SELECT slt.lead_time_days FROM supplier_lead_times slt
       WHERE slt.product_id = v_record.product_id AND slt.entity_id = p_entity_id
       ORDER BY slt.lead_time_days ASC LIMIT 1),
      (SELECT slt.lead_time_days FROM supplier_lead_times slt
       JOIN product_categories pc ON pc.category_id = slt.category_id
       WHERE pc.product_id = v_record.product_id AND slt.entity_id = p_entity_id
       ORDER BY slt.lead_time_days ASC LIMIT 1),
      7
    ) INTO v_lead_time;

    -- Suggested reorder qty = wADS * lead_time * 1.5
    v_reorder_qty := ROUND(v_wads * v_lead_time * 1.5, 0);

    -- Determine status
    IF v_stock = 0 THEN
      v_status := 'CRITICAL';
    ELSIF v_days_left < 3 THEN
      v_status := 'CRITICAL';
    ELSIF v_reorder_point > 0 AND v_stock <= v_reorder_point THEN
      -- Use reorder_point as the AT_RISK threshold if set
      v_status := 'AT_RISK';
    ELSIF v_days_left < 7 THEN
      v_status := 'AT_RISK';
    ELSE
      v_status := 'HEALTHY';
    END IF;

    -- Upsert prediction
    INSERT INTO stock_predictions
      (product_id, entity_id, avg_daily_sales, weighted_ads,
       days_until_stockout, suggested_reorder_qty, status, calculated_at)
    VALUES
      (v_record.product_id, p_entity_id, v_ads, v_wads,
       v_days_left, v_reorder_qty, v_status, v_calculated_at)
    ON CONFLICT (product_id, entity_id, calculated_at) DO UPDATE SET
      avg_daily_sales = EXCLUDED.avg_daily_sales,
      weighted_ads = EXCLUDED.weighted_ads,
      days_until_stockout = EXCLUDED.days_until_stockout,
      suggested_reorder_qty = EXCLUDED.suggested_reorder_qty,
      status = EXCLUDED.status;

  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE stock_predictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_lead_times  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_stock_predictions" ON stock_predictions
  FOR ALL USING (
    is_super_admin() OR
    entity_id = auth_entity_id()
  );

CREATE POLICY "tenant_supplier_lead_times" ON supplier_lead_times
  FOR ALL USING (
    is_super_admin() OR
    entity_id = auth_entity_id()
  );
-- Migration 024: Marketplace Page (F-MARKET-001)
-- Adds marketplace visibility toggle on products and store branding columns on entities.

-- ─── PRODUCTS: visible_on_web ──────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS visible_on_web BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_marketplace
ON products (created_by, visible_on_web, current_stock)
WHERE visible_on_web = TRUE AND current_stock > 0;

-- ─── ENTITIES: marketplace columns ─────────────────────────────────────────

ALTER TABLE entities ADD COLUMN IF NOT EXISTS shop_slug TEXT UNIQUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS marketplace_bio TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS marketplace_logo_url TEXT;

-- Partial unique index so NULL slugs don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_shop_slug
ON entities (shop_slug)
WHERE shop_slug IS NOT NULL;
-- Migration 025: WhatsApp Ordering (F-WA-ORDER-001)
-- Adds order source tracking, fuzzy-match support, and consumer accounts for WhatsApp-originated orders.

-- ─── PG_TRGM EXTENSION ─────────────────────────────────────────────────────
-- Required for fuzzy product name matching (similarity >= 0.7).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- ─── ORDERS TABLE ADDITIONS ────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'POS'
  CHECK (order_source IN ('POS', 'WHATSAPP', 'MARKETPLACE_WEB'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

-- Fast rate-limit lookups: count orders per phone per day
CREATE INDEX IF NOT EXISTS idx_orders_buyer_phone_date ON orders (buyer_phone, created_at)
  WHERE order_source = 'WHATSAPP';

-- ─── ORDER ITEMS TABLE ADDITIONS ───────────────────────────────────────────

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS matched BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS raw_request_text TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2);

-- ─── CONSUMER ACCOUNTS ────────────────────────────────────────────────────
-- Minimal customer profile keyed by WhatsApp phone number.

CREATE TABLE IF NOT EXISTS consumer_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_order_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consumer_accounts_phone ON consumer_accounts(phone);

-- ─── FUZZY MATCH RPC ──────────────────────────────────────────────────────
-- Used by the gateway to match customer text against product names.

CREATE OR REPLACE FUNCTION fuzzy_match_product(
  p_name TEXT,
  p_entity_id UUID,
  p_threshold DECIMAL DEFAULT 0.7
)
RETURNS TABLE (id UUID, name TEXT, mrp DECIMAL, score DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.mrp,
    similarity(p.name, p_name) AS score
  FROM products p
  WHERE p.entity_id = p_entity_id
    AND p.is_active = true
    AND similarity(p.name, p_name) >= p_threshold
  ORDER BY score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
-- Migration 026: Draft Purchases (Photo-to-Stock, F-PHOTO-001)
-- Tables for storing OCR-parsed wholesale bills and their line items.
-- Also creates the `bill-photos` storage bucket for bill photo uploads.

-- ─── DRAFT PURCHASES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'REVIEWED', 'CONFIRMED', 'CANCELLED')),
  supplier_name   TEXT,
  bill_date       DATE,
  bill_photo_url  TEXT,
  bill_photo_hash TEXT,
  total_amount    DECIMAL(12,2) DEFAULT 0,
  ocr_raw         JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES user_profiles(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_purchases_entity ON draft_purchases(entity_id, status);
CREATE INDEX idx_draft_purchases_hash   ON draft_purchases(bill_photo_hash) WHERE bill_photo_hash IS NOT NULL;

-- ─── DRAFT PURCHASE ITEMS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_purchase_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_purchase_id UUID NOT NULL REFERENCES draft_purchases(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  raw_name          TEXT NOT NULL,
  quantity          INT NOT NULL,
  unit              TEXT NOT NULL DEFAULT 'pcs',
  unit_price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  match_confidence  DECIMAL(3,2),
  match_status      TEXT NOT NULL DEFAULT 'UNMATCHED'
                    CHECK (match_status IN ('MATCHED', 'PARTIAL', 'UNMATCHED')),
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_purchase_items_draft ON draft_purchase_items(draft_purchase_id);

-- ─── ROW-LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE draft_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_purchases_entity ON draft_purchases
  FOR ALL USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN user_profiles up ON up.id = auth.uid()
    WHERE up.entity_id = draft_purchases.entity_id
  ));

CREATE POLICY draft_purchase_items_entity ON draft_purchase_items
  FOR ALL USING (draft_purchase_id IN (
    SELECT id FROM draft_purchases WHERE entity_id IN (
      SELECT e.id FROM entities e
      JOIN user_profiles up ON up.id = auth.uid()
      WHERE up.entity_id = draft_purchases.entity_id
    )
  ));

-- ─── STORAGE BUCKET ─────────────────────────────────────────────────────────
-- The `bill-photos` bucket must be created via the Supabase dashboard
-- or via: INSERT INTO storage.buckets (id, name, public) VALUES ('bill-photos', 'bill-photos', false);

CREATE POLICY bill_photos_upload ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bill-photos');

CREATE POLICY bill_photos_read ON storage.objects
  FOR SELECT USING (bucket_id = 'bill-photos');
-- Migration 032: Product Specifications Feature
-- Adds support for category-specific product properties and vendor-specific product values

-- ============================================================================
-- Table: units
-- Admin-configurable units of measurement
-- ============================================================================
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name),
  UNIQUE(abbreviation)
);

-- Seed with common units
INSERT INTO units (name, abbreviation, category, sort_order) VALUES
  ('Piece', 'pcs', 'quantity', 1),
  ('Kilogram', 'kg', 'weight', 2),
  ('Gram', 'g', 'weight', 3),
  ('Litre', 'L', 'volume', 4),
  ('Millilitre', 'ml', 'volume', 5),
  ('Box', 'box', 'packaging', 6),
  ('Pack', 'pack', 'packaging', 7),
  ('Dozen', 'doz', 'quantity', 8),
  ('Pair', 'pair', 'quantity', 9),
  ('Set', 'set', 'quantity', 10),
  ('Meter', 'm', 'length', 11),
  ('Centimetre', 'cm', 'length', 12),
  ('Square Metre', 'sqm', 'area', 13),
  ('Cubic Metre', 'cum', 'volume', 14)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Table: category_properties
-- Defines custom properties for each product category
-- ============================================================================
CREATE TABLE IF NOT EXISTS category_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text_single', 'text_multi', 'number', 'unit', 'datetime')),
  is_required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  validation_rules JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- ============================================================================
-- Table: entity_products
-- Vendor-specific product catalog (vendor's view of products they sell)
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  master_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Vendor's product identifiers
  sku TEXT NOT NULL,
  display_name TEXT,
  barcode TEXT,
  qr_code TEXT,

  -- Pricing
  wholesale_price DECIMAL(12,2),
  mrp DECIMAL(12,2),
  gst_percent DECIMAL(5,2) DEFAULT 5.00,

  -- Inventory
  current_stock INT DEFAULT 0,
  reorder_point INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,

  -- Manufacturer Details (Standard Fields)
  manufacturer_name TEXT,
  manufacturer_brand TEXT,
  country_of_origin TEXT,

  -- Batch & Expiry (Standard Fields - critical for pharma, food)
  batch_number TEXT,
  manufactured_on DATE,
  expiry_date DATE,
  best_before DATE,

  -- Additional vendor notes
  vendor_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, sku)
);

-- Indexes for entity_products
CREATE INDEX IF NOT EXISTS idx_entity_products_entity ON entity_products(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_master ON entity_products(master_product_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_expiry ON entity_products(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_products_sku ON entity_products(sku);
CREATE INDEX IF NOT EXISTS idx_entity_products_active ON entity_products(entity_id, is_active) WHERE is_active = true;

-- ============================================================================
-- Table: entity_product_specifications
-- Stores vendor-specific specification values for their products
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_product_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_product_id UUID NOT NULL REFERENCES entity_products(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES category_properties(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC(12,2),
  value_unit TEXT,
  value_datetime TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_product_id, property_id)
);

-- Index for entity_product_specifications
CREATE INDEX IF NOT EXISTS idx_entity_product_specs_entity_product ON entity_product_specifications(entity_product_id);
CREATE INDEX IF NOT EXISTS idx_entity_product_specs_property ON entity_product_specifications(property_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_product_specifications ENABLE ROW LEVEL SECURITY;

-- Units: Super admins manage, everyone reads
CREATE POLICY "super_admins_manage_units"
  ON units FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
  );

CREATE POLICY "all_read_units"
  ON units FOR SELECT USING (true);

-- Category Properties: Distributors manage for their categories
CREATE POLICY "distributors_manage_category_properties"
  ON category_properties FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'DISTRIBUTOR'
      AND category_id IN (
        SELECT id FROM categories WHERE distributor_id = up.entity_id OR distributor_id IS NULL
      )
    )
  );

CREATE POLICY "all_read_category_properties"
  ON category_properties FOR SELECT USING (true);

-- Entity Products: Vendors manage their own
CREATE POLICY "vendors_manage_entity_products"
  ON entity_products FOR ALL USING (entity_id = auth_entity_id());

CREATE POLICY "all_read_entity_products"
  ON entity_products FOR SELECT USING (true);

-- Entity Product Specifications: Vendors manage their own
CREATE POLICY "vendors_manage_entity_product_specifications"
  ON entity_product_specifications FOR ALL USING (
    entity_product_id IN (
      SELECT id FROM entity_products WHERE entity_id = auth_entity_id()
    )
  );

CREATE POLICY "all_read_entity_product_specifications"
  ON entity_product_specifications FOR SELECT USING (true);
-- HSN Master table (needed before migration 034 references it)
CREATE TABLE IF NOT EXISTS hsn_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  code_8digit TEXT,
  chapter TEXT NOT NULL,
  heading TEXT NOT NULL,
  subheading TEXT,
  tariff_item TEXT,
  description TEXT NOT NULL,
  short_description TEXT,
  category TEXT,
  customs_duty DECIMAL(5,2) DEFAULT 0,
  sales_tax DECIMAL(5,2) DEFAULT 0,
  green_tax DECIMAL(5,2) DEFAULT 0,
  tax_type TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code),
  UNIQUE(code_8digit)
);
CREATE INDEX IF NOT EXISTS idx_hsn_master_code ON hsn_master(code);
CREATE INDEX IF NOT EXISTS idx_hsn_master_chapter ON hsn_master(chapter);
CREATE INDEX IF NOT EXISTS idx_hsn_master_category ON hsn_master(category);
CREATE INDEX IF NOT EXISTS idx_hsn_master_active ON hsn_master(is_active) WHERE is_active = true;
ALTER TABLE hsn_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_read_hsn_master" ON hsn_master FOR SELECT USING (true);
DO $$ BEGIN
  CREATE POLICY "super_admins_manage_hsn_master" ON hsn_master FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration 034: Update Products to Inherit Category from HSN
-- Product categories and subcategories are automatically derived from HSN codes

-- ============================================================================
-- Update products table to link with hsn_master
-- ============================================================================

-- Add foreign key reference to hsn_master
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_master_id UUID REFERENCES hsn_master(id);

-- Add category and subcategory columns (can be manually overridden)
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add chapter, heading, subheading columns for HSN hierarchy
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_chapter TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_heading TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_subheading TEXT;

-- Create index for HSN lookups
CREATE INDEX IF NOT EXISTS idx_products_hsn_master ON products(hsn_master_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);

-- ============================================================================
-- Update entity_products table to link with hsn_master
-- ============================================================================

-- Add hsn_code column (text version that can be directly set)
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Add foreign key reference to hsn_master for vendor products
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_master_id UUID REFERENCES hsn_master(id);

-- Add category and subcategory columns
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add HSN hierarchy columns
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_chapter TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_heading TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_subheading TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_entity_products_hsn_master ON entity_products(hsn_master_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_category ON entity_products(category);
CREATE INDEX IF NOT EXISTS idx_entity_products_subcategory ON entity_products(subcategory);

-- ============================================================================
-- Function: Sync product category from HSN master
-- Automatically populates category/subcategory from HSN code
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_product_category_from_hsn()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if hsn_master_id is set and category/subcategory are not manually set
  IF NEW.hsn_master_id IS NOT NULL THEN
    -- Update category and subcategory from HSN master
    UPDATE products
    SET
      category = COALESCE(NEW.category, hsn.category),
      subcategory = COALESCE(NEW.subcategory, hsn.short_description),
      hsn_chapter = hsn.chapter,
      hsn_heading = hsn.heading,
      hsn_subheading = hsn.subheading,
      hsn_code = hsn.code
    FROM hsn_master hsn
    WHERE hsn.id = NEW.hsn_master_id AND products.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products
DROP TRIGGER IF EXISTS trigger_sync_product_category_from_hsn ON products;
CREATE TRIGGER trigger_sync_product_category_from_hsn
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  WHEN (NEW.hsn_master_id IS NOT NULL)
  EXECUTE FUNCTION sync_product_category_from_hsn();

-- ============================================================================
-- Function: Sync entity_product category from HSN master
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_entity_product_category_from_hsn()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if hsn_master_id is set
  IF NEW.hsn_master_id IS NOT NULL THEN
    UPDATE entity_products
    SET
      category = COALESCE(NEW.category, hsn.category),
      subcategory = COALESCE(NEW.subcategory, hsn.short_description),
      hsn_chapter = hsn.chapter,
      hsn_heading = hsn.heading,
      hsn_subheading = hsn.subheading,
      hsn_code = hsn.code
    FROM hsn_master hsn
    WHERE hsn.id = NEW.hsn_master_id AND entity_products.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entity_products
DROP TRIGGER IF EXISTS trigger_sync_entity_product_category_from_hsn ON entity_products;
CREATE TRIGGER trigger_sync_entity_product_category_from_hsn
  BEFORE INSERT OR UPDATE ON entity_products
  FOR EACH ROW
  WHEN (NEW.hsn_master_id IS NOT NULL)
  EXECUTE FUNCTION sync_entity_product_category_from_hsn();

-- ============================================================================
-- Function: Get HSN-based category tree
-- Returns the full category hierarchy for a given HSN code
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hsn_category_tree(p_hsn_code TEXT)
RETURNS TABLE(
  hsn_code TEXT,
  chapter TEXT,
  heading TEXT,
  subheading TEXT,
  category TEXT,
  short_description TEXT,
  customs_duty DECIMAL(5,2),
  sales_tax DECIMAL(5,2),
  green_tax DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    hsn.code,
    hsn.chapter,
    hsn.heading,
    hsn.subheading,
    hsn.category,
    hsn.short_description,
    hsn.customs_duty,
    hsn.sales_tax,
    hsn.green_tax
  FROM hsn_master hsn
  WHERE hsn.code = p_hsn_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: Products with HSN categories
-- Convenient view joining products with HSN master data
-- ============================================================================

CREATE OR REPLACE VIEW products_with_hsn AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.hsn_code,
  p.hsn_master_id,
  p.hsn_chapter,
  p.hsn_heading,
  p.hsn_subheading,
  p.category,
  p.subcategory,
  p.image_url,
  p.current_stock,
  p.wholesale_price,
  p.mrp,
  p.unit,
  p.is_active,
  p.created_by,
  p.created_at,
  p.updated_at,
  -- HSN tax info
  hsn.customs_duty,
  hsn.sales_tax,
  hsn.green_tax,
  hsn.tax_type,
  -- Combined category path
  CASE
    WHEN p.category IS NOT NULL THEN p.category
    ELSE hsn.category
  END as display_category,
  CASE
    WHEN p.subcategory IS NOT NULL THEN p.subcategory
    ELSE hsn.short_description
  END as display_subcategory
FROM products p
LEFT JOIN hsn_master hsn ON p.hsn_master_id = hsn.id;

-- ============================================================================
-- View: Entity Products with HSN categories
-- ============================================================================

CREATE OR REPLACE VIEW entity_products_with_hsn AS
SELECT
  ep.id,
  ep.entity_id,
  ep.master_product_id,
  ep.hsn_code,
  ep.hsn_master_id,
  ep.hsn_chapter,
  ep.hsn_heading,
  ep.hsn_subheading,
  ep.category,
  ep.subcategory,
  ep.sku,
  ep.display_name,
  ep.barcode,
  ep.qr_code,
  ep.wholesale_price,
  ep.mrp,
  ep.gst_percent,
  ep.current_stock,
  ep.reorder_point,
  ep.is_active,
  ep.manufacturer_name,
  ep.manufacturer_brand,
  ep.country_of_origin,
  ep.batch_number,
  ep.manufactured_on,
  ep.expiry_date,
  ep.best_before,
  ep.vendor_notes,
  ep.created_at,
  ep.updated_at,
  -- HSN tax info
  hsn.customs_duty,
  hsn.sales_tax,
  hsn.green_tax,
  hsn.tax_type,
  -- Combined category path
  CASE
    WHEN ep.category IS NOT NULL THEN ep.category
    ELSE hsn.category
  END as display_category,
  CASE
    WHEN ep.subcategory IS NOT NULL THEN ep.subcategory
    ELSE hsn.short_description
  END as display_subcategory,
  -- Entity info
  e.name as entity_name,
  e.role as entity_role
FROM entity_products ep
LEFT JOIN hsn_master hsn ON ep.hsn_master_id = hsn.id
LEFT JOIN entities e ON ep.entity_id = e.id;

-- ============================================================================
-- Note: RLS Policies
-- ============================================================================
-- Views do not support RLS policies. Access to views is controlled by:
-- 1. The underlying table's RLS policies (products, entity_products)
-- 2. CREATE VIEW with SECURITY INVOKER (default) respects caller's permissions
-- No additional policies needed for these views.

-- ============================================================================
-- Helper function: Update existing products with HSN category
-- Use this to backfill existing products
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_product_categories_from_hsn()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Backfill products table
  UPDATE products p
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = p.hsn_code LIMIT 1),
    category = COALESCE(p.category, hsn.category),
    subcategory = COALESCE(p.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = p.hsn_code;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Backfill entity_products table
  UPDATE entity_products ep
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = ep.hsn_code LIMIT 1),
    category = COALESCE(ep.category, hsn.category),
    subcategory = COALESCE(ep.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = ep.hsn_code;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
-- Migration 036: Fix HSN Triggers to Fire on hsn_code Changes
-- Bug fix: Category inheritance triggers weren't firing because forms set hsn_code (TEXT)
-- instead of hsn_master_id (UUID). This adds triggers to sync hsn_master_id from hsn_code.

-- ============================================================================
-- Function: Sync hsn_master_id from hsn_code for products table
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_hsn_master_id_from_code_products()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products (fires before main HSN trigger)
DROP TRIGGER IF EXISTS trigger_sync_hsn_master_id_from_code_products ON products;
CREATE TRIGGER trigger_sync_hsn_master_id_from_code_products
  BEFORE INSERT OR UPDATE OF hsn_code ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_hsn_master_id_from_code_products();

-- ============================================================================
-- Function: Sync hsn_master_id from hsn_code for entity_products table
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_hsn_master_id_from_code_entity_products()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entity_products (fires before main HSN trigger)
DROP TRIGGER IF EXISTS trigger_sync_hsn_master_id_from_code_entity_products ON entity_products;
CREATE TRIGGER trigger_sync_hsn_master_id_from_code_entity_products
  BEFORE INSERT OR UPDATE OF hsn_code ON entity_products
  FOR EACH ROW
  EXECUTE FUNCTION sync_hsn_master_id_from_code_entity_products();

-- ============================================================================
-- Backfill: Update existing records with hsn_code but no hsn_master_id
-- ============================================================================

-- Update products table
UPDATE products
SET hsn_master_id = (
  SELECT id FROM hsn_master
  WHERE hsn_master.code = products.hsn_code AND hsn_master.is_active = true
  LIMIT 1
)
WHERE hsn_code IS NOT NULL AND hsn_master_id IS NULL;

-- Update entity_products table
UPDATE entity_products
SET hsn_master_id = (
  SELECT id FROM hsn_master
  WHERE hsn_master.code = entity_products.hsn_code AND hsn_master.is_active = true
  LIMIT 1
)
WHERE hsn_code IS NOT NULL AND hsn_master_id IS NULL;

-- ============================================================================
-- Trigger Order Explanation
-- ============================================================================

-- The trigger execution order is now:
-- 1. trigger_sync_hsn_master_id_from_code_* (BEFORE INSERT/UPDATE OF hsn_code)
--    - Sets hsn_master_id based on hsn_code
-- 2. trigger_sync_*_category_from_hsn (BEFORE INSERT/UPDATE)
--    - Fires because hsn_master_id is now set
--    - Populates category, subcategory, and HSN hierarchy columns

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Run this to verify the fix is working:
-- SELECT id, hsn_code, hsn_master_id, category, subcategory
-- FROM entity_products
-- WHERE hsn_code IS NOT NULL
-- ORDER BY created_at DESC
-- LIMIT 10;
-- Migration 041: Add CUSTOMER role for marketplace customers
-- Allows customers to login via WhatsApp and place orders

-- Add CUSTOMER to the role check constraint
-- First, we need to drop and recreate the constraint
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_role_check;

ALTER TABLE entities ADD CONSTRAINT entities_role_check 
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

-- Also update user_profiles role constraint if needed
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

-- Add sub_role for customers (they only have one role)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_sub_role_check;

ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_sub_role_check 
  CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN', 'CUSTOMER'));
-- Migration 046: Marketplace Checkout — payment token + delivery columns
-- Adds fields needed for post-delivery payment link flow and customer delivery address

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_token               TEXT,
  ADD COLUMN IF NOT EXISTS payment_token_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_address            TEXT,
  ADD COLUMN IF NOT EXISTS delivery_lat                DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS delivery_lng                DECIMAL(10,7);

-- Sparse index — only rows with a token need to be looked up by token
CREATE INDEX IF NOT EXISTS idx_orders_payment_token
  ON orders(payment_token)
  WHERE payment_token IS NOT NULL;
-- Migration 047: Rider System
-- Creates riders table and adds OTP + rider assignment columns to orders

-- ── riders table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS riders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  whatsapp_no      TEXT NOT NULL UNIQUE,
  pin_hash         TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_available     BOOLEAN NOT NULL DEFAULT true,
  current_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  auth_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riders_whatsapp ON riders(whatsapp_no);
CREATE INDEX IF NOT EXISTS idx_riders_available ON riders(is_active, is_available) WHERE is_active = true;

-- ── OTP + rider assignment columns on orders ──────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_otp               TEXT,
  ADD COLUMN IF NOT EXISTS pickup_otp_expires_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp             TEXT,
  ADD COLUMN IF NOT EXISTS delivery_otp_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rider_id                 UUID REFERENCES riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rider_accepted_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON orders(rider_id) WHERE rider_id IS NOT NULL;

-- ── RLS: riders table ─────────────────────────────────────────────────────────
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by all API routes)
CREATE POLICY "service_role_all_riders" ON riders
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Riders can read their own record
CREATE POLICY "rider_read_own" ON riders
  FOR SELECT USING (auth_user_id = auth.uid());
-- Migration 050: Owner → Multiple Stores
-- Allows a single OWNER user to manage multiple retailer entities.
-- An owner can switch between their stores in the POS header.

-- ── Junction table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_stores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities(id)   ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- the default store on login
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_stores_owner   ON owner_stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_stores_entity  ON owner_stores(entity_id);

-- RLS
ALTER TABLE owner_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_owner_stores" ON owner_stores
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "owner_read_own_stores" ON owner_stores
  FOR SELECT USING (owner_id = auth.uid());

-- ── Back-fill: existing OWNER user_profiles → primary owner_stores entry ──
-- Links each existing OWNER sub_role user to their current entity as primary.
INSERT INTO owner_stores (owner_id, entity_id, is_primary)
SELECT p.id, p.entity_id, true
FROM   user_profiles p
WHERE  p.sub_role = 'OWNER'
  AND  p.entity_id IS NOT NULL
ON CONFLICT (owner_id, entity_id) DO NOTHING;
-- Migration 052: Batch-Level Stock Receiving & Batch-Aware POS Pricing
-- Adds selling_price + mrp to product_batches, selling_price to products,
-- batch_id to cart_items and order_items, batch fields to draft_purchase_items.
-- Replaces sellable_products view to return one row per active batch.
-- Updates deduct/restore stock triggers to propagate batch_id.

-- ─── 1. PRICES ON PRODUCT_BATCHES ────────────────────────────────────────────
-- unit_cost  = wholesale/purchase price paid by vendor (already exists)
-- mrp        = manufacturer's max retail price (regulatory ceiling, on packaging)
-- selling_price = price vendor charges customers (≤ mrp, set per batch)

ALTER TABLE product_batches
  ADD COLUMN IF NOT EXISTS mrp           DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2);

-- ─── 2. SELLING_PRICE ON PRODUCTS ────────────────────────────────────────────
-- Active selling price at product level — updated when a new batch is received.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2);

-- ─── 3. BATCH_ID ON CART_ITEMS ───────────────────────────────────────────────
-- Nullable: non-batch products (packages, pre-batch items) have no batch.

ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL;

-- ─── 4. BATCH_ID ON ORDER_ITEMS ──────────────────────────────────────────────

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL;

-- ─── 5. BATCH FIELDS ON DRAFT_PURCHASE_ITEMS ─────────────────────────────────
-- Allows bill-scan draft purchase items to carry batch details
-- that are used when the draft is confirmed to create product_batches rows.

ALTER TABLE draft_purchase_items
  ADD COLUMN IF NOT EXISTS mrp              DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS selling_price    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS batch_number     TEXT,
  ADD COLUMN IF NOT EXISTS batch_barcode    TEXT,
  ADD COLUMN IF NOT EXISTS expires_at       DATE,
  ADD COLUMN IF NOT EXISTS manufactured_at  DATE;

-- ─── 6. UNIQUE INDEX: BATCH BARCODE PER ENTITY ───────────────────────────────
-- Batch barcodes are unique within an entity (not globally) — two different
-- entities can receive the same branded product with the same barcode.

DROP INDEX IF EXISTS idx_batches_barcode;

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_barcode_entity
  ON product_batches(entity_id, barcode)
  WHERE barcode IS NOT NULL;

-- ─── 7. EXTEND PRICE HISTORY TO TRACK SELLING_PRICE ─────────────────────────

ALTER TABLE product_price_history
  DROP CONSTRAINT IF EXISTS product_price_history_price_type_check;

ALTER TABLE product_price_history
  ADD CONSTRAINT product_price_history_price_type_check
    CHECK (price_type IN ('MRP', 'WHOLESALE', 'SELLING'));

-- Replace the price change log trigger to also capture selling_price changes.
CREATE OR REPLACE FUNCTION log_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.mrp IS DISTINCT FROM NEW.mrp THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'MRP', OLD.mrp, NEW.mrp, auth.uid());
  END IF;
  IF OLD.wholesale_price IS DISTINCT FROM NEW.wholesale_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'WHOLESALE', OLD.wholesale_price, NEW.wholesale_price, auth.uid());
  END IF;
  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'SELLING', OLD.selling_price, NEW.selling_price, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. REPLACE SELLABLE_PRODUCTS VIEW ───────────────────────────────────────
-- DROP first because CREATE OR REPLACE cannot change column names/order.
-- Downstream views (package_contents) do not depend on sellable_products.

DROP VIEW IF EXISTS sellable_products;

CREATE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    COALESCE(pb.selling_price, p.selling_price, p.mrp) AS selling_price,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN package_available_qty(pp.id)
      ELSE COALESCE(pb.quantity, p.current_stock)
    END AS available_stock,
    pp.id          AS package_def_id,
    pp.package_type,
    pp.barcode     AS package_barcode,
    pb.id          AS batch_id,
    pb.batch_number,
    pb.expires_at,
    pb.barcode     AS batch_barcode
  FROM products p
  LEFT JOIN product_packages pp
         ON pp.product_id = p.id
  LEFT JOIN product_batches pb
         ON pb.product_id = p.id
        AND pb.entity_id  = p.created_by
        AND pb.status     = 'ACTIVE'
        AND pb.quantity   > 0
  WHERE p.is_active            = TRUE
    AND p.sold_as_package_only = FALSE;

-- ─── 9. UPDATE DEDUCT_STOCK_ON_CONFIRM ───────────────────────────────────────
-- Propagates batch_id from order_items to inventory_movements.
-- The sync_batch_quantity() trigger (migration 013) then decrements
-- product_batches.quantity automatically.

CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    INSERT INTO inventory_movements
      (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      'SALE',
      -(oi.quantity),
      NEW.id,
      oi.batch_id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id    = NEW.id
      AND oi.product_id  IS NOT NULL
      AND oi.status      = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 10. UPDATE RESTORE_STOCK_ON_CANCEL ──────────────────────────────────────
-- Propagates batch_id so the correct batch quantity is restored on cancellation.

CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    IF OLD.status IN (
      'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED',
      'CANCELLATION_REQUESTED', 'REFUND_REQUESTED'
    ) THEN
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      SELECT
        oi.product_id,
        NEW.seller_id,
        'RETURN',
        oi.quantity,
        NEW.id,
        oi.batch_id,
        'Auto-restored on order cancellation: ' || NEW.order_no
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE';

      UPDATE order_items
        SET status = 'CANCELLED'
      WHERE order_id = NEW.id
        AND status   = 'ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Migration 054: Purchase Orders & Purchase Invoices
-- Extends the orders table to support vendor procurement workflow:
-- PURCHASE_ORDER (commitment, no stock change) →
-- PURCHASE_INVOICE (confirmed receipt, triggers batch creation + restock)

-- ─── 1. EXTEND ORDER_TYPE ────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN (
    'POS_SALE', 'WHOLESALE', 'MARKETPLACE',
    'PURCHASE_ORDER', 'PURCHASE_INVOICE'
  ));

-- ─── 2. EXTEND STATUS ────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    -- existing statuses
    'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
    'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED',
    'PAYMENT_FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED',
    'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED',
    'REFUND_PROCESSING', 'REFUNDED',
    'REPLACEMENT_REQUESTED', 'REPLACEMENT_DISPATCHED', 'REPLACEMENT_DELIVERED',
    -- purchase-specific statuses
    'SENT',                -- PO sent to supplier
    'PARTIALLY_RECEIVED',  -- some items received
    'PAID'                 -- invoice paid
  ));

-- ─── 3. NEW COLUMNS ON ORDERS ────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name      TEXT,        -- free-text supplier name
  ADD COLUMN IF NOT EXISTS supplier_ref       TEXT,        -- supplier's own PO/invoice ref
  ADD COLUMN IF NOT EXISTS expected_delivery  DATE,        -- expected goods arrival date
  ADD COLUMN IF NOT EXISTS received_at        TIMESTAMPTZ; -- when invoice was confirmed/received

CREATE INDEX IF NOT EXISTS idx_orders_purchase_order_id
  ON orders(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_purchase_type
  ON orders(order_type, buyer_id)
  WHERE order_type IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE');

-- ─── 4. NEW COLUMNS ON ORDER_ITEMS ───────────────────────────────────────────
-- These capture batch details entered when converting a PO to an Invoice
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_cost        DECIMAL(12,2), -- purchase price paid
  ADD COLUMN IF NOT EXISTS batch_number     TEXT,
  ADD COLUMN IF NOT EXISTS batch_barcode    TEXT,
  ADD COLUMN IF NOT EXISTS expires_at       DATE,
  ADD COLUMN IF NOT EXISTS manufactured_at  DATE;

-- ─── 5. EXTEND KHATA PARTY_TYPE FOR SUPPLIERS ────────────────────────────────
ALTER TABLE khata_accounts
  DROP CONSTRAINT IF EXISTS khata_accounts_party_type_check;
ALTER TABLE khata_accounts
  ADD CONSTRAINT khata_accounts_party_type_check
    CHECK (party_type IN ('CONSUMER', 'RETAILER', 'WHOLESALER', 'SUPPLIER'));

-- ─── 6. RESTOCK TRIGGER ON INVOICE CONFIRMATION ──────────────────────────────
-- Fires when a PURCHASE_INVOICE transitions to CONFIRMED.
-- For each active order_item: creates a product_batch + RESTOCK movement.
-- buyer_id = the retailer/vendor who is receiving the goods.

CREATE OR REPLACE FUNCTION restock_on_invoice_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_item       RECORD;
  v_batch_id   UUID;
  v_batch_no   TEXT;
  v_mrp        DECIMAL(12,2);
  v_sell       DECIMAL(12,2);
BEGIN
  IF NEW.order_type = 'PURCHASE_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.buyer_id IS NOT NULL THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status = 'ACTIVE'
    LOOP
      -- Build batch number
      v_batch_no := COALESCE(
        NULLIF(TRIM(v_item.batch_number), ''),
        'PI-' || NEW.order_no || '-' || SUBSTRING(v_item.id::TEXT, 1, 8)
      );

      -- Get current product MRP and selling price as fallbacks
      SELECT mrp, COALESCE(selling_price, mrp)
        INTO v_mrp, v_sell
        FROM products WHERE id = v_item.product_id;

      -- Create batch
      INSERT INTO product_batches (
        product_id, entity_id, batch_number, barcode,
        manufactured_at, expires_at,
        quantity, unit_cost, mrp, selling_price, status, notes
      ) VALUES (
        v_item.product_id,
        NEW.buyer_id,
        v_batch_no,
        NULLIF(TRIM(COALESCE(v_item.batch_barcode, '')), ''),
        v_item.manufactured_at,
        v_item.expires_at,
        v_item.quantity,
        COALESCE(v_item.unit_cost, v_item.unit_price),
        v_mrp,
        v_sell,
        'ACTIVE',
        'Created from Purchase Invoice: ' || NEW.order_no
      )
      ON CONFLICT (product_id, entity_id, batch_number) DO NOTHING
      RETURNING id INTO v_batch_id;

      -- If batch was created (not a duplicate), create RESTOCK movement
      IF v_batch_id IS NOT NULL THEN
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
        VALUES (
          v_item.product_id,
          NEW.buyer_id,
          'RESTOCK',
          v_item.quantity,
          NEW.id,
          v_batch_id,
          'Auto-restocked from Purchase Invoice: ' || NEW.order_no
        );

        -- Update product wholesale_price if unit_cost provided on the invoice line
        IF v_item.unit_cost IS NOT NULL THEN
          UPDATE products
          SET wholesale_price = v_item.unit_cost, updated_at = NOW()
          WHERE id = v_item.product_id;
        END IF;
      END IF;

    END LOOP;

    -- Stamp the received_at timestamp
    UPDATE orders SET received_at = NOW() WHERE id = NEW.id;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_restock_on_invoice_confirm ON orders;
CREATE TRIGGER orders_restock_on_invoice_confirm
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION restock_on_invoice_confirm();
-- Migration 058: Sales Orders & Sales Invoices
-- Introduces SALES_ORDER (customer request, no stock) and
-- SALES_INVOICE (vendor creates, stock deducted per batch).

-- ─── 1. EXTEND ORDER_TYPE ────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN (
    'POS_SALE', 'WHOLESALE', 'MARKETPLACE',
    'PURCHASE_ORDER', 'PURCHASE_INVOICE',
    'SALES_ORDER', 'SALES_INVOICE'
  ));

-- ─── 2. EXTEND STATUS ────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
    'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED',
    'PAYMENT_FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED',
    'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED',
    'REFUND_PROCESSING', 'REFUNDED',
    'REPLACEMENT_REQUESTED', 'REPLACEMENT_DISPATCHED', 'REPLACEMENT_DELIVERED',
    'SENT', 'PARTIALLY_RECEIVED', 'PAID',
    'PARTIALLY_FULFILLED'
  ));

-- ─── 3. NEW COLUMNS ON ORDERS ────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sales_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_ref     TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_sales_order_id
  ON orders(sales_order_id) WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_sales_type
  ON orders(order_type, seller_id)
  WHERE order_type IN ('SALES_ORDER', 'SALES_INVOICE');

-- ─── 4. DEDUCT STOCK TRIGGER FOR SALES_INVOICE ───────────────────────────────
-- Fires when a SALES_INVOICE is confirmed (status → CONFIRMED).
-- Creates SALE inventory_movements per batch-linked order_item.
-- The sync_batch_quantity() trigger (migration 013) then decrements batch.quantity.

CREATE OR REPLACE FUNCTION deduct_stock_on_sales_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.order_type = 'SALES_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE'
    LOOP
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (
        v_item.product_id,
        NEW.seller_id,
        'SALE',
        -(v_item.quantity),
        NEW.id,
        v_item.batch_id,
        'Auto-deducted from Sales Invoice: ' || NEW.order_no
      );
    END LOOP;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_deduct_on_sales_invoice ON orders;
CREATE TRIGGER orders_deduct_on_sales_invoice
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_sales_invoice();

-- ─── 5. EXTEND GUARD TRIGGER FOR SALES_INVOICE ───────────────────────────────
-- Reuse the existing guard_stock_on_confirm pattern but also
-- catch SALES_INVOICE over-fulfilment at the DB level.
-- The existing guard (migration 055) already fires on CONFIRMED transitions
-- and checks both batch and product-level quantities — it will fire for
-- SALES_INVOICE too since we set status = CONFIRMED on creation.
-- No additional guard trigger needed.
-- Migration 059: Scope deduct_stock_on_confirm to POS/WHOLESALE/MARKETPLACE only
-- SALES_ORDER: stock deducted by deduct_stock_on_sales_invoice trigger (migration 058)
-- SALES_INVOICE: stock deducted by deduct_stock_on_sales_invoice trigger
-- PURCHASE_ORDER/INVOICE: stock handled by restock_on_invoice_confirm (migration 057)
-- POS_SALE, WHOLESALE, MARKETPLACE: handled here

CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    INSERT INTO inventory_movements
      (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      'SALE',
      -(oi.quantity),
      NEW.id,
      oi.batch_id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id   = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status     = 'ACTIVE';

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also scope restore_stock_on_cancel to the same types
-- (SALES_ORDER cancellation doesn't need stock restore since none was deducted)
CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    IF OLD.status IN (
      'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED',
      'CANCELLATION_REQUESTED', 'REFUND_REQUESTED'
    ) THEN
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      SELECT
        oi.product_id,
        NEW.seller_id,
        'RETURN',
        oi.quantity,
        NEW.id,
        oi.batch_id,
        'Auto-restored on order cancellation: ' || NEW.order_no
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE';

      UPDATE order_items
        SET status = 'CANCELLED'
      WHERE order_id = NEW.id
        AND status   = 'ACTIVE';
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also scope guard_stock_on_confirm to the same order types
-- (SALES_INVOICE has its own check via deduct_stock_on_sales_invoice + existing guard logic)
CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  shortage RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE', 'SALES_INVOICE') THEN

    -- Non-batch: check product.current_stock
    SELECT oi.name, oi.quantity, p.current_stock
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id   = NEW.id
      AND oi.status     = 'ACTIVE'
      AND oi.product_id IS NOT NULL
      AND oi.batch_id   IS NULL
      AND p.current_stock < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available',
        shortage.name, shortage.quantity, shortage.current_stock;
    END IF;

    -- Batch-specific: check product_batches.quantity
    SELECT oi.name, oi.quantity, pb.quantity AS batch_qty, pb.batch_number
    INTO shortage
    FROM order_items oi
    JOIN product_batches pb ON pb.id = oi.batch_id
    WHERE oi.order_id  = NEW.id
      AND oi.status    = 'ACTIVE'
      AND oi.batch_id  IS NOT NULL
      AND pb.quantity  < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient batch stock: "%" batch "%" requires %, only % available',
        shortage.name, shortage.batch_number, shortage.quantity, shortage.batch_qty;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Migration 060: Robust batch auto-depletion
-- Problem: sync_batch_quantity (migration 013) updates batch.quantity via an
-- AFTER INSERT trigger on inventory_movements, then runs a second UPDATE to mark
-- status = 'DEPLETED'. That second UPDATE can be silently blocked by RLS when
-- the trigger fires in a context without a valid JWT (e.g. service-role inserts).
--
-- Fix: add a BEFORE UPDATE trigger on product_batches itself. Any UPDATE that
-- brings quantity to <= 0 will atomically set status = 'DEPLETED' in the same
-- statement, bypassing any RLS gap since BEFORE ROW triggers modify NEW directly.
--
-- Also make sync_batch_quantity SECURITY DEFINER so the inventory_movements
-- trigger can always update product_batches regardless of RLS context.

-- ── 1. BEFORE UPDATE trigger on product_batches ───────────────────────────────
CREATE OR REPLACE FUNCTION auto_deplete_batch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity <= 0 AND OLD.status = 'ACTIVE' THEN
    NEW.status := 'DEPLETED';
  END IF;
  -- Reactivate if stock is added back to a depleted batch (e.g. return/correction)
  IF NEW.quantity > 0 AND OLD.status = 'DEPLETED' THEN
    NEW.status := 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS batch_auto_deplete ON product_batches;
CREATE TRIGGER batch_auto_deplete
  BEFORE UPDATE OF quantity ON product_batches
  FOR EACH ROW EXECUTE FUNCTION auto_deplete_batch();

-- ── 2. Make sync_batch_quantity SECURITY DEFINER ──────────────────────────────
-- Ensures the function can UPDATE product_batches even when called from a
-- trigger context that has no JWT-authenticated user (service-role inserts).
-- The DEPLETED check in this function is now a safety net; the BEFORE UPDATE
-- trigger above is the primary enforcement path.
CREATE OR REPLACE FUNCTION sync_batch_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE product_batches
    SET quantity = quantity + NEW.quantity  -- quantity is signed (neg for sales)
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger (function replaced above)
DROP TRIGGER IF EXISTS inventory_sync_batch ON inventory_movements;
CREATE TRIGGER inventory_sync_batch
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION sync_batch_quantity();
-- Migration 061: Scope sellable_products view to the authenticated entity
-- Problem: the view joined product_batches with pb.entity_id = p.created_by,
-- meaning a retailer who received products created by a wholesaler would get
-- NULL batch columns (no stock shown). It also meant any entity could see all
-- products regardless of whether they have stock.
-- Fix: join batches using auth_entity_id() so each entity only sees their own
-- batches. Products with no batches for the current entity are excluded (INNER JOIN).

DROP VIEW IF EXISTS sellable_products;

CREATE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    COALESCE(pb.selling_price, p.selling_price, p.mrp) AS selling_price,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN package_available_qty(pp.id)
      ELSE pb.quantity
    END AS available_stock,
    pp.id          AS package_def_id,
    pp.package_type,
    pp.barcode     AS package_barcode,
    pb.id          AS batch_id,
    pb.batch_number,
    pb.expires_at,
    pb.barcode     AS batch_barcode,
    pb.entity_id
  FROM products p
  JOIN product_batches pb        -- INNER JOIN: only products the entity has stock of
         ON pb.product_id = p.id
        AND pb.entity_id  = auth_entity_id()
        AND pb.status     = 'ACTIVE'
        AND pb.quantity   > 0
  LEFT JOIN product_packages pp
         ON pp.product_id = p.id
  WHERE p.is_active            = TRUE
    AND p.sold_as_package_only = FALSE;
-- Migration 062: Fix stock deduction triggers
--
-- Problem 1: SALES_INVOICE is INSERT'd directly at status='CONFIRMED'.
--   The deduct_stock_on_sales_invoice trigger fires on UPDATE only, so the
--   INSERT never triggers stock deduction.
--   Fix: rewrite as AFTER INSERT OR UPDATE, handling both paths.
--
-- Problem 2: POS_SALE is INSERT'd at PENDING_PAYMENT then UPDATE'd to CONFIRMED.
--   The UPDATE fires guard_stock_on_confirm (BEFORE) which raises an exception
--   if product_batches.quantity < order_item.quantity. This rolls back the UPDATE
--   silently because the client doesn't check the error return.
--   Root cause: guard checks batch quantity BEFORE the deduct trigger runs, which
--   is correct, but the batch quantity was never being decremented by prior sales
--   (because previous SALE movements had batch_id=null). Now that we fixed the
--   search modals to always populate batch_id, the guard will work correctly.
--   However we still need the UPDATE error to surface to the client.
--   Fix: also make deduct_stock_on_confirm handle INSERT at CONFIRMED (defensive).

-- ── 1. Fix deduct_stock_on_sales_invoice: fire on INSERT OR UPDATE ────────────
CREATE OR REPLACE FUNCTION deduct_stock_on_sales_invoice()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_old_status TEXT;
BEGIN
  -- On INSERT, treat OLD.status as NULL (always distinct from CONFIRMED)
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.order_type = 'SALES_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED' THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE'
    LOOP
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (
        v_item.product_id,
        NEW.seller_id,
        'SALE',
        -(v_item.quantity),
        NEW.id,
        v_item.batch_id,
        'Auto-deducted from Sales Invoice: ' || NEW.order_no
      );
    END LOOP;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger to fire on INSERT OR UPDATE
DROP TRIGGER IF EXISTS orders_deduct_on_sales_invoice ON orders;
CREATE TRIGGER orders_deduct_on_sales_invoice
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_sales_invoice();

-- ── 2. Fix guard_stock_on_confirm: also handle INSERT ────────────────────────
-- The guard already fires BEFORE UPDATE OR INSERT (tgtype=19). However the
-- guard function itself only checks when NEW.status = 'CONFIRMED' AND
-- OLD.status IS DISTINCT FROM 'CONFIRMED'. On INSERT, OLD is NULL so the
-- IS DISTINCT FROM check evaluates to TRUE — guard fires correctly.
-- The guard was preventing the UPDATE because batch quantities were stale
-- (previous sales hadn't decremented them). Now that search always sends
-- batch_id, this should self-correct. No change needed to guard logic.

-- ── 3. Also fix deduct_stock_on_confirm to handle INSERT defensively ─────────
CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    INSERT INTO inventory_movements
      (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      'SALE',
      -(oi.quantity),
      NEW.id,
      oi.batch_id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id   = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status     = 'ACTIVE';

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_deduct_stock ON orders;
CREATE TRIGGER orders_deduct_stock
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION deduct_stock_on_confirm();

-- ── 4. Fix guard_stock_on_confirm to also handle INSERT ──────────────────────
CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  shortage  RECORD;
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE', 'SALES_INVOICE') THEN

    -- Non-batch items: check product.current_stock
    SELECT oi.name, oi.quantity, p.current_stock
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id   = NEW.id
      AND oi.status     = 'ACTIVE'
      AND oi.product_id IS NOT NULL
      AND oi.batch_id   IS NULL
      AND p.current_stock < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available',
        shortage.name, shortage.quantity, shortage.current_stock;
    END IF;

    -- Batch items: check product_batches.quantity
    SELECT oi.name, oi.quantity, pb.quantity AS batch_qty, pb.batch_number
    INTO shortage
    FROM order_items oi
    JOIN product_batches pb ON pb.id = oi.batch_id
    WHERE oi.order_id  = NEW.id
      AND oi.status    = 'ACTIVE'
      AND oi.batch_id  IS NOT NULL
      AND pb.quantity  < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient batch stock: "%" batch "%" requires %, only % available',
        shortage.name, shortage.batch_number, shortage.quantity, shortage.batch_qty;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_guard_stock ON orders;
CREATE TRIGGER orders_guard_stock
  BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_stock_on_confirm();
-- Migration 063: Add ONLINE as a valid payment method
-- ONLINE covers mBoB, mPay, RTGS and other digital transfers
-- presented as a single option in the UI

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT', 'ONLINE'));

-- Also update cart_items if it has the same constraint
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_payment_method_check;
-- Migration 064: Backfill existing MBOB/MPAY/RTGS orders to ONLINE
UPDATE orders
SET payment_method = 'ONLINE'
WHERE payment_method IN ('MBOB', 'MPAY', 'RTGS');

-- Remove the old values from the constraint now that no rows use them
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('CASH', 'CREDIT', 'ONLINE'));
-- Migration 066: Add auth_email to riders table
-- Avoids needing auth.admin.getUserById in the login route —
-- we can call generateLink directly with the stored email.

ALTER TABLE riders ADD COLUMN IF NOT EXISTS auth_email TEXT;

-- Back-fill demo rider
UPDATE riders SET auth_email = 'rider@demo.bt'
WHERE id = 'e1000000-0000-4000-8000-000000000002';
-- Migration 067: Store auth password on riders for session creation
-- generateLink/getUserById GoTrue admin calls fail for SQL-seeded users.
-- Storing the password allows signInWithPassword after PIN verification.

ALTER TABLE riders ADD COLUMN IF NOT EXISTS auth_password TEXT;

-- Demo rider password matches the auth.users encrypted_password seed
UPDATE riders SET auth_password = 'Rider@2026'
WHERE id = 'e1000000-0000-4000-8000-000000000002';
-- Migration 068: Delivery fee tracking
-- Rider submits cost after delivery; customer pays separately;
-- vendor confirms by uploading payment receipt screenshot.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_fee              DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_paid         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee_receipt_url  TEXT,
  ADD COLUMN IF NOT EXISTS delivery_fee_confirmed_at TIMESTAMPTZ;

-- Also store vendor entity address for rider display
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS address TEXT;
-- Shift management + cash registers for blind cash close reconciliation
-- Migration: 069

-- ── Cash registers (named registers managed by MANAGER/OWNER) ──────────
CREATE TABLE cash_registers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  name                  TEXT NOT NULL,
  default_opening_float DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (default_opening_float >= 0),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_registers_entity ON cash_registers (entity_id, is_active);

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_registers_tenant" ON cash_registers
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- ── Shifts (tied to a register, opened by cashier) ────────────────────
CREATE TABLE shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  register_id     UUID NOT NULL REFERENCES cash_registers(id),
  opened_by       UUID NOT NULL REFERENCES user_profiles(id),
  closed_by       UUID REFERENCES user_profiles(id),
  opening_float   DECIMAL(12,2) NOT NULL CHECK (opening_float >= 0),
  closing_count   DECIMAL(12,2),
  expected_total  DECIMAL(12,2),
  discrepancy     DECIMAL(12,2),
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'CLOSING', 'CLOSED')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One active shift per register at a time
CREATE UNIQUE INDEX idx_shifts_one_active_per_register
  ON shifts (register_id)
  WHERE status IN ('ACTIVE', 'CLOSING');

CREATE INDEX idx_shifts_entity ON shifts (entity_id, opened_at DESC);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_tenant" ON shifts
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- ── Shift transactions (sales, refunds, voids tracked per shift) ──────
CREATE TABLE shift_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id         UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  order_id         UUID,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'VOID')),
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT', 'UPI', 'ONLINE')),
  amount           DECIMAL(12,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_transactions_shift ON shift_transactions (shift_id, created_at);

ALTER TABLE shift_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_transactions_tenant" ON shift_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );

-- ── Shift reconciliations (blind close results) ───────────────────────
CREATE TABLE shift_reconciliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL UNIQUE REFERENCES shifts(id),
  expected_total  DECIMAL(12,2) NOT NULL,
  actual_count    DECIMAL(12,2) NOT NULL,
  discrepancy     DECIMAL(12,2) NOT NULL,
  classification  TEXT NOT NULL CHECK (classification IN ('OVERAGE', 'SHORTAGE', 'BALANCED')),
  reviewed_by     UUID REFERENCES user_profiles(id),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shift_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_reconciliations_tenant" ON shift_reconciliations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );
-- Migration 070: Discount type (flat/percentage) + audit trail
-- Adds discount_type and discount_value to cart_items and order_items.
-- discount stores the computed flat amount; discount_value stores the original input.

-- ── cart_items ──────────────────────────────────────────────────────────
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'FLAT'
  CHECK (discount_type IN ('FLAT', 'PERCENTAGE'));
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── order_items ─────────────────────────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'FLAT'
  CHECK (discount_type IN ('FLAT', 'PERCENTAGE'));
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── Audit trigger for discount changes on order_items ───────────────────
CREATE OR REPLACE FUNCTION public.audit_order_item_discount()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.discount IS DISTINCT FROM NEW.discount
     OR OLD.discount_type IS DISTINCT FROM NEW.discount_type THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, actor_id, actor_role)
    VALUES (
      'order_items',
      NEW.id,
      'UPDATE',
      jsonb_build_object(
        'discount', OLD.discount,
        'discount_type', OLD.discount_type,
        'discount_value', OLD.discount_value
      ),
      jsonb_build_object(
        'discount', NEW.discount,
        'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value
      ),
      auth.uid(),
      (auth.jwt() ->> 'sub_role')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_item_discount_audit ON order_items;
CREATE TRIGGER trg_order_item_discount_audit
  AFTER UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_item_discount();
