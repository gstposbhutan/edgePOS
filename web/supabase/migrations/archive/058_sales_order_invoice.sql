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
