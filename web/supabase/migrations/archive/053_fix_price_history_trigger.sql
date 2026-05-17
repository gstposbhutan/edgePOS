-- Migration 053: Fix log_product_price_change to include selling_price
-- The original function (migration 013) only tracked mrp and wholesale_price.
-- Migration 052 replaced it but auth.uid() can fail in non-auth contexts.
-- This version uses a safe coalesce and includes selling_price tracking.

CREATE OR REPLACE FUNCTION log_product_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.mrp IS DISTINCT FROM NEW.mrp THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (
      NEW.id,
      NEW.created_by,
      'MRP',
      OLD.mrp,
      NEW.mrp,
      NULLIF(auth.uid()::TEXT, '')::UUID
    );
  END IF;

  IF OLD.wholesale_price IS DISTINCT FROM NEW.wholesale_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (
      NEW.id,
      NEW.created_by,
      'WHOLESALE',
      OLD.wholesale_price,
      NEW.wholesale_price,
      NULLIF(auth.uid()::TEXT, '')::UUID
    );
  END IF;

  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (
      NEW.id,
      NEW.created_by,
      'SELLING',
      OLD.selling_price,
      NEW.selling_price,
      NULLIF(auth.uid()::TEXT, '')::UUID
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists (recreate to be safe)
DROP TRIGGER IF EXISTS products_price_history ON products;
CREATE TRIGGER products_price_history
  AFTER UPDATE OF mrp, wholesale_price, selling_price ON products
  FOR EACH ROW EXECUTE FUNCTION log_product_price_change();
