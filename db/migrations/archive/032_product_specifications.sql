-- Migration 032: Product Specifications Feature
-- Adds support for category-specific product properties and vendor-specific product values

-- ============================================================================
-- Table: units
-- Admin-configurable units of measurement
-- ============================================================================
CREATE TABLE IF NOT EXISTS units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name),
  UNIQUE(abbreviation)
);

-- Seed with common units
INSERT INTO units (name, abbreviation, category, sort_order) VALUES
  ('Piece', 'pcs', 'quantity', 1),
  ('Kilogram', 'kg', 'weight', 2),
  ('Gram', 'g', 'weight', 3),
  ('Litre', 'L', 'volume', 4),
  ('Millilitre', 'ml', 'volume', 5),
  ('Box', 'box', 'packaging', 6),
  ('Pack', 'pack', 'packaging', 7),
  ('Dozen', 'doz', 'quantity', 8),
  ('Pair', 'pair', 'quantity', 9),
  ('Set', 'set', 'quantity', 10),
  ('Meter', 'm', 'length', 11),
  ('Centimetre', 'cm', 'length', 12),
  ('Square Metre', 'sqm', 'area', 13),
  ('Cubic Metre', 'cum', 'volume', 14)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Table: category_properties
-- Defines custom properties for each product category
-- ============================================================================
CREATE TABLE IF NOT EXISTS category_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  data_type TEXT NOT NULL CHECK (data_type IN ('text_single', 'text_multi', 'number', 'unit', 'datetime')),
  is_required BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  validation_rules JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, slug)
);

-- ============================================================================
-- Table: entity_products
-- Vendor-specific product catalog (vendor's view of products they sell)
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  master_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Vendor's product identifiers
  sku TEXT NOT NULL,
  display_name TEXT,
  barcode TEXT,
  qr_code TEXT,

  -- Pricing
  wholesale_price DECIMAL(12,2),
  mrp DECIMAL(12,2),
  gst_percent DECIMAL(5,2) DEFAULT 5.00,

  -- Inventory
  current_stock INT DEFAULT 0,
  reorder_point INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,

  -- Manufacturer Details (Standard Fields)
  manufacturer_name TEXT,
  manufacturer_brand TEXT,
  country_of_origin TEXT,

  -- Batch & Expiry (Standard Fields - critical for pharma, food)
  batch_number TEXT,
  manufactured_on DATE,
  expiry_date DATE,
  best_before DATE,

  -- Additional vendor notes
  vendor_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, sku)
);

-- Indexes for entity_products
CREATE INDEX IF NOT EXISTS idx_entity_products_entity ON entity_products(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_master ON entity_products(master_product_id);
CREATE INDEX IF NOT EXISTS idx_entity_products_expiry ON entity_products(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_products_sku ON entity_products(sku);
CREATE INDEX IF NOT EXISTS idx_entity_products_active ON entity_products(entity_id, is_active) WHERE is_active = true;

-- ============================================================================
-- Table: entity_product_specifications
-- Stores vendor-specific specification values for their products
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_product_specifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_product_id UUID NOT NULL REFERENCES entity_products(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES category_properties(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC(12,2),
  value_unit TEXT,
  value_datetime TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_product_id, property_id)
);

-- Index for entity_product_specifications
CREATE INDEX IF NOT EXISTS idx_entity_product_specs_entity_product ON entity_product_specifications(entity_product_id);
CREATE INDEX IF NOT EXISTS idx_entity_product_specs_property ON entity_product_specifications(property_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_product_specifications ENABLE ROW LEVEL SECURITY;

-- Units: Super admins manage, everyone reads
CREATE POLICY "super_admins_manage_units"
  ON units FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
  );

CREATE POLICY "all_read_units"
  ON units FOR SELECT USING (true);

-- Category Properties: Distributors manage for their categories
CREATE POLICY "distributors_manage_category_properties"
  ON category_properties FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.role = 'DISTRIBUTOR'
      AND category_id IN (
        SELECT id FROM categories WHERE distributor_id = up.entity_id OR distributor_id IS NULL
      )
    )
  );

CREATE POLICY "all_read_category_properties"
  ON category_properties FOR SELECT USING (true);

-- Entity Products: Vendors manage their own
CREATE POLICY "vendors_manage_entity_products"
  ON entity_products FOR ALL USING (entity_id = auth_entity_id());

CREATE POLICY "all_read_entity_products"
  ON entity_products FOR SELECT USING (true);

-- Entity Product Specifications: Vendors manage their own
CREATE POLICY "vendors_manage_entity_product_specifications"
  ON entity_product_specifications FOR ALL USING (
    entity_product_id IN (
      SELECT id FROM entity_products WHERE entity_id = auth_entity_id()
    )
  );

CREATE POLICY "all_read_entity_product_specifications"
  ON entity_product_specifications FOR SELECT USING (true);
