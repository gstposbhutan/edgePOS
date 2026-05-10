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
