-- 129: FEFO/FIFO inventory — Phase A (per-product rotation flag + FEFO expiry discipline).
-- Design: docs/pelbu/FEFO-FIFO-DESIGN.md. Non-destructive, idempotent.
-- NOTE: POS tables live in the `pos` schema (migration 121 flip), not public.
-- FEFO = consume soonest-expiry first (expiry REQUIRED on every batch);
-- FIFO = consume oldest-received first (expiry optional). Default FIFO (safe for non-perishables).
-- Phase B (automatic batch allocation in the deduction trigger) is NOT in this migration.

ALTER TABLE pos.products ADD COLUMN IF NOT EXISTS stock_rotation text NOT NULL DEFAULT 'FIFO';
ALTER TABLE pos.products DROP CONSTRAINT IF EXISTS products_stock_rotation_check;
ALTER TABLE pos.products ADD CONSTRAINT products_stock_rotation_check
  CHECK (stock_rotation IN ('FEFO', 'FIFO'));

-- FEFO requires an expiry on every batch of the product — enforced for ALL receive paths.
CREATE OR REPLACE FUNCTION pos.enforce_fefo_batch_expiry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
DECLARE v_rot text;
BEGIN
  IF NEW.expires_at IS NULL THEN
    SELECT stock_rotation INTO v_rot FROM pos.products WHERE id = NEW.product_id;
    IF v_rot = 'FEFO' THEN
      RAISE EXCEPTION 'Product uses FEFO rotation — an expiry date is required for every batch (batch "%").', NEW.batch_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_fefo_batch_expiry ON pos.product_batches;
CREATE TRIGGER trg_enforce_fefo_batch_expiry
  BEFORE INSERT OR UPDATE OF expires_at, product_id ON pos.product_batches
  FOR EACH ROW EXECUTE FUNCTION pos.enforce_fefo_batch_expiry();

-- Block switching a product to FEFO while it has in-stock batches with no expiry (decision #3).
CREATE OR REPLACE FUNCTION pos.enforce_fefo_switch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pos, public AS $$
BEGIN
  IF NEW.stock_rotation = 'FEFO' AND COALESCE(OLD.stock_rotation, 'FIFO') <> 'FEFO' THEN
    IF EXISTS (
      SELECT 1 FROM pos.product_batches b
      WHERE b.product_id = NEW.id AND b.expires_at IS NULL
        AND b.status = 'ACTIVE' AND b.quantity > 0
    ) THEN
      RAISE EXCEPTION 'Cannot switch to FEFO: some in-stock batches have no expiry date. Add expiry dates first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_fefo_switch ON pos.products;
CREATE TRIGGER trg_enforce_fefo_switch
  BEFORE UPDATE OF stock_rotation ON pos.products
  FOR EACH ROW EXECUTE FUNCTION pos.enforce_fefo_switch();
