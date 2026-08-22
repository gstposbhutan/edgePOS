-- 113: receive purchase invoices into a specific warehouse (Phase 2, distributor/wholesaler PO/PI).
--
-- Adds orders.warehouse_id (the destination a purchase invoice is received into) and teaches
-- restock_on_invoice_confirm to stamp it onto the created batch + RESTOCK movement — so a tier's
-- purchase lands in warehouse_stock for that depot. Retailer PIs leave warehouse_id NULL and behave
-- exactly as before (entity-level).
--
-- Also fixes a cost-vs-price bug for the tiers: the trigger set products.wholesale_price = unit_cost.
-- For a retailer, wholesale_price IS their cost, so that's correct. For a distributor/wholesaler,
-- wholesale_price is their SELL price and unit_cost is what they paid — so a warehouse (tier) PI now
-- updates products.manufacturer_price (the buy cost) instead, leaving their sell price alone.
--
-- And fixes a pre-existing double-count: the old trigger inserted the batch with quantity = the line
-- qty AND then a RESTOCK movement of the same qty, so sync_batch_quantity doubled the batch (line 40
-- → batch 80) while current_stock rose correctly by 40. Now the batch is created at 0 and the RESTOCK
-- movement sets its quantity (the same pattern /api/inventory/receive uses) — batch, current_stock and
-- warehouse_stock all agree.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION "public"."restock_on_invoice_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item     RECORD;
  v_batch_id UUID;
  v_batch_no TEXT;
  v_mrp      DECIMAL(12,2);
  v_sell     DECIMAL(12,2);
BEGIN
  IF NEW.order_type = 'PURCHASE_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.buyer_id IS NOT NULL THEN

    FOR v_item IN
      SELECT oi.* FROM order_items oi
      WHERE oi.order_id = NEW.id AND oi.product_id IS NOT NULL AND oi.status = 'ACTIVE'
    LOOP
      v_batch_no := COALESCE(NULLIF(TRIM(v_item.batch_number), ''),
        'PI-' || NEW.order_no || '-' || SUBSTRING(v_item.id::TEXT, 1, 8));

      SELECT mrp, COALESCE(selling_price, mrp) INTO v_mrp, v_sell FROM products WHERE id = v_item.product_id;

      INSERT INTO product_batches (
        product_id, entity_id, warehouse_id, batch_number, barcode,
        manufactured_at, expires_at, quantity, unit_cost, mrp, selling_price, status, notes
      ) VALUES (
        v_item.product_id, NEW.buyer_id, NEW.warehouse_id, v_batch_no,
        NULLIF(TRIM(COALESCE(v_item.batch_barcode, '')), ''),
        v_item.manufactured_at, v_item.expires_at, 0,   -- start at 0; the RESTOCK movement below sets it
        COALESCE(v_item.unit_cost, v_item.unit_price), v_mrp, v_sell, 'ACTIVE',
        'Created from Purchase Invoice: ' || NEW.order_no
      )
      ON CONFLICT (product_id, entity_id, batch_number) DO NOTHING
      RETURNING id INTO v_batch_id;

      IF v_batch_id IS NOT NULL THEN
        INSERT INTO inventory_movements
          (product_id, entity_id, warehouse_id, movement_type, quantity, reference_id, batch_id, notes)
        VALUES (
          v_item.product_id, NEW.buyer_id, NEW.warehouse_id, 'RESTOCK', v_item.quantity,
          NEW.id, v_batch_id, 'Auto-restocked from Purchase Invoice: ' || NEW.order_no
        );

        IF v_item.unit_cost IS NOT NULL THEN
          IF NEW.warehouse_id IS NOT NULL THEN
            -- Tier PI: unit_cost is the buy/manufacturer cost, not the sell price.
            UPDATE products SET manufacturer_price = v_item.unit_cost, updated_at = NOW() WHERE id = v_item.product_id;
          ELSE
            -- Retailer PI: wholesale_price is the retailer's cost (unchanged behaviour).
            UPDATE products SET wholesale_price = v_item.unit_cost, updated_at = NOW() WHERE id = v_item.product_id;
          END IF;
        END IF;
      END IF;
    END LOOP;

    UPDATE orders SET received_at = NOW() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
