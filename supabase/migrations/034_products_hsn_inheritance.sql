-- Migration 034: Update Products to Inherit Category from HSN
-- Product categories and subcategories are automatically derived from HSN codes

-- ============================================================================
-- Update products table to link with hsn_master
-- ============================================================================

-- Add foreign key reference to hsn_master
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_master_id UUID REFERENCES hsn_master(id);

-- Add category and subcategory columns (can be manually overridden)
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add chapter, heading, subheading columns for HSN hierarchy
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_chapter TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_heading TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_subheading TEXT;

-- Create index for HSN lookups
CREATE INDEX IF NOT EXISTS idx_products_hsn_master ON products(hsn_master_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory);

-- ============================================================================
-- Update entity_products table to link with hsn_master
-- ============================================================================

-- Add foreign key reference to hsn_master for vendor products
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_master_id UUID REFERENCES hsn_master(id);

-- Add category and subcategory columns
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Add HSN hierarchy columns
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_chapter TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_heading TEXT;
ALTER TABLE entity_products ADD COLUMN IF NOT EXISTS hsn_subheading TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_entity_products_hsn_master ON entity_products(hsn_master_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_category ON entity_products(category);
CREATE INDEX IF NOT EXISTS idx_entity_products_subcategory ON entity_products(subcategory);

-- ============================================================================
-- Function: Sync product category from HSN master
-- Automatically populates category/subcategory from HSN code
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_product_category_from_hsn()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if hsn_master_id is set and category/subcategory are not manually set
  IF NEW.hsn_master_id IS NOT NULL THEN
    -- Update category and subcategory from HSN master
    UPDATE products
    SET
      category = COALESCE(NEW.category, hsn.category),
      subcategory = COALESCE(NEW.subcategory, hsn.short_description),
      hsn_chapter = hsn.chapter,
      hsn_heading = hsn.heading,
      hsn_subheading = hsn.subheading,
      hsn_code = hsn.code
    FROM hsn_master hsn
    WHERE hsn.id = NEW.hsn_master_id AND products.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products
DROP TRIGGER IF EXISTS trigger_sync_product_category_from_hsn ON products;
CREATE TRIGGER trigger_sync_product_category_from_hsn
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  WHEN (NEW.hsn_master_id IS NOT NULL)
  EXECUTE FUNCTION sync_product_category_from_hsn();

-- ============================================================================
-- Function: Sync entity_product category from HSN master
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_entity_product_category_from_hsn()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if hsn_master_id is set
  IF NEW.hsn_master_id IS NOT NULL THEN
    UPDATE entity_products
    SET
      category = COALESCE(NEW.category, hsn.category),
      subcategory = COALESCE(NEW.subcategory, hsn.short_description),
      hsn_chapter = hsn.chapter,
      hsn_heading = hsn.heading,
      hsn_subheading = hsn.subheading,
      hsn_code = hsn.code
    FROM hsn_master hsn
    WHERE hsn.id = NEW.hsn_master_id AND entity_products.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entity_products
DROP TRIGGER IF EXISTS trigger_sync_entity_product_category_from_hsn ON entity_products;
CREATE TRIGGER trigger_sync_entity_product_category_from_hsn
  BEFORE INSERT OR UPDATE ON entity_products
  FOR EACH ROW
  WHEN (NEW.hsn_master_id IS NOT NULL)
  EXECUTE FUNCTION sync_entity_product_category_from_hsn();

-- ============================================================================
-- Function: Get HSN-based category tree
-- Returns the full category hierarchy for a given HSN code
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hsn_category_tree(p_hsn_code TEXT)
RETURNS TABLE(
  hsn_code TEXT,
  chapter TEXT,
  heading TEXT,
  subheading TEXT,
  category TEXT,
  short_description TEXT,
  customs_duty DECIMAL(5,2),
  sales_tax DECIMAL(5,2),
  green_tax DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    hsn.code,
    hsn.chapter,
    hsn.heading,
    hsn.subheading,
    hsn.category,
    hsn.short_description,
    hsn.customs_duty,
    hsn.sales_tax,
    hsn.green_tax
  FROM hsn_master hsn
  WHERE hsn.code = p_hsn_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: Products with HSN categories
-- Convenient view joining products with HSN master data
-- ============================================================================

CREATE OR REPLACE VIEW products_with_hsn AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.hsn_code,
  p.hsn_master_id,
  p.hsn_chapter,
  p.hsn_heading,
  p.hsn_subheading,
  p.category,
  p.subcategory,
  p.image_url,
  p.current_stock,
  p.wholesale_price,
  p.mrp,
  p.unit,
  p.is_active,
  p.created_by,
  p.created_at,
  p.updated_at,
  -- HSN tax info
  hsn.customs_duty,
  hsn.sales_tax,
  hsn.green_tax,
  hsn.tax_type,
  -- Combined category path
  CASE
    WHEN p.category IS NOT NULL THEN p.category
    ELSE hsn.category
  END as display_category,
  CASE
    WHEN p.subcategory IS NOT NULL THEN p.subcategory
    ELSE hsn.short_description
  END as display_subcategory
FROM products p
LEFT JOIN hsn_master hsn ON p.hsn_master_id = hsn.id;

-- ============================================================================
-- View: Entity Products with HSN categories
-- ============================================================================

CREATE OR REPLACE VIEW entity_products_with_hsn AS
SELECT
  ep.id,
  ep.entity_id,
  ep.master_product_id,
  ep.hsn_code,
  ep.hsn_master_id,
  ep.hsn_chapter,
  ep.hsn_heading,
  ep.hsn_subheading,
  ep.category,
  ep.subcategory,
  ep.sku,
  ep.display_name,
  ep.barcode,
  ep.qr_code,
  ep.wholesale_price,
  ep.mrp,
  ep.gst_percent,
  ep.current_stock,
  ep.reorder_point,
  ep.is_active,
  ep.manufacturer_name,
  ep.manufacturer_brand,
  ep.country_of_origin,
  ep.batch_number,
  ep.manufactured_on,
  ep.expiry_date,
  ep.best_before,
  ep.vendor_notes,
  ep.created_at,
  ep.updated_at,
  -- HSN tax info
  hsn.customs_duty,
  hsn.sales_tax,
  hsn.green_tax,
  hsn.tax_type,
  -- Combined category path
  CASE
    WHEN ep.category IS NOT NULL THEN ep.category
    ELSE hsn.category
  END as display_category,
  CASE
    WHEN ep.subcategory IS NOT NULL THEN ep.subcategory
    ELSE hsn.short_description
  END as display_subcategory,
  -- Entity info
  e.name as entity_name,
  e.role as entity_role
FROM entity_products ep
LEFT JOIN hsn_master hsn ON ep.hsn_master_id = hsn.id
LEFT JOIN entities e ON ep.entity_id = e.id;

-- ============================================================================
-- RLS Policies for new columns
-- ============================================================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

ALTER TABLE entity_products ENABLE ROW LEVEL SECURITY;

-- Policies for products_with_hsn view
CREATE POLICY "all_read_products_with_hsn"
  ON products_with_hsn FOR SELECT USING (true);

-- Policies for entity_products_with_hsn view
CREATE POLICY "all_read_entity_products_with_hsn"
  ON entity_products_with_hsn FOR SELECT USING (true);

-- Vendors can read their own entity products with HSN
CREATE POLICY "vendors_read_own_entity_products_hsn"
  ON entity_products_with_hsn FOR SELECT
  USING (entity_id = (SELECT id FROM entities WHERE user_id = auth.uid()));

-- ============================================================================
-- Helper function: Update existing products with HSN category
-- Use this to backfill existing products
-- ============================================================================

CREATE OR REPLACE FUNCTION backfill_product_categories_from_hsn()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Backfill products table
  UPDATE products p
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = p.hsn_code LIMIT 1),
    category = COALESCE(p.category, hsn.category),
    subcategory = COALESCE(p.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = p.hsn_code;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Backfill entity_products table
  UPDATE entity_products ep
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = ep.hsn_code LIMIT 1),
    category = COALESCE(ep.category, hsn.category),
    subcategory = COALESCE(ep.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = ep.hsn_code;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
