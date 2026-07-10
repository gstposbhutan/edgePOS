-- 108: fix the double-restore of stock on order cancellation.
--
-- Root cause: two triggers restore a cancelled line's stock, and both run on a full cancel.
--   • restore_stock_on_cancel (order-level, on orders): on a fresh →CANCELLED for
--     POS_SALE/WHOLESALE/MARKETPLACE it INSERTs a RETURN movement per ACTIVE line (product-level,
--     batch-aware) AND flips those lines to CANCELLED.
--   • restore_stock_on_item_cancel (item-level, on order_items): on any line ACTIVE→CANCELLED it
--     ALSO INSERTs a RETURN movement.
-- So the order-level flip cascades into the item-level trigger and the stock is returned TWICE. The
-- partial-cancel route (/api/pos/orders/[id]/cancel) hits the same trap: it manually inserts a RETURN
-- and then flips the fully-cancelled line, firing the item trigger a second time.
--
-- There was also a Model-B correctness bug: for a package line the item trigger restored the package's
-- component LEAVES (resolve_package_to_leaves), but deduct_stock_on_confirm had deducted the package
-- PRODUCT (product_id) — so the wrong stock was credited back.
--
-- Fix: the order-level trigger and the cancel routes already restore every line that carries a
-- product_id — correctly, at product level, with batch_id, for both single products and Model-B
-- packages (product_id = the package product). The item-level trigger must therefore only handle the
-- one case those paths deliberately skip: a legacy package line with NO product_id of its own, whose
-- stock lives entirely in the component leaves. For any line WITH a product_id it now does nothing,
-- which eliminates the double count on both the full-cancel and partial-cancel paths and leaves the
-- proven product-level restore as the single source of truth.

CREATE OR REPLACE FUNCTION "public"."restore_stock_on_item_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  -- Only a fresh line cancellation, and ONLY for a legacy package line that has no product_id (its
  -- stock is tracked in the leaves). Lines with a product_id — every single product and every Model-B
  -- package — are restored by restore_stock_on_cancel (full cancel) or the partial-cancel route, so
  -- restoring them here too would double the stock.
  IF NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE'
     AND NEW.product_id IS NULL AND NEW.package_id IS NOT NULL THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    FOR leaf IN
      SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
      FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
    LOOP
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
      VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
        'Cancelled package: ' || COALESCE(NEW.package_name, '') || ' (' || v_order_no || ')');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
