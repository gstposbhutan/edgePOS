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
