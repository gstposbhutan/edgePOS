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
