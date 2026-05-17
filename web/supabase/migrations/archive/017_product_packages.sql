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
