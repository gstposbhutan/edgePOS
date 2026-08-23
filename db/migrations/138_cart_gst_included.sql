-- 138: the ticket's GST basis (the till's Alt+T) belongs to the CART, not to the browser tab.
--
-- WHY: Alt+T says the catalog rates already contain the 5%, so the tax is extracted from the
-- entered rate rather than added on top. On the terminal the cart lives locally and the till
-- computes its own line totals, so the basis could sit in the app. The web cart is SERVER-side:
-- `pos.cart_items.gst_5` and `.total` are written by the API, which had no way to know which
-- basis the cashier was ringing on. The bill total would have come out inclusive while every
-- line on the slip stayed exclusive — a receipt that does not add up.
--
-- Putting it on the cart (rather than passing a flag per request) means the server decides, one
-- ticket has exactly one basis, and a stale tab cannot re-base a line on its own.
--
-- The till refuses to flip the basis once a ticket has lines, and the API enforces the same
-- rule, so no existing line ever needs recomputing.
--
-- NOTE: POS tables live in the `pos` schema (migration 121 flip), not public. Additive with a
-- default, so every existing cart reads exactly as it did.

BEGIN;

ALTER TABLE pos.carts ADD COLUMN IF NOT EXISTS gst_included boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pos.carts.gst_included IS
  'Alt+T: the rates on this ticket already contain GST, so it is extracted rather than added. '
  'Set only while the cart is empty — one ticket, one basis.';

COMMIT;
