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
