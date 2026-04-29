-- Migration 063: Add ONLINE as a valid payment method
-- ONLINE covers mBoB, mPay, RTGS and other digital transfers
-- presented as a single option in the UI

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT', 'ONLINE'));

-- Also update cart_items if it has the same constraint
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_items_payment_method_check;
