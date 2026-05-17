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
