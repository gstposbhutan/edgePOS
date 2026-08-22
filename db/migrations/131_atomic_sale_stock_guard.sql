-- 131: concurrency hardening — atomic, guarded stock decrements for SALES.
--
-- Before: sync_batch_quantity / apply_inventory_movement did an unguarded
--   `SET quantity = quantity + NEW.quantity`. Two terminals could both pass the confirm-time
--   availability CHECK (reading stale stock) and then both deduct → the batch goes negative
--   (oversold). Classic TOCTOU race, now real that FEFO auto-allocates across batches.
-- After: for SALE movements the decrement is a single guarded UPDATE. The row lock serializes
--   concurrent sales; the loser's `quantity >= sold` guard fails → NOT FOUND → RAISE, which
--   rolls back its whole order-confirm transaction. Non-sale movements (LOSS, adjustments,
--   transfers, restock) keep the old unguarded behaviour.
-- Scope: SALE + batch → guard the batch; SALE + no batch → guard the product's current_stock
--   (batch lines leave current_stock unguarded — it's their derived aggregate, already covered
--   by the batch guard, and must not independently block on drift).
-- Idempotent (CREATE OR REPLACE). Tables live in the `pos` schema (migration 121).

CREATE OR REPLACE FUNCTION public.sync_batch_quantity()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pos', 'public'
AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    IF NEW.movement_type = 'SALE' AND NEW.quantity < 0 THEN
      UPDATE product_batches
      SET quantity = quantity + NEW.quantity          -- quantity is signed (neg for sales)
      WHERE id = NEW.batch_id AND quantity >= -NEW.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient batch stock (batch %) — another sale may have just depleted it. Re-scan the item.', NEW.batch_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      UPDATE product_batches SET quantity = quantity + NEW.quantity WHERE id = NEW.batch_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'pos', 'public'
AS $$
BEGIN
  -- Entity-wide total. Guard only a non-batch SALE (batch sales are guarded by sync_batch_quantity).
  IF NEW.movement_type = 'SALE' AND NEW.quantity < 0 AND NEW.batch_id IS NULL THEN
    UPDATE products
    SET current_stock = current_stock + NEW.quantity
    WHERE id = NEW.product_id AND current_stock >= -NEW.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock (product %) — another sale may have just depleted it. Re-scan the item.', NEW.product_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    UPDATE products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;
  END IF;

  -- Per-warehouse on-hand (only for located movements — tiers). Sums back to current_stock.
  IF NEW.warehouse_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (product_id, warehouse_id, entity_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.warehouse_id, NEW.entity_id, NEW.quantity, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = warehouse_stock.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;
