-- 114: deduct B2B sales from a source warehouse (Phase 2 — warehouse-aware selling).
--
-- The two SALE-deduction triggers insert their SALE movement with no warehouse_id, so a sale only
-- moved products.current_stock. Stamp NEW.warehouse_id onto the SALE so a tier sell order that carries
-- a source warehouse also draws down that depot's warehouse_stock. POS_SALE / MARKETPLACE / retailer
-- orders (and any tier order left without a source warehouse) have warehouse_id NULL → entity-level,
-- exactly as before.

CREATE OR REPLACE FUNCTION "public"."deduct_stock_on_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
      -(oi.quantity),
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
$$;

CREATE OR REPLACE FUNCTION "public"."deduct_stock_on_sales_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item RECORD;
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.order_type = 'SALES_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED' THEN

    FOR v_item IN
      SELECT oi.* FROM order_items oi
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.status = 'ACTIVE'
    LOOP
      INSERT INTO inventory_movements
        (product_id, entity_id, warehouse_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (
        v_item.product_id, NEW.seller_id, NEW.warehouse_id, 'SALE', -(v_item.quantity),
        NEW.id, v_item.batch_id, 'Auto-deducted from Sales Invoice: ' || NEW.order_no
      );
    END LOOP;

  END IF;
  RETURN NEW;
END;
$$;
