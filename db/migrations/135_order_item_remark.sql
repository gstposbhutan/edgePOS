-- 135: per-line item remark (the counter's Ctrl+T).
--
-- A free-text note against ONE sold line — "no chilli", "customer's own container", "damaged
-- carton, sold as seen". Distinct from any order-level note: it belongs to the line, prints
-- beside it on the slip, and is what a shop points at when a customer queries that item later.
--
-- Terminals write it into orders.items and the sync carries it into order_items. Nullable and
-- additive, so every existing row and read path is unaffected.
-- NOTE: POS tables live in the `pos` schema (migration 121 flip), not public.

BEGIN;

ALTER TABLE pos.order_items ADD COLUMN IF NOT EXISTS remark text;

-- Bounded to match the terminal's field (PB migration 028), so a line can never carry more than
-- the slip can print.
ALTER TABLE pos.order_items DROP CONSTRAINT IF EXISTS order_items_remark_len_check;
ALTER TABLE pos.order_items ADD CONSTRAINT order_items_remark_len_check
  CHECK (remark IS NULL OR char_length(remark) <= 200);

COMMENT ON COLUMN pos.order_items.remark IS
  'Cashier note on this line (Ctrl+T at the counter). Prints beside the line on the receipt.';

COMMIT;
