-- Migration 033: HSN Master Table (Bhutan Trade Classification)
-- Creates a reference table for HSN (Harmonized System of Nomenclature) codes
-- Based on Bhutan Trade Classification & Tariff Schedule 7th Edition, 2022
-- Source: Department of Revenue and Customs, Ministry of Finance, Royal Government of Bhutan

-- ============================================================================
-- Table: hsn_master
-- Master reference table for HSN codes with Bhutan-specific tax rates
-- ============================================================================
CREATE TABLE IF NOT EXISTS hsn_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,                    -- HSN code (e.g., "0302.41.00")
  code_8digit TEXT,                     -- Optional 8-digit code if applicable

  -- Hierarchy fields (Bhutan Trade Classification)
  chapter TEXT NOT NULL,                 -- 2-digit chapter (01-99)
  heading TEXT NOT NULL,                 -- 4-digit heading (0101-9999)
  subheading TEXT,                      -- 6-digit subheading (010101-999999)
  tariff_item TEXT,                     -- 8-digit tariff item (01010101-99999999)

  -- Description
  description TEXT NOT NULL,             -- Full description
  short_description TEXT,               -- Short name for dropdowns

  -- Classification
  category TEXT,                        -- Major category: Agriculture, Electronics, Textiles, etc.

  -- Bhutan Tax Structure (per BTC 2022)
  -- Customs Duty (CD): Applied to imports from countries other than India
  customs_duty DECIMAL(5,2) DEFAULT 0,  -- CD rate (%)

  -- Sales Tax (ST): Applied to all imports (including from India)
  sales_tax DECIMAL(5,2) DEFAULT 0,     -- ST rate (%)

  -- Green Tax (GT): Environmental tax
  green_tax DECIMAL(5,2) DEFAULT 0,     -- GT rate (%)

  -- Special tax types (for reference only - actual calculation uses above columns)
  tax_type TEXT,                        -- 'CD', 'ST', 'GT', 'CD+ST', 'CD+ST+GT'

  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(code),
  UNIQUE(code_8digit)
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_hsn_master_code ON hsn_master(code);
CREATE INDEX IF NOT EXISTS idx_hsn_master_chapter ON hsn_master(chapter);
CREATE INDEX IF NOT EXISTS idx_hsn_master_category ON hsn_master(category);
CREATE INDEX IF NOT EXISTS idx_hsn_master_active ON hsn_master(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE hsn_master ENABLE ROW LEVEL SECURITY;

-- Everyone can read HSN codes
CREATE POLICY "all_read_hsn_master"
  ON hsn_master FOR SELECT USING (true);

-- Only super_admins can modify HSN master
CREATE POLICY "super_admins_manage_hsn_master"
  ON hsn_master FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'SUPER_ADMIN')
);

-- ============================================================================
-- Seed HSN Codes (Bhutan Trade Classification 2022)
-- Rates: Customs Duty (CD) | Sales Tax (ST) | Green Tax (GT)
-- Note: CD applies to non-India imports; ST applies to all imports
-- ============================================================================

