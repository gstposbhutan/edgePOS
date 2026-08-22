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
