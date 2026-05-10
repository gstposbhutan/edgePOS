-- Migration 055: Fix guard_stock_on_confirm to check batch-specific quantities
-- The original trigger (migration 014) only checked products.current_stock,
-- ignoring batch_id on order_items. This allows over-fulfilment from a single
-- batch even when product total stock is sufficient.

CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  shortage RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN

    -- 1. Non-batch items: check product-level current_stock
    SELECT oi.name, oi.quantity, p.current_stock
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id    = NEW.id
      AND oi.status      = 'ACTIVE'
      AND oi.product_id  IS NOT NULL
      AND oi.batch_id    IS NULL
      AND p.current_stock < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Insufficient stock: "%" requires %, only % available',
        shortage.name, shortage.quantity, shortage.current_stock;
    END IF;

    -- 2. Batch-specific items: check product_batches.quantity for the exact batch
    SELECT oi.name, oi.quantity, pb.quantity AS batch_qty, pb.batch_number
    INTO shortage
    FROM order_items oi
    JOIN product_batches pb ON pb.id = oi.batch_id
    WHERE oi.order_id   = NEW.id
      AND oi.status     = 'ACTIVE'
      AND oi.batch_id   IS NOT NULL
      AND pb.quantity   < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Insufficient batch stock: "%" batch "%" requires %, only % available',
        shortage.name, shortage.batch_number, shortage.quantity, shortage.batch_qty;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
