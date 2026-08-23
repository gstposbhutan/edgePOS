-- 134: Pcs / Pack / Case unit ladder on the item master.
--
-- WHY: shops trained on RanceLab expect the counter's Alt+U "unit sheet" — pick Pcs, Pack or
-- Case on a ticket line and type the quantity in that unit. That needs a conversion factor per
-- item, which nothing carried. The vendor-console package model (migrations 084/085) DOES hold
-- factors in package_items.quantity, but it is Model B — pallet/box/piece are three separate
-- stock-carrying products — while the counter needs Model A: ONE line, one stock pool in
-- pieces, quantity scaled by a factor. Two integers on the item master say exactly that, and
-- keep the sealed-package semantics away from the till.
--
-- LADDER (pieces per unit):
--   Pcs  = 1
--   Pack = pack_size
--   Case = pack_size * case_size          -- a case is a number of PACKS, as RanceLab means it
-- NULL at a level means the shop does not sell that level; the sheet simply omits it rather
-- than inventing a quantity. case_size therefore requires pack_size (enforced below).
--
-- Stock is ALWAYS held and moved in pieces. The terminal writes inventory_movements in pieces,
-- so cloud stock reconciles through the existing apply_inventory_movement trigger untouched.
--
-- NOTE: POS tables live in the `pos` schema (migration 121 flip), not public. Non-destructive,
-- idempotent, additive only — every column is nullable or defaulted, so existing rows and every
-- current read path are unaffected.

BEGIN;

-- 1. Item master: the conversion factors ----------------------------------------------------
ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS pack_size  integer;
ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS case_size  integer;

-- Shops say "carton", "box", "crate" — let them label the levels. NULL falls back to the
-- spec's Pack / Case in the UI, so nothing has to be filled in for the default ladder.
ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS pack_label text;
ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS case_label text;

-- A factor of 0 or 1 is not a unit level, it is a data-entry slip that would silently make a
-- Case mean one piece. Reject it at the DB rather than let the counter sell on it.
ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_pack_size_check;
ALTER TABLE pos.products ADD CONSTRAINT products_pack_size_check
  CHECK (pack_size IS NULL OR pack_size > 1);

ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_case_size_check;
ALTER TABLE pos.products ADD CONSTRAINT products_case_size_check
  CHECK (case_size IS NULL OR case_size > 1);

-- A case is counted in packs, so a case without a pack has no defined size. Blocking this is
-- what keeps the sheet from inventing a quantity — the failure the ladder exists to avoid.
ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_case_requires_pack_check;
ALTER TABLE pos.products ADD CONSTRAINT products_case_requires_pack_check
  CHECK (case_size IS NULL OR pack_size IS NOT NULL);

-- Weighed goods are sold by measure (1.5 kg), not by sealed pack — the two are mutually
-- exclusive. Enforced here so a shop cannot configure a contradiction the till must guess at.
ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_weighed_has_no_pack_check;
ALTER TABLE pos.products ADD CONSTRAINT products_weighed_has_no_pack_check
  CHECK (NOT (COALESCE(sold_by_weight, false) AND pack_size IS NOT NULL));

COMMENT ON COLUMN pos.products.pack_size IS
  'Pieces per pack. NULL = this item has no pack level. Stock is always held in pieces.';
COMMENT ON COLUMN pos.products.case_size IS
  'PACKS per case (pieces per case = pack_size * case_size). NULL = no case level; requires pack_size.';

-- 2. Sold lines: record which unit was rung ------------------------------------------------
-- quantity stays in the SOLD unit and unit_price is the price of one of that unit, so
-- quantity * unit_price = total still holds and every existing report keeps working untouched.
-- unit_factor is what lets a report explode a line back to pieces; without it "2 x Rice" is
-- ambiguous between 2 pieces and 2 cases.
ALTER TABLE pos.order_items ADD COLUMN IF NOT EXISTS unit_label  text;
ALTER TABLE pos.order_items ADD COLUMN IF NOT EXISTS unit_factor integer NOT NULL DEFAULT 1;

ALTER TABLE pos.order_items DROP CONSTRAINT IF EXISTS order_items_unit_factor_check;
ALTER TABLE pos.order_items ADD CONSTRAINT order_items_unit_factor_check
  CHECK (unit_factor > 0);

COMMENT ON COLUMN pos.order_items.unit_factor IS
  'Pieces per sold unit (1 = sold in pieces). quantity * unit_factor = pieces moved.';

COMMIT;
