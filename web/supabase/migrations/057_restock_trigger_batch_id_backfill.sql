-- Migration 056: Fix batch quantity double-count
-- product_batches.quantity should be set to 0 on creation.
-- The sync_batch_quantity() trigger (migration 013) will increment it
-- when the corresponding RESTOCK inventory_movement is inserted.
-- Previously the batch was inserted with the full quantity AND a RESTOCK
-- movement was created, causing the trigger to double the quantity.

CREATE OR REPLACE FUNCTION restock_on_invoice_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_item       RECORD;
  v_batch_id   UUID;
  v_batch_no   TEXT;
  v_mrp        DECIMAL(12,2);
  v_sell       DECIMAL(12,2);
BEGIN
  IF NEW.order_type = 'PURCHASE_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.buyer_id IS NOT NULL THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status = 'ACTIVE'
    LOOP
      v_batch_no := COALESCE(
        NULLIF(TRIM(v_item.batch_number), ''),
        'PI-' || NEW.order_no || '-' || SUBSTRING(v_item.id::TEXT, 1, 8)
      );

      SELECT mrp, COALESCE(selling_price, mrp)
        INTO v_mrp, v_sell
        FROM products WHERE id = v_item.product_id;

      -- Insert batch with quantity = 0; sync_batch_quantity trigger will
      -- increment it when the RESTOCK movement is inserted below.
      INSERT INTO product_batches (
        product_id, entity_id, batch_number, barcode,
        manufactured_at, expires_at,
        quantity,   -- 0: trigger sets this from movement
        unit_cost, mrp, selling_price, status, notes
      ) VALUES (
        v_item.product_id,
        NEW.buyer_id,
        v_batch_no,
        NULLIF(TRIM(COALESCE(v_item.batch_barcode, '')), ''),
        v_item.manufactured_at,
        v_item.expires_at,
        0,          -- NOT v_item.quantity — trigger will set this
        COALESCE(v_item.unit_cost, v_item.unit_price),
        v_mrp,
        v_sell,
        'ACTIVE',
        'Created from Purchase Invoice: ' || NEW.order_no
      )
      ON CONFLICT (product_id, entity_id, batch_number) DO NOTHING
      RETURNING id INTO v_batch_id;

      IF v_batch_id IS NOT NULL THEN
        -- Back-fill batch_id on the order_item so it's traceable
        UPDATE order_items
        SET batch_id = v_batch_id
        WHERE id = v_item.id;

        -- RESTOCK movement: sync_batch_quantity trigger increments batch.quantity
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
        VALUES (
          v_item.product_id,
          NEW.buyer_id,
          'RESTOCK',
          v_item.quantity,
          NEW.id,
          v_batch_id,
          'Auto-restocked from Purchase Invoice: ' || NEW.order_no
        );

        IF v_item.unit_cost IS NOT NULL THEN
          UPDATE products
          SET wholesale_price = v_item.unit_cost, updated_at = NOW()
          WHERE id = v_item.product_id;
        END IF;
      END IF;

    END LOOP;

    UPDATE orders SET received_at = NOW() WHERE id = NEW.id;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
