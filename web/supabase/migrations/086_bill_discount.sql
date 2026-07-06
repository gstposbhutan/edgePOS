-- 086_bill_discount.sql
-- Invoice/bill-level discount: a single amount taken off the PRE-GST net subtotal (after per-line
-- discounts), then GST computed on the net. It is NOT distributed across line items — per-line
-- discounts (order_items.discount) remain a separate, also-pre-GST input. Lives on the cart while
-- ringing and is snapshotted onto the order at checkout.
BEGIN;
ALTER TABLE "public"."carts"  ADD COLUMN IF NOT EXISTS "bill_discount" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "public"."orders" ADD COLUMN IF NOT EXISTS "bill_discount" numeric(12,2) NOT NULL DEFAULT 0;
COMMIT;
