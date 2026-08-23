-- 136: carry the counter's unit ladder and per-line remark on the WEB cart.
--
-- WHY: migrations 134 (Pcs/Pack/Case on the item master) and 135 (order_items.remark) gave the
-- desktop terminal Alt+U and Ctrl+T. The web till is now being brought to the same RanceLab
-- parity, and its cart is SERVER-SIDE (pos.cart_items) rather than a local PocketBase table —
-- so the two facts a line must remember between keystrokes have nowhere to live:
--
--   unit_label / unit_factor  the level the line is being rung in ("Case", 240 pieces). The
--                             line keeps quantity in the SOLD unit and unit_price per one of
--                             that unit, so quantity x unit_price = total still holds; the
--                             factor enters only where stock is read or written.
--   remark                    the cashier's note on the line (Ctrl+T), copied to
--                             pos.order_items.remark (135) at checkout.
--
-- Deliberately NOT duplicated here: gst_exempt and the pack/case factors themselves. Those are
-- item-master facts and the cart's product join already reaches them — a second copy on the
-- line is a second thing that can go stale, and tax must never be client-trusted.
--
-- Stock stays counted in PIECES on both tills. See desktop/lib/units.ts (and web/lib/pos/units.js)
-- for the ladder, in particular why this is NOT the vendor-console package model (084/085).
--
-- NOTE: POS tables live in the `pos` schema (migration 121 flip), not public. Additive and
-- idempotent — every column is nullable or defaulted, so existing rows and every current read
-- path are unaffected.

BEGIN;

ALTER TABLE pos.cart_items ADD COLUMN IF NOT EXISTS unit_label  text;
ALTER TABLE pos.cart_items ADD COLUMN IF NOT EXISTS unit_factor numeric;
ALTER TABLE pos.cart_items ADD COLUMN IF NOT EXISTS remark      text;

-- A factor below 1 would silently shrink what leaves the shelf. NULL means "pieces", the
-- default every existing line already is.
ALTER TABLE pos.cart_items DROP CONSTRAINT IF EXISTS cart_items_unit_factor_check;
ALTER TABLE pos.cart_items ADD CONSTRAINT cart_items_unit_factor_check
  CHECK (unit_factor IS NULL OR unit_factor >= 1);

-- A label without a factor cannot be converted back to pieces, and a factor above 1 without a
-- label prints a quantity the slip cannot name. They travel together or not at all.
ALTER TABLE pos.cart_items DROP CONSTRAINT IF EXISTS cart_items_unit_pair_check;
ALTER TABLE pos.cart_items ADD CONSTRAINT cart_items_unit_pair_check
  CHECK ((unit_label IS NULL) = (unit_factor IS NULL));

-- Bounded to match order_items.remark (135) and the terminal's field (PB 028), so a line can
-- never carry more than the slip can print.
ALTER TABLE pos.cart_items DROP CONSTRAINT IF EXISTS cart_items_remark_len_check;
ALTER TABLE pos.cart_items ADD CONSTRAINT cart_items_remark_len_check
  CHECK (remark IS NULL OR char_length(remark) <= 200);

COMMENT ON COLUMN pos.cart_items.unit_label IS
  'Unit this line is rung in ("Pcs"/"Pack"/"Case" or the shop label). NULL = pieces.';
COMMENT ON COLUMN pos.cart_items.unit_factor IS
  'Pieces per one of unit_label. Stock is read and written in pieces: quantity x unit_factor.';
COMMENT ON COLUMN pos.cart_items.remark IS
  'Cashier note on this line (Ctrl+T at the counter). Copied to order_items.remark at checkout.';

COMMIT;
