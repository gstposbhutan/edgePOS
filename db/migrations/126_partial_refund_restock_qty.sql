-- 126 — partial refunds must restock only the RETURNED quantity, not the whole line.
--
-- Bug (found while smoke-testing #36 returns): returning 1 of a 2-qty line refunds the
-- prorated money correctly (½), but the approve route marks the whole order_item REFUNDED
-- and restore_stock_on_item_refund() restocks NEW.quantity — the FULL line (2). So stock
-- over-restores on every partial-quantity return; full-line returns (the common replace path)
-- were unaffected.
--
-- Fix: restock the sum of APPROVED refund quantities for the line instead of the line qty.
-- The approve route sets refunds.status=APPROVED before flipping the item to REFUNDED, so the
-- row is visible here. Falls back to the full line quantity if no approved refund is found
-- (defensive — e.g. any other path that marks a line REFUNDED). Package-leaf explosion scales
-- by the same refunded quantity. Idempotent (CREATE OR REPLACE); trigger wiring unchanged.

CREATE OR REPLACE FUNCTION public.restore_stock_on_item_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pos', 'public'
AS $function$
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
      VALUES (NEW.product_id, v_seller_id, 'RETURN', v_qty, NEW.order_id, NEW.batch_id,
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
$function$;
