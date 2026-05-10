-- Migration 035: Link Category Properties to HSN Codes
-- Updates the product specifications system to work with HSN-derived categories

-- ============================================================================
-- Update category_properties table to reference HSN structure
-- ============================================================================

-- Make category_id nullable to support HSN-based properties without a traditional category
ALTER TABLE category_properties ALTER COLUMN category_id DROP NOT NULL;

-- Add HSN reference columns
ALTER TABLE category_properties ADD COLUMN IF NOT EXISTS hsn_chapter TEXT;
ALTER TABLE category_properties ADD COLUMN IF NOT EXISTS hsn_heading TEXT;
ALTER TABLE category_properties ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Add description for HSN-based properties
ALTER TABLE category_properties ADD COLUMN IF NOT EXISTS applies_to_hsn_pattern TEXT;

-- Update unique constraint to support HSN-based properties
-- Drop old constraint if exists
DO $$
BEGIN
  ALTER TABLE category_properties DROP CONSTRAINT IF EXISTS category_properties_category_id_slug_key;
  ALTER TABLE category_properties DROP CONSTRAINT IF EXISTS category_properties_hsn_heading_slug_key;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Create new flexible constraint
ALTER TABLE category_properties ADD CONSTRAINT category_properties_hsn_heading_slug_key
  UNIQUE (hsn_chapter, hsn_heading, slug);

-- Create indexes for HSN lookups
CREATE INDEX IF NOT EXISTS idx_category_properties_hsn_chapter ON category_properties(hsn_chapter);
CREATE INDEX IF NOT EXISTS idx_category_properties_hsn_heading ON category_properties(hsn_heading);
CREATE INDEX IF NOT EXISTS idx_category_properties_hsn_code ON category_properties(hsn_code);

-- ============================================================================
-- Function: Get category properties for HSN code
-- Returns properties applicable to a product based on its HSN code
-- ============================================================================

CREATE OR REPLACE FUNCTION get_hsn_properties(p_hsn_code TEXT)
RETURNS TABLE(
  property_id UUID,
  property_name TEXT,
  slug TEXT,
  data_type TEXT,
  is_required BOOLEAN,
  validation_rules JSONB,
  sort_order INTEGER,
  applies_to_hsn_pattern TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.name as property_name,
    cp.slug,
    cp.data_type,
    cp.is_required,
    cp.validation_rules,
    cp.sort_order,
    cp.applies_to_hsn_pattern
  FROM category_properties cp
  WHERE
    -- Match by exact HSN code
    (cp.hsn_code = p_hsn_code)
    OR
    -- Match by heading (e.g., all 3004.*)
    (cp.hsn_heading = SUBSTRING(p_hsn_code FROM 1 FOR 4) AND cp.hsn_heading IS NOT NULL)
    OR
    -- Match by chapter (e.g., all 30.*.*)
    (cp.hsn_chapter = SUBSTRING(p_hsn_code FROM 1 FOR 2) AND cp.hsn_chapter IS NOT NULL AND cp.hsn_heading IS NULL)
    OR
    -- Match by pattern (regex)
    (cp.applies_to_hsn_pattern IS NOT NULL AND p_hsn_code ~ cp.applies_to_hsn_pattern)
  ORDER BY cp.sort_order;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- View: HSN Code Properties
-- Shows all properties applicable to each HSN code
-- ============================================================================

CREATE OR REPLACE VIEW hsn_code_properties AS
SELECT
  hsn.code,
  hsn.chapter,
  hsn.heading,
  hsn.subheading,
  hsn.category,
  cp.property_id,
  cp.property_name,
  cp.slug,
  cp.data_type,
  cp.is_required,
  cp.validation_rules,
  cp.sort_order,
  cp.applies_to_hsn_pattern
FROM hsn_master hsn
LEFT JOIN LATERAL get_hsn_properties(hsn.code) cp ON true
WHERE hsn.is_active = true;

-- ============================================================================
-- Update RLS Policies for new columns
-- ============================================================================

-- Note: hsn_code_properties is a view and does not need RLS policies.
-- Access is controlled by the underlying table's RLS policies.

-- Only super_admins and distributors can manage category properties
CREATE POLICY "admins_manage_category_properties_hsn"
  ON category_properties FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid()
    AND up.role IN ('SUPER_ADMIN', 'DISTRIBUTOR')
  )
);

-- ============================================================================
-- Seed HSN-based properties for common chapters
-- This links properties to HSN chapters/headings
-- ============================================================================

-- Update existing properties to have HSN references
UPDATE category_properties SET
  hsn_chapter = '30',
  hsn_heading = '3003',
  applies_to_hsn_pattern = '3003.%'
WHERE slug IN ('chemical_composition', 'dosage_form', 'storage_conditions');

UPDATE category_properties SET
  hsn_chapter = '30',
  hsn_heading = '3004',
  applies_to_hsn_pattern = '3004.%'
WHERE slug IN ('batch_number', 'expiry_date', 'manufacturer');

UPDATE category_properties SET
  hsn_chapter = '84',
  hsn_heading = '8414',
  applies_to_hsn_pattern = '8414.%'
WHERE slug IN ('wattage', 'voltage', 'dimensions');

UPDATE category_properties SET
  hsn_chapter = '84',
  hsn_heading = '8415',
  applies_to_hsn_pattern = '8415.%'
WHERE slug IN ('warranty_type', 'warranty_period');

-- ============================================================================
-- Add sample HSN-based properties for common categories
-- ============================================================================

