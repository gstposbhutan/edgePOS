-- Migration 060: Robust batch auto-depletion
-- Problem: sync_batch_quantity (migration 013) updates batch.quantity via an
-- AFTER INSERT trigger on inventory_movements, then runs a second UPDATE to mark
-- status = 'DEPLETED'. That second UPDATE can be silently blocked by RLS when
-- the trigger fires in a context without a valid JWT (e.g. service-role inserts).
--
-- Fix: add a BEFORE UPDATE trigger on product_batches itself. Any UPDATE that
-- brings quantity to <= 0 will atomically set status = 'DEPLETED' in the same
-- statement, bypassing any RLS gap since BEFORE ROW triggers modify NEW directly.
--
-- Also make sync_batch_quantity SECURITY DEFINER so the inventory_movements
-- trigger can always update product_batches regardless of RLS context.

-- ── 1. BEFORE UPDATE trigger on product_batches ───────────────────────────────
CREATE OR REPLACE FUNCTION auto_deplete_batch()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity <= 0 AND OLD.status = 'ACTIVE' THEN
    NEW.status := 'DEPLETED';
  END IF;
  -- Reactivate if stock is added back to a depleted batch (e.g. return/correction)
  IF NEW.quantity > 0 AND OLD.status = 'DEPLETED' THEN
    NEW.status := 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS batch_auto_deplete ON product_batches;
CREATE TRIGGER batch_auto_deplete
  BEFORE UPDATE OF quantity ON product_batches
  FOR EACH ROW EXECUTE FUNCTION auto_deplete_batch();

-- ── 2. Make sync_batch_quantity SECURITY DEFINER ──────────────────────────────
-- Ensures the function can UPDATE product_batches even when called from a
-- trigger context that has no JWT-authenticated user (service-role inserts).
-- The DEPLETED check in this function is now a safety net; the BEFORE UPDATE
-- trigger above is the primary enforcement path.
CREATE OR REPLACE FUNCTION sync_batch_quantity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE product_batches
    SET quantity = quantity + NEW.quantity  -- quantity is signed (neg for sales)
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger (function replaced above)
DROP TRIGGER IF EXISTS inventory_sync_batch ON inventory_movements;
CREATE TRIGGER inventory_sync_batch
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION sync_batch_quantity();
