-- 110: fix restock_buyer_on_delivery — wrong column AND wrong target product.
--
-- Two defects, both latent because the function errored before it could run:
--   1. It inserted into inventory_movements(..., timestamp), but the column is created_at (default
--      now()). Every WHOLESALE order reaching DELIVERED/COMPLETED errored with
--      'column "timestamp" does not exist' and rolled back — so this restock never actually happened.
--   2. It restocked oi.product_id — the SELLER's product row. In this schema products are per-entity
--      (products.created_by owns the row and its current_stock), so bumping oi.product_id credits the
--      SELLER's stock, not the buyer's. The correct target is the buyer's OWN mirror of the product
--      (products where source_product_id = oi.product_id AND created_by = buyer), the same rows the
--      console "receive-on-buy" creates.
--
-- Also, the console B2B flow (createB2BOrder) already receives the buyer's stock at CONFIRM. So if the
-- buyer already has any RESTOCK for this order, delivery must NOT restock again — skip entirely.
-- Net behaviour:
--   • console orders (received at confirm) → skip on delivery (no double count).
--   • orders not yet received → restock the buyer's mirror product; if the buyer has no mirror, do
--     nothing (never touch the seller's stock).

CREATE OR REPLACE FUNCTION "public"."restock_buyer_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status IN ('DELIVERED', 'COMPLETED')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.order_type = 'WHOLESALE'
     AND NEW.buyer_id IS NOT NULL THEN

    -- Already received at confirm (console receive-on-buy)? Nothing to do.
    IF EXISTS (
      SELECT 1 FROM inventory_movements m
      WHERE m.reference_id = NEW.id AND m.entity_id = NEW.buyer_id AND m.movement_type = 'RESTOCK'
    ) THEN
      RETURN NEW;
    END IF;

    -- Restock the buyer's OWN mirror of each ordered product (never the seller's product row).
    INSERT INTO inventory_movements (id, product_id, entity_id, movement_type, quantity, reference_id)
    SELECT gen_random_uuid(), bp.id, NEW.buyer_id, 'RESTOCK', oi.quantity, NEW.id
    FROM order_items oi
    JOIN products bp ON bp.source_product_id = oi.product_id AND bp.created_by = NEW.buyer_id
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