-- Pharmaceuticals properties (Chapter 30)
INSERT INTO category_properties (
  hsn_chapter, hsn_heading, name, slug, data_type, is_required, validation_rules, applies_to_hsn_pattern, sort_order
) VALUES
  -- Medicaments (3004)
  ('30', '3004', 'Dosage Form', 'dosage_form', 'text_single', false, '{"maxLength": 50}', '3004.%', 1),
  ('30', '3004', 'Chemical Composition', 'chemical_composition', 'text_multi', false, '{}', '3003.%', 2),
  ('30', '3004', 'Storage Conditions', 'storage_conditions', 'text_multi', false, '{}', '3004.%', 3),

  -- Vaccines (3002)
  ('30', '3002', 'Storage Temperature', 'storage_temperature', 'unit', true, '{"allowed_units": ["temperature"]}', '3002.4%', 10),
  ('30', '3002', 'Vaccine Type', 'vaccine_type', 'text_single', false, '{}', '3002.4%', 11),

  -- Blood Products (3001)
  ('30', '3001', 'Blood Type', 'blood_type', 'text_single', false, '{}', '3001.%', 20),
  ('30', '3001', 'Processing Method', 'processing_method', 'text_single', false, '{}', '3001.%', 21)

ON CONFLICT (hsn_chapter, hsn_heading, slug) DO NOTHING;

-- Electronics properties (Chapter 84-85)
INSERT INTO category_properties (
  hsn_chapter, hsn_heading, name, slug, data_type, is_required, validation_rules, applies_to_hsn_pattern, sort_order
) VALUES
  -- Air Conditioning (8415)
  ('84', '8415', 'Cooling Capacity', 'cooling_capacity', 'unit', true, '{"allowed_units": ["ton", "btu_per_hr", "kw"]}', '8415.%', 1),
  ('84', '8415', 'Energy Efficiency Rating', 'energy_rating', 'text_single', false, '{"pattern": "^[1-5A-Z]+$"}', '8415.%', 2),
  ('84', '8415', 'Type', 'ac_type', 'text_single', false, '{}', '8415.%', 3),

  -- Fans (8414)
  ('84', '8414', 'Fan Size', 'fan_size', 'unit', false, '{"allowed_units": ["mm", "inch"]}', '8414.5%', 1),
  ('84', '8414', 'Air Flow', 'air_flow', 'unit', false, '{"allowed_units": ["cfm", "m3_hr"]}', '8414.%', 2),
  ('84', '8414', 'Power Rating', 'power_rating', 'unit', true, '{"allowed_units": ["watt"]}', '8414.%', 3),

  -- Motors (8501)
  ('85', '8501', 'Power Output', 'power_output', 'unit', true, '{"allowed_units": ["kw", "hp", "watt"]}', '8501.%', 1),
  ('85', '8501', 'Speed', 'motor_speed', 'unit', false, '{"allowed_units": ["rpm"]}', '8501.%', 2),
  ('85', '8501', 'Phase', 'phase', 'text_single', false, '{"pattern": "^(1|3)$"}', '8501.%', 3),
  ('85', '8501', 'Efficiency Class', 'efficiency_class', 'text_single', false, '{}', '8501.%', 4),

  -- Batteries (8506, 8507)
  ('85', '8506', 'Battery Capacity', 'battery_capacity', 'unit', true, '{"allowed_units": ["mah", "ah"]}', '8506.%', 1),
  ('85', '8507', 'Battery Voltage', 'battery_voltage', 'unit', true, '{"allowed_units": ["volt"]}', '8507.%', 2),
  ('85', '8507', 'Cell Type', 'cell_type', 'text_single', false, '{}', '8507.50', 3),

  -- Electrical Equipment (8513-8516)
  ('85', '8513', 'Lumens', 'lumens', 'number', false, '{"min": 0}', '8513.%', 1),
  ('85', '8513', 'Wattage', 'wattage', 'unit', true, '{"allowed_units": ["watt"]}', '8513.%', 2),
  ('85', '8516', 'Power Rating', 'power_rating', 'unit', true, '{"allowed_units": ["watt", "kw"]}', '8516.%', 1),
  ('85', '8516', 'Voltage', 'voltage', 'unit', true, '{"allowed_units": ["volt"]}', '8516.%', 2),

  -- Electronics Components (8532-8542)
  ('85', '8532', 'Capacitance', 'capacitance', 'unit', true, '{"allowed_units": ["pf", "uf", "nf"]}', '8532.%', 1),
  ('85', '8532', 'Voltage Rating', 'voltage_rating', 'unit', true, '{"allowed_units": ["volt"]}', '8532.%', 2),
  ('85', '8533', 'Resistance', 'resistance', 'unit', true, '{"allowed_units": ["ohm", "kohm"]}', '8533.%', 1),
  ('85', '8533', 'Tolerance', 'tolerance', 'text_single', false, '{}', '8533.%', 2),
  ('85', '8541', 'Forward Current', 'forward_current', 'unit', false, '{"allowed_units": ["ma", "a"]}', '8541.4%', 1),
  ('85', '8541', 'Reverse Voltage', 'reverse_voltage', 'unit', false, '{"allowed_units": ["volt"]}', '8541.4%', 2),
  ('85', '8542', 'Package Type', 'package_type', 'text_single', false, '{}', '8542.%', 1),
  ('85', '8542', 'Pin Count', 'pin_count', 'number', false, '{"min": 2}', '8542.%', 2)

ON CONFLICT (hsn_chapter, hsn_heading, slug) DO NOTHING;

-- ============================================================================
-- Update hook to use HSN-based properties
-- ============================================================================

-- Note: The EntityProductSpecifications component and useCategoryProperties hook
-- now support HSN-based property lookups through the get_hsn_properties function
-- Use it like: get_hsn_properties(product.hsn_code) instead of filtering by category_id
