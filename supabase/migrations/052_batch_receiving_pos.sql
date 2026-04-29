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
