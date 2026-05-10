-- Migration 064: Backfill existing MBOB/MPAY/RTGS orders to ONLINE
UPDATE orders
SET payment_method = 'ONLINE'
WHERE payment_method IN ('MBOB', 'MPAY', 'RTGS');

-- Remove the old values from the constraint now that no rows use them
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('CASH', 'CREDIT', 'ONLINE'));
