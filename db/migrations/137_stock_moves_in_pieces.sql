-- 137: stock triggers must count in PIECES, not in the unit the line was sold in.
--
-- WHY: migration 134 let a ticket line be rung in Packs or Cases — quantity stays in the SOLD
-- unit and unit_price is the price of one of it, so `quantity x unit_price = total` and every
-- total, report and GST figure is unchanged. The factor was only ever supposed to enter where
-- stock is read or written, and on the cloud side that is exactly these triggers, which still
-- read `oi.quantity` raw. Selling 2 cases of 240 therefore took 2 pieces off the shelf.
--
-- The terminal was never affected: it writes inventory_movements itself, already in pieces
-- (desktop/lib/units.ts), and its synced orders insert their order_items AFTER the order row,
-- so the confirm-time trigger below finds no lines and has no stock side effect for them. This
-- is the WEB till's path, which is now being brought to the same RanceLab parity.
--
-- unit_factor is NOT NULL DEFAULT 1, so COALESCE is belt-and-braces and every existing row and
-- every line rung in pieces multiplies by 1 — the arithmetic is unchanged for them.
--
-- Package lines (Model B — migrations 084/085) are deliberately untouched: a pallet, a box and
-- a piece are separate stock-carrying products there, so they have no unit ladder to scale by.
--
-- NOTE: the POS *tables* live in the `pos` schema (migration 121 flip), but these trigger
-- FUNCTIONS are still `public.<name>()` carrying `SET search_path = pos, public`, which is how
-- their unqualified table references resolve. Same-named copies exist in `pos` and are bound to
-- nothing — replacing those changes no behaviour at all. Redefine the `public` ones.

BEGIN;

-- 1. Deduction on confirm ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    INSERT INTO inventory_movements
      (product_id, entity_id, warehouse_id, movement_type, quantity, reference_id, batch_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      NEW.warehouse_id,
      'SALE',
      -- Pieces, not sold units: 2 cases of 240 leave the shelf as 480.
      -(oi.quantity * COALESCE(oi.unit_factor, 1)),
      NEW.id,
      oi.batch_id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id   = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status     = 'ACTIVE';

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pos, public;

-- 2. The pre-confirm sufficiency guard -------------------------------------------------------
-- Stock is held in pieces, so the comparison has to be made in pieces too — otherwise a case
-- passes the guard against a shelf holding a handful of loose ones. The message reports what
-- the cashier actually typed alongside the pieces it needs, so "requires 2" against "3
-- available" can never read as a contradiction.
CREATE OR REPLACE FUNCTION public.guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  shortage  RECORD;
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE', 'SALES_INVOICE') THEN

    -- Non-batch items: check product.current_stock
    SELECT oi.name,
           oi.quantity * COALESCE(oi.unit_factor, 1) AS pieces,
           oi.quantity AS sold_qty,
           COALESCE(oi.unit_label, 'Pcs') AS unit_label,
           p.current_stock
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id   = NEW.id
      AND oi.status     = 'ACTIVE'
      AND oi.product_id IS NOT NULL
      AND oi.batch_id   IS NULL
      AND p.current_stock < oi.quantity * COALESCE(oi.unit_factor, 1)
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient stock: "%" requires % (% x %), only % available',
        shortage.name, shortage.pieces, shortage.sold_qty, shortage.unit_label, shortage.current_stock;
    END IF;

    -- Batch items: check product_batches.quantity
    SELECT oi.name,
           oi.quantity * COALESCE(oi.unit_factor, 1) AS pieces,
           oi.quantity AS sold_qty,
           COALESCE(oi.unit_label, 'Pcs') AS unit_label,
           pb.quantity AS batch_qty,
           pb.batch_number
    INTO shortage
    FROM order_items oi
    JOIN product_batches pb ON pb.id = oi.batch_id
    WHERE oi.order_id  = NEW.id
      AND oi.status    = 'ACTIVE'
      AND oi.batch_id  IS NOT NULL
      AND pb.quantity  < oi.quantity * COALESCE(oi.unit_factor, 1)
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient batch stock: "%" batch "%" requires % (% x %), only % available',
        shortage.name, shortage.batch_number, shortage.pieces, shortage.sold_qty,
        shortage.unit_label, shortage.batch_qty;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pos, public;

-- 3. Restore on whole-order cancellation -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_stock_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    IF OLD.status IN (
      'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED',
      'CANCELLATION_REQUESTED', 'REFUND_REQUESTED'
    ) THEN
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      SELECT
        oi.product_id,
        NEW.seller_id,
        'RETURN',
        -- Mirrors the deduction exactly, so a cancel puts back precisely what the sale took.
        oi.quantity * COALESCE(oi.unit_factor, 1),
        NEW.id,
        oi.batch_id,
        'Auto-restored on order cancellation: ' || NEW.order_no
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE';

      UPDATE order_items
        SET status = 'CANCELLED'
      WHERE order_id = NEW.id
        AND status   = 'ACTIVE';
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pos, public;

-- 4. Restore on a per-line refund ------------------------------------------------------------
-- refunds.quantity is recorded in the unit the line was SOLD in (a customer returns one case),
-- so it scales by the same factor. The package branch is Model B and stays as it was.
CREATE OR REPLACE FUNCTION public.restore_stock_on_item_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  v_qty       NUMERIC;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;

    -- Only restock what was actually returned. Partial return (1 of 2) → restock 1, not 2.
    SELECT COALESCE(SUM(quantity), 0) INTO v_qty
      FROM refunds WHERE order_item_id = NEW.id AND status = 'APPROVED';
    IF v_qty IS NULL OR v_qty = 0 THEN
      v_qty := NEW.quantity;          -- defensive fallback: no approved refund row → full line
    END IF;

    IF NEW.product_id IS NOT NULL THEN
      -- Product-backed line (single or Model-B package): restore the product's own stock + batch.
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', v_qty * COALESCE(NEW.unit_factor, 1),
        NEW.order_id, NEW.batch_id,
        'Refund: ' || COALESCE(NEW.name, '') || ' (' || v_order_no || ')');
    ELSIF NEW.package_id IS NOT NULL THEN
      -- Legacy package line with no product_id: restore the component leaves, scaled by v_qty.
      FOR leaf IN
        SELECT product_id, SUM(total_qty * v_qty) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, v_qty,
          'Refund package: ' || COALESCE(NEW.package_name, '') || ' (' || v_order_no || ')');
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = pos, public;

COMMIT;
