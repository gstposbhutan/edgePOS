-- 109: restore stock at product level (not package leaves) when a line is refunded.
--
-- restore_stock_on_item_refund is the SOLE restorer on a line refund (unlike cancel there is no
-- order-level counterpart). It checked package_id FIRST, so a Model-B package line (product_id = the
-- package product, package_id also set) had its component LEAVES restored — but deduct_stock_on_confirm
-- / deduct_stock_on_sales_invoice removed the package PRODUCT's stock, so the refund credited the wrong
-- rows. It also omitted batch_id for single lines, so a batch-tracked product's batch qty wasn't
-- restored.
--
-- Fix (symmetric to migration 108): prefer product_id — every single product and every Model-B package
-- restores product-level, batch-aware. Fall back to the package-leaf path only for a legacy package
-- line that has no product_id of its own. Single restorer, so no double-count risk.

CREATE OR REPLACE FUNCTION "public"."restore_stock_on_item_refund"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.product_id IS NOT NULL THEN
      -- Product-backed line (single or Model-B package): restore the product's own stock + batch.
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id, NEW.batch_id,
        'Refund: ' || COALESCE(NEW.name, '') || ' (' || v_order_no || ')');
    ELSIF NEW.package_id IS NOT NULL THEN
      -- Legacy package line with no product_id: restore the component leaves.
      FOR leaf IN
        SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
          'Refund package: ' || COALESCE(NEW.package_name, '') || ' (' || v_order_no || ')');
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
