-- 107: make restock_buyer_on_delivery idempotent (distributor/wholesaler parity, Phase 1).
--
-- The trigger restocks a WHOLESALE order's buyer when the order reaches DELIVERED/COMPLETED. As
-- written it inserts a RESTOCK movement per line UNCONDITIONALLY on every such transition, which
-- double-counts in two real cases:
--   1. DELIVERED → COMPLETED — both transitions fire it, restocking the buyer twice (latent bug in
--      the existing retailer↔wholesaler flow).
--   2. The console B2B flow (createB2BOrder) already receives the buyer's stock at CONFIRM
--      (receive-on-buy). If such an order later moves to DELIVERED, the trigger would restock again.
--
-- Fix: only insert for a line that hasn't already been restocked for this order+buyer (NOT EXISTS on
-- a prior RESTOCK keyed by reference_id + product_id + entity_id). This makes it safe to run any
-- number of times and lets console orders progress through DELIVERED without a double-count, while
-- preserving the retailer↔wholesaler behaviour (its first DELIVERED still restocks, since no prior
-- RESTOCK exists).

CREATE OR REPLACE FUNCTION "public"."restock_buyer_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status IN ('DELIVERED', 'COMPLETED')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.order_type = 'WHOLESALE'
     AND NEW.buyer_id IS NOT NULL THEN

    INSERT INTO inventory_movements (id, product_id, entity_id, movement_type, quantity, reference_id, timestamp)
    SELECT
      gen_random_uuid(),
      oi.product_id,
      NEW.buyer_id,
      'RESTOCK',
      oi.quantity,
      NEW.id,
      NOW()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements m
        WHERE m.reference_id = NEW.id
          AND m.product_id = oi.product_id
          AND m.entity_id = NEW.buyer_id
          AND m.movement_type = 'RESTOCK'
      );
  END IF;
  RETURN NEW;
END;
$$;
