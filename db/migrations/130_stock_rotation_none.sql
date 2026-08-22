-- 130: allow a third stock-rotation option 'NONE' — no rotation policy for the product.
-- The cashier bills whichever batch the customer wants; no FEFO nudge, no expiry requirement.
-- (The FEFO triggers from migration 129 only act when stock_rotation = 'FEFO', so NONE is inert
-- to them, exactly like FIFO.) Idempotent.

ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_stock_rotation_check;
ALTER TABLE pos.products ADD CONSTRAINT products_stock_rotation_check
  CHECK (stock_rotation IN ('FEFO', 'FIFO', 'NONE'));
