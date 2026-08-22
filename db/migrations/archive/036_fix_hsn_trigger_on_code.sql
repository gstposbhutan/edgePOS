-- Migration 036: Fix HSN Triggers to Fire on hsn_code Changes
-- Bug fix: Category inheritance triggers weren't firing because forms set hsn_code (TEXT)
-- instead of hsn_master_id (UUID). This adds triggers to sync hsn_master_id from hsn_code.

-- ============================================================================
-- Function: Sync hsn_master_id from hsn_code for products table
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_hsn_master_id_from_code_products()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products (fires before main HSN trigger)
DROP TRIGGER IF EXISTS trigger_sync_hsn_master_id_from_code_products ON products;
CREATE TRIGGER trigger_sync_hsn_master_id_from_code_products
  BEFORE INSERT OR UPDATE OF hsn_code ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_hsn_master_id_from_code_products();

-- ============================================================================
-- Function: Sync hsn_master_id from hsn_code for entity_products table
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_hsn_master_id_from_code_entity_products()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entity_products (fires before main HSN trigger)
DROP TRIGGER IF EXISTS trigger_sync_hsn_master_id_from_code_entity_products ON entity_products;
CREATE TRIGGER trigger_sync_hsn_master_id_from_code_entity_products
  BEFORE INSERT OR UPDATE OF hsn_code ON entity_products
  FOR EACH ROW
  EXECUTE FUNCTION sync_hsn_master_id_from_code_entity_products();

-- ============================================================================
-- Backfill: Update existing records with hsn_code but no hsn_master_id
-- ============================================================================

-- Update products table
UPDATE products
SET hsn_master_id = (
  SELECT id FROM hsn_master
  WHERE hsn_master.code = products.hsn_code AND hsn_master.is_active = true
  LIMIT 1
)
WHERE hsn_code IS NOT NULL AND hsn_master_id IS NULL;

-- Update entity_products table
UPDATE entity_products
SET hsn_master_id = (
  SELECT id FROM hsn_master
  WHERE hsn_master.code = entity_products.hsn_code AND hsn_master.is_active = true
  LIMIT 1
)
WHERE hsn_code IS NOT NULL AND hsn_master_id IS NULL;

-- ============================================================================
-- Trigger Order Explanation
-- ============================================================================

-- The trigger execution order is now:
-- 1. trigger_sync_hsn_master_id_from_code_* (BEFORE INSERT/UPDATE OF hsn_code)
--    - Sets hsn_master_id based on hsn_code
-- 2. trigger_sync_*_category_from_hsn (BEFORE INSERT/UPDATE)
--    - Fires because hsn_master_id is now set
--    - Populates category, subcategory, and HSN hierarchy columns

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Run this to verify the fix is working:
-- SELECT id, hsn_code, hsn_master_id, category, subcategory
-- FROM entity_products
-- WHERE hsn_code IS NOT NULL
-- ORDER BY created_at DESC
-- LIMIT 10;