-- Pharmaceuticals (Chapter 30) - TAX FREE in Bhutan
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('3001.10.00', '30', '3001', 'Glands and other organs for organo-therapeutic uses', 'Glands/Organs', 'Pharmaceuticals', 0, 0, 0),
  ('3001.20.00', '30', '3001', 'Extracts of glands or other organs or of their secretions', 'Gland Extracts', 'Pharmaceuticals', 0, 0, 0),
  ('3001.90.00', '30', '3001', 'Other organs for organo-therapeutic uses', 'Other Organs', 'Pharmaceuticals', 0, 0, 0),
  ('3002.10.00', '30', '3002', 'Blood of any animal', 'Animal Blood', 'Pharmaceuticals', 0, 0, 0),
  ('3002.12.00', '30', '3002', 'Antisera and other blood fractions', 'Blood Fractions', 'Pharmaceuticals', 0, 0, 0),
  ('3002.13.00', '30', '3002', 'Immunological products, unmixed, not in measured doses', 'Immunological Bulk', 'Pharmaceuticals', 0, 0, 0),
  ('3002.14.00', '30', '3002', 'Immunological products, mixed, not in measured doses', 'Immunological Mixed', 'Pharmaceuticals', 0, 0, 0),
  ('3002.15.00', '30', '3002', 'Immunological products, in measured doses or retail packs', 'Immunological Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3002.41.00', '30', '3002', 'Vaccines for human medicine', 'Human Vaccines', 'Pharmaceuticals', 0, 0, 0),
  ('3002.42.00', '30', '3002', 'Vaccines for veterinary medicine', 'Vet Vaccines', 'Pharmaceuticals', 0, 0, 0),
  ('3002.49.00', '30', '3002', 'Other vaccines', 'Vaccines Other', 'Pharmaceuticals', 0, 0, 0),
  ('3002.51.00', '30', '3002', 'Cell therapy products', 'Cell Therapy', 'Pharmaceuticals', 0, 0, 0),
  ('3002.59.00', '30', '3002', 'Other cell therapy products', 'Cell Therapy Other', 'Pharmaceuticals', 0, 0, 0),
  ('3002.90.10', '30', '3002', 'Saxitoxin', 'Saxitoxin', 'Pharmaceuticals', 0, 0, 0),
  ('3002.90.20', '30', '3002', 'Ricin', 'Ricin', 'Pharmaceuticals', 0, 0, 0),
  ('3002.90.90', '30', '3002', 'Other human/animal blood products', 'Blood Products Other', 'Pharmaceuticals', 0, 0, 0),
  ('3003.10.00', '30', '3003', 'Medicaments containing penicillins or derivatives', 'Penicillin Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.20.00', '30', '3003', 'Medicaments containing other antibiotics', 'Antibiotic Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.31.00', '30', '3003', 'Medicaments containing hormones', 'Hormone Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.39.00', '30', '3003', 'Other medicaments containing hormones', 'Hormone Other', 'Pharmaceuticals', 0, 0, 0),
  ('3003.41.00', '30', '3003', 'Medicaments containing alkaloids', 'Alkaloid Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.42.00', '30', '3003', 'Medicaments containing antibiotics', 'Antibiotics', 'Pharmaceuticals', 0, 0, 0),
  ('3003.43.00', '30', '3003', 'Medicaments containing other drugs', 'Drug Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.49.00', '30', '3003', 'Other medicaments', 'Medicines Other', 'Pharmaceuticals', 0, 0, 0),
  ('3003.60.00', '30', '3003', 'Medicaments containing artemisinin', 'Artemisinin Medicines', 'Pharmaceuticals', 0, 0, 0),
  ('3003.90.00', '30', '3003', 'Other medicaments', 'Medicaments', 'Pharmaceuticals', 0, 0, 0),
  ('3004.10.00', '30', '3004', 'Medicaments containing penicillins', 'Penicillin Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.20.00', '30', '3004', 'Medicaments containing other antibiotics', 'Antibiotics Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.31.00', '30', '3004', 'Medicaments containing hormones', 'Hormones Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.32.00', '30', '3004', 'Medicaments containing alkaloids', 'Alkaloids Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.39.00', '30', '3004', 'Other hormone/alkaloid medicaments', 'Hormone/Alkaloid Other', 'Pharmaceuticals', 0, 0, 0),
  ('3004.41.00', '30', '3004', 'Medicaments containing antibiotics', 'Antibiotic Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.42.00', '30', '3004', 'Medicaments containing other drugs', 'Drug Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.43.00', '30', '3004', 'Other medicaments', 'Medicines Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.49.00', '30', '3004', 'Other medicaments', 'Medicaments Other', 'Pharmaceuticals', 0, 0, 0),
  ('3004.50.00', '30', '3004', 'Medicaments containing vitamins', 'Vitamins', 'Pharmaceuticals', 0, 0, 0),
  ('3004.60.00', '30', '3004', 'Medicaments containing artemisinin', 'Artemisinin Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3004.90.00', '30', '3004', 'Other medicaments for retail', 'Medicines Retail', 'Pharmaceuticals', 0, 0, 0),
  ('3005.10.00', '30', '3005', 'Sutures, sterile surgical catgut', 'Sutures', 'Pharmaceuticals', 0, 0, 0),
  ('3005.90.00', '30', '3005', 'Other surgical dressings', 'Dressings', 'Pharmaceuticals', 0, 0, 0),
  ('3006.10.00', '30', '3006', 'Surgical glue', 'Surgical Glue', 'Pharmaceuticals', 0, 0, 0),
  ('3006.30.00', '30', '3006', 'Diagnostic reagents', 'Diagnostic Reagents', 'Pharmaceuticals', 0, 0, 0),
  ('3006.40.00', '30', '3006', 'Dental fillings', 'Dental Materials', 'Pharmaceuticals', 0, 0, 0),
  ('3006.50.00', '30', '3006', 'First aid kits', 'First Aid Kits', 'Pharmaceuticals', 0, 0, 0),
  ('3006.60.00', '30', '3006', 'Contraceptive medicaments', 'Contraceptives', 'Pharmaceuticals', 0, 0, 0),
  ('3006.70.00', '30', '3006', 'Medical kits', 'Medical Kits', 'Pharmaceuticals', 0, 0, 0),
  ('3006.91.00', '30', '3006', 'Prepared pharmaceutical products', 'Pharma Products', 'Pharmaceuticals', 0, 0, 0),
  ('3006.92.00', '30', '3006', 'Waste pharmaceutical products', 'Pharma Waste', 'Pharmaceuticals', 0, 0, 0),
  ('3006.93.00', '30', '3006', 'Other pharmaceutical products', 'Pharma Other', 'Pharmaceuticals', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Fish & Seafood (Chapter 03)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('0301.11.00', '03', '0301', 'Live fish - Trout', 'Live Trout', 'Fisheries', 0, 0, 0),
  ('0301.19.00', '03', '0301', 'Live fish - Other', 'Live Fish Other', 'Fisheries', 0, 0, 0),
  ('0301.93.00', '03', '0301', 'Live fish - Carp', 'Live Carp', 'Fisheries', 0, 0, 0),
  ('0302.13.00', '03', '0302', 'Fish fresh/chilled - Trout', 'Trout Fresh', 'Fisheries', 0, 0, 0),
  ('0302.21.00', '03', '0302', 'Fish fresh/chilled - Tilapia', 'Tilapia Fresh', 'Fisheries', 0, 0, 0),
  ('0302.23.00', '03', '0302', 'Fish fresh/chilled - Catfish', 'Catfish Fresh', 'Fisheries', 0, 0, 0),
  ('0302.41.00', '03', '0302', 'Fish frozen - Herrings', 'Herring Frozen', 'Fisheries', 10, 0, 0),
  ('0302.42.00', '03', '0302', 'Fish frozen - Anchovies', 'Anchovy Frozen', 'Fisheries', 10, 0, 0),
  ('0302.43.00', '03', '0302', 'Fish frozen - Sardines', 'Sardine Frozen', 'Fisheries', 10, 0, 0),
  ('0302.44.00', '03', '0302', 'Fish frozen - Mackerel', 'Mackerel Frozen', 'Fisheries', 10, 0, 0),
  ('0302.47.00', '03', '0302', 'Fish frozen - Swordfish', 'Swordfish Frozen', 'Fisheries', 10, 0, 0),
  ('0302.49.00', '03', '0302', 'Fish frozen - Other', 'Fish Frozen Other', 'Fisheries', 10, 0, 0),
  ('0302.72.00', '03', '0302', 'Fish frozen - Catfish', 'Catfish Frozen', 'Fisheries', 10, 0, 0),
  ('0302.74.00', '03', '0302', 'Fish frozen - Eels', 'Eel Frozen', 'Fisheries', 10, 0, 0),
  ('0304.45.00', '03', '0304', 'Fish fillets frozen - Swordfish', 'Swordfish Fillets', 'Fisheries', 10, 0, 0),
  ('0304.47.00', '03', '0304', 'Fish fillets frozen - Dogfish/Sharks', 'Shark Fillets', 'Fisheries', 10, 0, 0),
  ('0304.51.00', '03', '0304', 'Fish fillets frozen - Tilapia/Catfish', 'Tilapia Fillets', 'Fisheries', 10, 0, 0),
  ('0304.71.00', '03', '0304', 'Fish fillets frozen - Cod', 'Cod Fillets', 'Fisheries', 10, 0, 0),
  ('0306.14.00', '03', '0306', 'Crustaceans - Crabs', 'Crabs', 'Fisheries', 10, 0, 0),
  ('0306.15.00', '03', '0306', 'Crustaceans - Shrimp/Prawns', 'Shrimp', 'Fisheries', 10, 0, 0),
  ('0306.16.00', '03', '0306', 'Crustaceans - Lobsters', 'Lobster', 'Fisheries', 10, 0, 0),
  ('0306.31.00', '03', '0306', 'Molluscs - Oysters', 'Oysters', 'Fisheries', 10, 0, 0),
  ('0306.32.00', '03', '0306', 'Molluscs - Scallops', 'Scallops', 'Fisheries', 10, 0, 0),
  ('0306.33.00', '03', '0306', 'Molluscs - Mussels', 'Mussels', 'Fisheries', 10, 0, 0),
  ('0306.34.00', '03', '0306', 'Molluscs - Cuttlefish/Squid', 'Squid', 'Fisheries', 10, 0, 0),
  ('0306.35.00', '03', '0306', 'Molluscs - Octopus', 'Octopus', 'Fisheries', 10, 0, 0),
  ('0306.36.00', '03', '0306', 'Molluscs - Clams/Cockles', 'Clams', 'Fisheries', 10, 0, 0),
  ('0306.37.00', '03', '0306', 'Molluscs - Abalone', 'Abalone', 'Fisheries', 10, 0, 0),
  ('0306.38.00', '03', '0306', 'Molluscs - Sea snails', 'Sea Snails', 'Fisheries', 10, 0, 0),
  ('0306.39.00', '03', '0306', 'Molluscs - Other', 'Molluscs Other', 'Fisheries', 10, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Agriculture & Live Animals (Chapter 01-02)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- Chapter 01: Live Animals
  ('0101.21.00', '01', '0101', 'Live horses, asses, mules and hinnies - Pure-bred breeding animals', 'Live Equines (Breeding)', 'Agriculture', 0, 0, 0),
  ('0101.29.00', '01', '0101', 'Live horses, asses, mules and hinnies - Other', 'Live Equines', 'Agriculture', 0, 0, 0),
  ('0102.21.00', '01', '0102', 'Live bovine animals - Pure-bred breeding', 'Live Cattle (Breeding)', 'Agriculture', 0, 0, 0),
  ('0102.29.00', '01', '0102', 'Live bovine animals - Other', 'Live Cattle', 'Agriculture', 0, 0, 0),
  ('0102.31.00', '01', '0102', 'Live buffalo - Pure-bred breeding', 'Buffalo (Breeding)', 'Agriculture', 0, 0, 0),
  ('0102.39.00', '01', '0102', 'Live buffalo - Other', 'Buffalo', 'Agriculture', 0, 0, 0),
  ('0103.10.00', '01', '0103', 'Live swine - Pure-bred breeding', 'Live Pigs (Breeding)', 'Agriculture', 0, 0, 0),
  ('0103.91.00', '01', '0103', 'Live swine - Under 50 kg', 'Live Pigs (<50kg)', 'Agriculture', 0, 0, 0),
  ('0103.92.00', '01', '0103', 'Live swine - 50 kg or more', 'Live Pigs (>=50kg)', 'Agriculture', 0, 0, 0),
  ('0104.10.00', '01', '0104', 'Live sheep', 'Live Sheep', 'Agriculture', 0, 0, 0),
  ('0104.20.00', '01', '0104', 'Live goats', 'Live Goats', 'Agriculture', 0, 0, 0),
  ('0105.11.00', '01', '0105', 'Live poultry - Fowls under 185g', 'Poultry Chicks', 'Agriculture', 0, 0, 0),
  ('0105.99.00', '01', '0105', 'Live poultry - Other', 'Live Poultry', 'Agriculture', 0, 0, 0),
  ('0106.11.00', '01', '0106', 'Live primates', 'Primates', 'Agriculture', 10, 0, 0),
  ('0106.14.00', '01', '0106', 'Live rabbits and hares', 'Rabbits', 'Agriculture', 10, 0, 0),
  ('0106.19.00', '01', '0106', 'Live other mammals', 'Other Mammals', 'Agriculture', 10, 0, 0),
  ('0106.20.00', '01', '0106', 'Live reptiles', 'Reptiles', 'Agriculture', 10, 0, 0),
  ('0106.31.00', '01', '0106', 'Live birds of prey', 'Birds of Prey', 'Agriculture', 10, 0, 0),
  ('0106.32.00', '01', '0106', 'Live parrots and parakeets', 'Parrots', 'Agriculture', 10, 0, 0),
  ('0106.39.00', '01', '0106', 'Live other birds', 'Other Birds', 'Agriculture', 10, 0, 0),
  ('0106.41.00', '01', '0106', 'Live bees', 'Bees', 'Agriculture', 0, 0, 0),
  ('0106.49.00', '01', '0106', 'Live other insects', 'Insects', 'Agriculture', 10, 0, 0),

  -- Chapter 02: Meat
  ('0201.10.00', '02', '0201', 'Meat of bovine animals, fresh or chilled - Carcasses', 'Beef Carcass Fresh', 'Agriculture', 10, 0, 0),
  ('0201.20.00', '02', '0201', 'Meat of bovine animals, fresh or chilled - Other cuts', 'Beef Fresh', 'Agriculture', 10, 0, 0),
  ('0201.30.00', '02', '0201', 'Meat of bovine animals, fresh or chilled - Boneless', 'Beef Boneless Fresh', 'Agriculture', 10, 0, 0),
  ('0202.10.00', '02', '0202', 'Meat of bovine animals, frozen - Carcasses', 'Beef Carcass Frozen', 'Agriculture', 10, 0, 0),
  ('0202.20.00', '02', '0202', 'Meat of bovine animals, frozen - Other cuts', 'Beef Frozen', 'Agriculture', 10, 0, 0),
  ('0202.30.00', '02', '0202', 'Meat of bovine animals, frozen - Boneless', 'Beef Boneless Frozen', 'Agriculture', 10, 0, 0),
  ('0203.11.00', '02', '0203', 'Meat of swine, fresh or chilled - Carcasses', 'Pork Fresh', 'Agriculture', 10, 20, 0),
  ('0203.12.00', '02', '0203', 'Meat of swine, fresh or chilled - Hams/shoulders', 'Pork Ham Fresh', 'Agriculture', 10, 20, 0),
  ('0203.19.00', '02', '0203', 'Meat of swine, fresh or chilled - Other', 'Pork Fresh Other', 'Agriculture', 10, 20, 0),
  ('0204.10.00', '02', '0204', 'Meat of sheep, fresh or chilled - Lamb carcasses', 'Lamb Fresh', 'Agriculture', 10, 0, 0),
  ('0204.50.00', '02', '0204', 'Meat of goats', 'Goat Meat', 'Agriculture', 10, 0, 0),
  ('0205.00.00', '02', '0205', 'Meat of horses, asses, mules or hinnies', 'Horse Meat', 'Agriculture', 10, 0, 0),
  ('0206.10.00', '02', '0206', 'Edible offal of bovine animals, fresh or chilled', 'Beef Offal Fresh', 'Agriculture', 10, 0, 0),
  ('0206.30.00', '02', '0206', 'Edible offal of swine, fresh or chilled', 'Pork Offal Fresh', 'Agriculture', 10, 20, 0),
  ('0207.11.00', '02', '0207', 'Meat of poultry, fresh or chilled - Fowls whole', 'Chicken Fresh Whole', 'Agriculture', 10, 20, 0),
  ('0207.12.00', '02', '0207', 'Meat of poultry, fresh or chilled - Fowls frozen', 'Chicken Frozen Whole', 'Agriculture', 10, 20, 0),
  ('0207.13.00', '02', '0207', 'Meat of poultry, fresh or chilled - Fowls cuts/offal', 'Chicken Cuts Fresh', 'Agriculture', 10, 20, 0),
  ('0207.14.00', '02', '0207', 'Meat of poultry, frozen - Fowls cuts/offal', 'Chicken Cuts Frozen', 'Agriculture', 10, 20, 0),
  ('0208.10.00', '02', '0208', 'Other meat, fresh or chilled - Rabbits or hares', 'Rabbit Meat', 'Agriculture', 10, 0, 0),
  ('0208.30.00', '02', '0208', 'Other meat, fresh or chilled - Primates', 'Primate Meat', 'Agriculture', 10, 0, 0),
  ('0208.60.00', '02', '0208', 'Other meat, fresh or chilled - Camels and camelids', 'Camel Meat', 'Agriculture', 10, 0, 0),
  ('0209.10.00', '02', '0209', 'Pig fat', 'Lard', 'Agriculture', 10, 20, 0),
  ('0209.90.00', '02', '0209', 'Other animal fat', 'Animal Fat', 'Agriculture', 10, 20, 0)

ON CONFLICT (code) DO NOTHING;

-- Machinery & Electrical Equipment (Chapter 84-85) - Representative Sample
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- Fans & Air Compressors
  ('8414.10.00', '84', '8414', 'Vacuum pumps', 'Vacuum Pumps', 'Electronics', 0, 0, 0),
  ('8414.20.00', '84', '8414', 'Hand/foot air pumps', 'Manual Air Pumps', 'Electronics', 0, 0, 0),
  ('8414.30.00', '84', '8414', 'Compressors for refrigeration', 'Refrigeration Compressors', 'Electronics', 0, 0, 0),
  ('8414.40.00', '84', '8414', 'Air compressors on wheeled chassis', 'Portable Air Compressors', 'Electronics', 10, 5, 0),
  ('8414.51.00', '84', '8414', 'Table/floor/wall/ceiling fans <=125W', 'Small Fans', 'Electronics', 10, 5, 0),
  ('8414.59.00', '84', '8414', 'Other fans', 'Other Fans', 'Electronics', 10, 5, 0),
  ('8414.60.00', '84', '8414', 'Hoods <=120cm', 'Kitchen Hoods', 'Electronics', 10, 5, 0),

  -- Air Conditioning
  ('8415.10.00', '84', '8415', 'Air conditioning machines - self-contained', 'Split AC Units', 'Electronics', 0, 0, 0),
  ('8415.20.00', '84', '8415', 'Air conditioning for vehicles', 'Vehicle AC', 'Electronics', 10, 5, 0),

  -- Electric Motors
  ('8501.10.00', '85', '8501', 'Electric motors - <37.5W', 'Tiny Motors', 'Electronics', 0, 0, 0),
  ('8501.20.00', '85', '8501', 'Electric motors - 37.5W-750W', 'Small Motors', 'Electronics', 10, 5, 0),
  ('8501.31.00', '85', '8501', 'Electric motors - DC', 'DC Motors', 'Electronics', 10, 5, 0),
  ('8501.32.00', '85', '8501', 'Electric motors - AC multi-phase', 'AC Motors', 'Electronics', 10, 5, 0),
  ('8501.40.00', '85', '8501', 'Other AC motors', 'Other AC Motors', 'Electronics', 10, 5, 0),
  ('8501.51.00', '85', '8501', 'Other motors - <750W', 'Other Small Motors', 'Electronics', 10, 5, 0),
  ('8501.52.00', '85', '8501', 'Other motors - 750W-75kW', 'Medium Motors', 'Electronics', 10, 5, 0),
  ('8501.53.00', '85', '8501', 'Other motors - >75kW', 'Large Motors', 'Electronics', 10, 5, 0),

  -- Generators
  ('8501.64.00', '85', '8501', 'Generators - <75kVA', 'Small Generators', 'Electronics', 10, 5, 0),
  ('8501.65.00', '85', '8501', 'Generators - 75-375kVA', 'Medium Generators', 'Electronics', 10, 5, 0),
  ('8501.66.00', '85', '8501', 'Generators - 375-750kVA', 'Large Generators', 'Electronics', 10, 5, 0),
  ('8501.67.00', '85', '8501', 'Generators - >750kVA', 'XL Generators', 'Electronics', 10, 5, 0),

  -- Batteries
  ('8506.10.00', '85', '8506', 'Lithium dioxide cells', 'Lithium Cells', 'Electronics', 0, 0, 0),
  ('8506.30.00', '85', '8506', 'Lithium metal polymer cells', 'Lithium Polymer', 'Electronics', 0, 0, 0),
  ('8506.50.00', '85', '8506', 'Other lithium cells', 'Other Lithium', 'Electronics', 0, 0, 0),
  ('8506.80.00', '85', '8506', 'Other primary cells/batteries', 'Other Primary Batteries', 'Electronics', 0, 0, 0),
  ('8507.10.00', '85', '8507', 'Lead-acid accumulators - for vehicles', 'Lead-Acid Vehicle', 'Electronics', 0, 0, 0),
  ('8507.20.00', '85', '8507', 'Other lead-acid accumulators', 'Lead-Acid Other', 'Electronics', 0, 0, 0),
  ('8507.30.00', '85', '8507', 'Nickel-cadmium accumulators', 'NiCd Batteries', 'Electronics', 0, 0, 0),
  ('8507.40.00', '85', '8507', 'Nickel-metal hydride accumulators', 'NiMH Batteries', 'Electronics', 0, 0, 0),
  ('8507.50.00', '85', '8507', 'Lithium-ion accumulators', 'Lithium-Ion', 'Electronics', 0, 0, 0),
  ('8507.60.00', '85', '8507', 'Other lithium accumulators', 'Other Lithium Accumulators', 'Electronics', 0, 0, 0),
  ('8507.80.00', '85', '8507', 'Other electric accumulators', 'Other Accumulators', 'Electronics', 0, 0, 0),
  ('8507.90.00', '85', '8507', 'Parts of accumulators', 'Battery Parts', 'Electronics', 0, 0, 0),

  -- Electrical Lighting
  ('8513.10.00', '85', '8513', 'Portable electric lamps - <100W', 'Small Lamps', 'Electronics', 10, 5, 0),
  ('8513.12.00', '85', '8513', 'Portable electric lamps - 100-200W', 'Medium Lamps', 'Electronics', 10, 5, 0),
  ('8513.15.00', '85', '8513', 'Portable electric lamps - >200W', 'Large Lamps', 'Electronics', 10, 5, 0),
  ('8513.31.00', '85', '8513', 'Other electric lamps - LEDs', 'LED Lamps', 'Electronics', 10, 5, 0),
  ('8513.39.00', '85', '8513', 'Other electric lamps', 'Other Electric Lamps', 'Electronics', 10, 5, 0),

  -- Electrical Equipment
  ('8516.10.00', '85', '8516', 'Electric instant/sorage water heaters', 'Water Heaters', 'Electronics', 10, 5, 0),
  ('8516.31.00', '85', '8516', 'Electric radiators', 'Electric Radiators', 'Electronics', 10, 5, 0),
  ('8516.40.00', '85', '8516', 'Electric smoothing irons', 'Electric Irons', 'Electronics', 10, 5, 0),
  ('8516.50.00', '85', '8516', 'Electric microwave ovens', 'Microwaves', 'Electronics', 10, 5, 0),
  ('8516.60.00', '85', '8516', 'Other electric ovens', 'Electric Ovens', 'Electronics', 10, 5, 0),
  ('8516.71.00', '85', '8516', 'Electric coffee makers/tea makers', 'Coffee/Tea Makers', 'Electronics', 10, 5, 0),
  ('8516.72.00', '85', '8516', 'Electric toasters', 'Toasters', 'Electronics', 10, 5, 0),
  ('8516.79.00', '85', '8516', 'Other electro-thermal appliances', 'Other Heating Appliances', 'Electronics', 10, 5, 0),
  ('8516.80.00', '85', '8516', 'Electric heating resistors', 'Heating Resistors', 'Electronics', 10, 5, 0),
  ('8516.90.00', '85', '8516', 'Parts of electro-thermal appliances', 'Heating Appliance Parts', 'Electronics', 10, 5, 0),

  -- Telecommunications Equipment
  ('8517.11.00', '85', '8517', 'Telephones for cellular networks', 'Mobile Phones', 'Electronics', 10, 5, 0),
  ('8517.12.00', '85', '8517', 'Other telephones for cellular networks', 'Other Cellular Phones', 'Electronics', 10, 5, 0),
  ('8517.18.00', '85', '8517', 'Other telephony equipment', 'Other Phone Equipment', 'Electronics', 10, 5, 0),
  ('8517.61.00', '85', '8517', 'Base stations', 'Cell Towers', 'Electronics', 10, 5, 0),
  ('8517.62.00', '85', '8517', 'Receiver/transmission apparatus for satellite', 'Satellite Equipment', 'Electronics', 10, 5, 0),
  ('8517.69.00', '85', '8517', 'Other transmission apparatus', 'Other Transmission', 'Electronics', 10, 5, 0),
  ('8517.70.00', '85', '8517', 'Parts of telephony equipment', 'Telecom Parts', 'Electronics', 10, 5, 0),

  -- Speakers & Microphones
  ('8518.10.00', '85', '8518', 'Microphones and stands', 'Microphones', 'Electronics', 10, 5, 0),
  ('8518.21.00', '85', '8518', 'Single loudspeakers', 'Single Speakers', 'Electronics', 10, 5, 0),
  ('8518.22.00', '85', '8518', 'Multiple loudspeakers in one enclosure', 'Speaker Systems', 'Electronics', 10, 5, 0),
  ('8518.29.00', '85', '8518', 'Other loudspeakers', 'Other Speakers', 'Electronics', 10, 5, 0),
  ('8518.30.00', '85', '8518', 'Headphones/earphones', 'Headphones', 'Electronics', 10, 5, 0),
  ('8518.40.00', '85', '8518', 'Audio amplifier', 'Amplifiers', 'Electronics', 10, 5, 0),
  ('8518.50.00', '85', '8518', 'Electric sound amplifier sets', 'Sound Systems', 'Electronics', 10, 5, 0),
  ('8518.90.00', '85', '8518', 'Parts of sound equipment', 'Audio Parts', 'Electronics', 10, 5, 0),

  -- Video Equipment
  ('8528.52.00', '85', '8528', 'Receivers - colour only', 'Color TVs', 'Electronics', 10, 5, 0),
  ('8528.59.00', '85', '8528', 'Other receivers', 'Other TVs', 'Electronics', 10, 5, 0),
  ('8528.61.00', '85', '8528', 'Video monitors - colour', 'Color Monitors', 'Electronics', 10, 5, 0),
  ('8528.69.00', '85', '8528', 'Other monitors', 'Other Monitors', 'Electronics', 10, 5, 0),
  ('8528.71.00', '85', '8528', 'Receivers with video display', 'TVs with Display', 'Electronics', 10, 5, 0),
  ('8528.72.00', '85', '8528', 'Other video monitors', 'Other Video Monitors', 'Electronics', 10, 5, 0),
  ('8528.73.00', '85', '8528', 'Projectors', 'Projectors', 'Electronics', 10, 5, 0),

  -- Electronic Components (Capacitors, Resistors, etc.)
  ('8532.21.00', '85', '8532', 'Fixed capacitors - tantalum', 'Tantalum Capacitors', 'Electronics', 0, 0, 0),
  ('8532.22.00', '85', '8532', 'Fixed capacitors - aluminum electrolytic', 'Aluminum Capacitors', 'Electronics', 0, 0, 0),
  ('8532.23.00', '85', '8532', 'Fixed capacitors - ceramic', 'Ceramic Capacitors', 'Electronics', 0, 0, 0),
  ('8532.24.00', '85', '8532', 'Fixed capacitors - paper/plastic', 'Paper Capacitors', 'Electronics', 0, 0, 0),
  ('8532.25.00', '85', '8532', 'Fixed capacitors - mica', 'Mica Capacitors', 'Electronics', 0, 0, 0),
  ('8532.29.00', '85', '8532', 'Other fixed capacitors', 'Other Capacitors', 'Electronics', 0, 0, 0),
  ('8532.30.00', '85', '8532', 'Variable/adjustable capacitors', 'Variable Capacitors', 'Electronics', 0, 0, 0),
  ('8532.90.00', '85', '8532', 'Parts of capacitors', 'Capacitor Parts', 'Electronics', 0, 0, 0),
  ('8533.10.00', '85', '8533', 'Fixed resistors - carbon', 'Carbon Resistors', 'Electronics', 0, 0, 0),
  ('8533.21.00', '85', '8533', 'Fixed resistors - wire wound', 'Wire Resistors', 'Electronics', 0, 0, 0),
  ('8533.29.00', '85', '8533', 'Other fixed resistors', 'Other Resistors', 'Electronics', 0, 0, 0),
  ('8533.31.00', '85', '8533', 'Variable resistors - wire wound', 'Wire Potentiometers', 'Electronics', 0, 0, 0),
  ('8533.32.00', '85', '8533', 'Variable resistors - other', 'Other Potentiometers', 'Electronics', 0, 0, 0),
  ('8533.39.00', '85', '8533', 'Other variable resistors', 'Other Variable Resistors', 'Electronics', 0, 0, 0),
  ('8533.40.00', '85', '8533', 'Rheostats', 'Rheostats', 'Electronics', 0, 0, 0),
  ('8533.50.00', '85', '8533', 'Printed circuits', 'Printed Circuits', 'Electronics', 0, 0, 0),
  ('8533.90.00', '85', '8533', 'Parts of resistors', 'Resistor Parts', 'Electronics', 0, 0, 0),

  -- Semiconductors
  ('8541.10.00', '85', '8541', 'Semiconductor diodes', 'Diodes', 'Electronics', 0, 0, 0),
  ('8541.21.00', '85', '8541', 'Transistors - <1W', 'Small Transistors', 'Electronics', 0, 0, 0),
  ('8541.22.00', '85', '8541', 'Transistors - 1-5W', 'Medium Transistors', 'Electronics', 0, 0, 0),
  ('8541.23.00', '85', '8541', 'Transistors - >5W', 'Large Transistors', 'Electronics', 0, 0, 0),
  ('8541.29.00', '85', '8541', 'Other transistors', 'Other Transistors', 'Electronics', 0, 0, 0),
  ('8541.30.00', '85', '8541', 'Thyristors/Diacs/Triacs', 'Thyristors', 'Electronics', 0, 0, 0),
  ('8541.40.00', '85', '8541', 'Semiconductor photocells', 'Photocells', 'Electronics', 0, 0, 0),
  ('8541.42.00', '85', '8541', 'Hall effect circuits', 'Hall Effect', 'Electronics', 0, 0, 0),
  ('8541.43.00', '85', '8541', 'Magnetic heads', 'Magnetic Heads', 'Electronics', 0, 0, 0),
  ('8541.44.00', '85', '8541', 'LEDs', 'LEDs', 'Electronics', 0, 0, 0),
  ('8541.46.00', '85', '8541', 'Optocouplers', 'Optocouplers', 'Electronics', 0, 0, 0),
  ('8541.49.00', '85', '8541', 'Other semiconductor devices', 'Other Semiconductors', 'Electronics', 0, 0, 0),
  ('8541.50.00', '85', '8541', 'Mounted piezoelectric crystals', 'Piezo Crystals', 'Electronics', 0, 0, 0),
  ('8541.60.00', '85', '8541', 'Semiconductor wafers', 'Semiconductor Wafers', 'Electronics', 0, 0, 0),
  ('8541.90.00', '85', '8541', 'Parts of semiconductor devices', 'Semiconductor Parts', 'Electronics', 0, 0, 0),
  ('8542.31.00', '85', '8542', 'Electronic integrated circuits - processors', 'Processors', 'Electronics', 0, 0, 0),
  ('8542.32.00', '85', '8542', 'Electronic integrated circuits - controllers', 'Controllers', 'Electronics', 0, 0, 0),
  ('8542.33.00', '85', '8542', 'Electronic integrated circuits - memories', 'Memory Chips', 'Electronics', 0, 0, 0),
  ('8542.39.00', '85', '8542', 'Other electronic integrated circuits', 'Other ICs', 'Electronics', 0, 0, 0),
  ('8542.90.00', '85', '8542', 'Parts of integrated circuits', 'IC Parts', 'Electronics', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- NOTE: Representative Sample Data
-- ============================================================================
-- This migration contains a representative sample of HSN codes for common
-- product categories in Bhutan. The complete dataset should be imported
-- from the official Bhutan Trade Classification & Tariff Schedule 2022.
--
-- Source: docs/Bhutan-Trade-Classification-and-Tariff-Schedule-2022Amended.pdf
--
-- To import the complete dataset:
-- 1. Extract data from the official PDF using pdftotext
-- 2. Parse the format: CODE Description UNIT CD ST GT
--    - CD (Customs Duty): Applied to imports from non-India countries
--    - ST (Sales Tax): Applied to ALL imports
--    - GT (Green Tax): Environmental tax
-- 3. Bulk insert into hsn_master table
--
-- Tax Rate Patterns (from official document):
-- - Pharmaceuticals: 0 0 0 (tax-free)
-- - Live animals/agriculture: 0 0 0 or 10 0 0
-- - Fish/seafood: 0 0 0 (fresh) or 10 0 0 (frozen/processed)
-- - Electronics: 10 5 0 (most items)
-- - Electronic components (ICs, capacitors): 0 0 0 (raw components)
-- - Food products: varies by type (0-30% ST)
-- - Pork products: 10 20 0 (higher sales tax)
--
-- The following chapters have been sampled in this migration:
-- - Chapter 01: Live Animals
-- - Chapter 02: Meat and Edible Meat Offal
-- - Chapter 03: Fish & Crustaceans
-- - Chapter 30: Pharmaceutical Products
-- - Chapters 84-85: Machinery & Electrical Equipment
--
-- Additional chapters to import as needed:
-- - Chapter 04-05: Dairy Products, Animal Products
-- - Chapter 06-14: Vegetables, Fruits, Cereals, Oil Seeds
-- - Chapter 15-24: Food Products, Beverages, Tobacco
-- - Chapter 27: Mineral Fuels
-- - Chapter 28-38: Chemical Industry
-- - Chapter 39-40: Plastics, Rubber
-- - Chapter 41-43: Hides, Leather, Fur
-- - Chapter 44-49: Wood, Paper, Printed Books
-- - Chapter 50-60: Textiles
-- - Chapter 63-67: Textile Articles, Footwear, Headgear
-- - Chapter 68-71: Stone, Ceramics, Glass, Precious Metals
-- - Chapter 72-83: Base Metals, Tools, Hardware
-- - Chapter 86-89: Vehicles, Aircraft, Ships
-- - Chapter 90-97: Optical Instruments, Clocks, Arms, Works of Art
-- ============================================================================
