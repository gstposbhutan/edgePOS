-- Migration 072: HSN Vendor Seed — All Chapters for Dawai Tshongkhang Import
-- Covers all chapters needed for 1,165-product vendor catalogue
-- Rates per Bhutan Trade Classification 2022: CD | ST | GT
--
-- Stages (append-only):
--   Stage 1: Ch 09 (Coffee/Tea/Spices), Ch 10 (Cereals), Ch 11 (Milling/Flour)
--   Stage 2: Ch 15 (Fats/Oils), Ch 16 (Prepared Meat/Fish)
--   Stage 3: Ch 17 (Sugar), Ch 18 (Cocoa), Ch 19 (Cereal Preps)
--   Stage 4: Ch 20 (Preserved Foods), Ch 21 (Mixed Preps)
--   Stage 5: Ch 22 (Beverages), Ch 24 (Tobacco), Ch 25 (Salt)
--   Stage 6: Ch 33 (Cosmetics), Ch 34 (Soap), Ch 35 (Glue)
--   Stage 7: Ch 39 (Plastics), Ch 48 (Paper)
--   Stage 8: Ch 61-63 (Textiles), Ch 73 (Steel), Ch 82 (Tools)
--   Stage 9: Ch 84-85 (Machinery/Electrical supplement)
--   Stage 10: Ch 96 (Miscellaneous)

-- Chapter 09: Coffee, Tea, Spices
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 0901: Coffee
  ('0901.11.00', '09', '0901', 'Coffee, not roasted - Not decaffeinated', 'Green Coffee', 'Agriculture', 0, 0, 0),
  ('0901.12.00', '09', '0901', 'Coffee, not roasted - Decaffeinated', 'Decaf Green Coffee', 'Agriculture', 0, 0, 0),
  ('0901.21.00', '09', '0901', 'Coffee, roasted - Not decaffeinated', 'Roasted Coffee', 'Agriculture', 10, 0, 0),
  ('0901.22.00', '09', '0901', 'Coffee, roasted - Decaffeinated', 'Decaf Roasted Coffee', 'Agriculture', 10, 0, 0),
  ('0901.90.00', '09', '0901', 'Coffee husks, skins, substitutes', 'Coffee Husks', 'Agriculture', 0, 0, 0),

  -- 0902: Tea
  ('0902.10.00', '09', '0902', 'Green tea, not fermented', 'Green Tea', 'Agriculture', 0, 0, 0),
  ('0902.20.00', '09', '0902', 'Black tea, fermented', 'Black Tea', 'Agriculture', 0, 0, 0),
  ('0902.30.00', '09', '0902', 'Green tea, in packages < 3kg', 'Packed Green Tea', 'Agriculture', 10, 0, 0),
  ('0902.40.00', '09', '0902', 'Black tea, in packages < 3kg', 'Packed Black Tea', 'Agriculture', 10, 0, 0),

  -- 0903: Mate
  ('0903.00.00', '09', '0903', 'Mate', 'Mate', 'Agriculture', 0, 0, 0),

  -- 0904: Pepper; capsicum; pimenta
  ('0904.11.00', '09', '0904', 'Pepper, neither crushed nor ground', 'Whole Pepper', 'Agriculture', 0, 0, 0),
  ('0904.12.00', '09', '0904', 'Pepper, crushed or ground', 'Ground Pepper', 'Agriculture', 0, 0, 0),
  ('0904.21.00', '09', '0904', 'Capsicum (chillies), dried, neither crushed nor ground', 'Dried Chilli Whole', 'Agriculture', 0, 0, 0),
  ('0904.22.00', '09', '0904', 'Capsicum (chillies), dried, crushed or ground', 'Chilli Powder', 'Agriculture', 0, 0, 0),

  -- 0905: Vanilla
  ('0905.10.00', '09', '0905', 'Vanilla, neither crushed nor ground', 'Vanilla Whole', 'Agriculture', 0, 0, 0),
  ('0905.20.00', '09', '0905', 'Vanilla, crushed or ground', 'Vanilla Ground', 'Agriculture', 0, 0, 0),

  -- 0906: Cinnamon
  ('0906.10.00', '09', '0906', 'Cinnamon, neither crushed nor ground', 'Cinnamon Whole', 'Agriculture', 0, 0, 0),
  ('0906.20.00', '09', '0906', 'Cinnamon, crushed or ground', 'Cinnamon Ground', 'Agriculture', 0, 0, 0),

  -- 0907: Cloves
  ('0907.10.00', '09', '0907', 'Cloves (whole stems), neither crushed nor ground', 'Cloves Whole', 'Agriculture', 0, 0, 0),
  ('0907.20.00', '09', '0907', 'Cloves, crushed or ground', 'Cloves Ground', 'Agriculture', 0, 0, 0),

  -- 0908: Nutmeg, mace, cardamom
  ('0908.11.00', '09', '0908', 'Nutmeg, neither crushed nor ground', 'Nutmeg Whole', 'Agriculture', 0, 0, 0),
  ('0908.12.00', '09', '0908', 'Nutmeg, crushed or ground', 'Nutmeg Ground', 'Agriculture', 0, 0, 0),
  ('0908.21.00', '09', '0908', 'Mace, neither crushed nor ground', 'Mace Whole', 'Agriculture', 0, 0, 0),
  ('0908.22.00', '09', '0908', 'Mace, crushed or ground', 'Mace Ground', 'Agriculture', 0, 0, 0),
  ('0908.31.00', '09', '0908', 'Cardamom, neither crushed nor ground', 'Cardamom Whole', 'Agriculture', 0, 0, 0),
  ('0908.32.00', '09', '0908', 'Cardamom, crushed or ground', 'Cardamom Ground', 'Agriculture', 0, 0, 0),

  -- 0909: Seeds of anise, badian, fennel, coriander, cumin, etc.
  ('0909.11.00', '09', '0909', 'Anise or badian seeds, neither crushed nor ground', 'Anise Seeds', 'Agriculture', 0, 0, 0),
  ('0909.12.00', '09', '0909', 'Anise or badian seeds, crushed or ground', 'Anise Ground', 'Agriculture', 0, 0, 0),
  ('0909.21.00', '09', '0909', 'Coriander seeds, neither crushed nor ground', 'Coriander Seeds', 'Agriculture', 0, 0, 0),
  ('0909.22.00', '09', '0909', 'Coriander seeds, crushed or ground', 'Coriander Powder', 'Agriculture', 0, 0, 0),
  ('0909.31.00', '09', '0909', 'Cumin seeds, neither crushed nor ground', 'Cumin Seeds', 'Agriculture', 0, 0, 0),
  ('0909.32.00', '09', '0909', 'Cumin seeds, crushed or ground', 'Cumin Powder', 'Agriculture', 0, 0, 0),
  ('0909.41.00', '09', '0909', 'Caraway seeds, neither crushed nor ground', 'Caraway Seeds', 'Agriculture', 0, 0, 0),
  ('0909.42.00', '09', '0909', 'Caraway seeds, crushed or ground', 'Caraway Ground', 'Agriculture', 0, 0, 0),
  ('0909.50.00', '09', '0909', 'Fennel seeds', 'Fennel Seeds', 'Agriculture', 0, 0, 0),
  ('0909.61.00', '09', '0909', 'Juniper seeds, neither crushed nor ground', 'Juniper Seeds', 'Agriculture', 0, 0, 0),
  ('0909.62.00', '09', '0909', 'Juniper seeds, crushed or ground', 'Juniper Ground', 'Agriculture', 0, 0, 0),

  -- 0910: Ginger, saffron, turmeric, thyme, bay leaves, curry, masala mix
  ('0910.11.00', '09', '0910', 'Ginger, neither crushed nor ground', 'Ginger Whole', 'Agriculture', 0, 0, 0),
  ('0910.12.00', '09', '0910', 'Ginger, crushed or ground', 'Ginger Powder', 'Agriculture', 0, 0, 0),
  ('0910.20.00', '09', '0910', 'Saffron', 'Saffron', 'Agriculture', 0, 0, 0),
  ('0910.30.00', '09', '0910', 'Turmeric (curcuma)', 'Turmeric', 'Agriculture', 0, 0, 0),
  ('0910.40.00', '09', '0910', 'Thyme, bay leaves', 'Thyme/Bay Leaves', 'Agriculture', 0, 0, 0),
  ('0910.50.00', '09', '0910', 'Curry', 'Curry', 'Agriculture', 0, 0, 0),
  ('0910.91.00', '09', '0910', 'Mixtures of spices (masala), neither crushed nor ground', 'Masala Mix Whole', 'Agriculture', 0, 0, 0),
  ('0910.92.00', '09', '0910', 'Mixtures of spices (masala), crushed or ground', 'Masala Powder', 'Agriculture', 0, 0, 0),
  ('0910.99.00', '09', '0910', 'Other spices', 'Other Spices', 'Agriculture', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 10: Cereals
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1001: Wheat
  ('1001.11.00', '10', '1001', 'Durum wheat - Seed', 'Durum Wheat Seed', 'Agriculture', 0, 0, 0),
  ('1001.19.00', '10', '1001', 'Durum wheat - Other', 'Durum Wheat', 'Agriculture', 0, 0, 0),
  ('1001.91.00', '10', '1001', 'Wheat other than durum - Seed', 'Wheat Seed', 'Agriculture', 0, 0, 0),
  ('1001.99.00', '10', '1001', 'Wheat other than durum - Other', 'Wheat', 'Agriculture', 0, 0, 0),

  -- 1002: Rye
  ('1002.10.00', '10', '1002', 'Rye - Seed', 'Rye Seed', 'Agriculture', 0, 0, 0),
  ('1002.90.00', '10', '1002', 'Rye - Other', 'Rye', 'Agriculture', 0, 0, 0),

  -- 1003: Barley
  ('1003.10.00', '10', '1003', 'Barley - Seed', 'Barley Seed', 'Agriculture', 0, 0, 0),
  ('1003.90.00', '10', '1003', 'Barley - Other', 'Barley', 'Agriculture', 0, 0, 0),

  -- 1004: Oats
  ('1004.10.00', '10', '1004', 'Oats - Seed', 'Oat Seed', 'Agriculture', 0, 0, 0),
  ('1004.90.00', '10', '1004', 'Oats - Other', 'Oats', 'Agriculture', 0, 0, 0),

  -- 1005: Maize (corn)
  ('1005.10.00', '10', '1005', 'Maize (corn) - Seed', 'Corn Seed', 'Agriculture', 0, 0, 0),
  ('1005.90.00', '10', '1005', 'Maize (corn) - Other', 'Maize', 'Agriculture', 0, 0, 0),

  -- 1006: Rice
  ('1006.10.00', '10', '1006', 'Rice in the husk (paddy)', 'Paddy Rice', 'Agriculture', 0, 0, 0),
  ('1006.20.00', '10', '1006', 'Husked (brown) rice', 'Brown Rice', 'Agriculture', 0, 0, 0),
  ('1006.30.00', '10', '1006', 'Semi-milled or wholly milled rice', 'White Rice', 'Agriculture', 0, 0, 0),
  ('1006.30.10', '10', '1006', 'Semi-milled rice', 'Semi-Milled Rice', 'Agriculture', 0, 0, 0),
  ('1006.30.20', '10', '1006', 'Wholly milled rice (basmati)', 'Basmati Rice', 'Agriculture', 0, 0, 0),
  ('1006.30.90', '10', '1006', 'Wholly milled rice (other)', 'Milled Rice Other', 'Agriculture', 0, 0, 0),
  ('1006.40.00', '10', '1006', 'Broken rice', 'Broken Rice', 'Agriculture', 0, 0, 0),

  -- 1007: Grain sorghum
  ('1007.10.00', '10', '1007', 'Grain sorghum - Seed', 'Sorghum Seed', 'Agriculture', 0, 0, 0),
  ('1007.90.00', '10', '1007', 'Grain sorghum - Other', 'Sorghum', 'Agriculture', 0, 0, 0),

  -- 1008: Buckwheat, millet, other cereals
  ('1008.10.00', '10', '1008', 'Buckwheat', 'Buckwheat', 'Agriculture', 0, 0, 0),
  ('1008.21.00', '10', '1008', 'Millet - Seed', 'Millet Seed', 'Agriculture', 0, 0, 0),
  ('1008.29.00', '10', '1008', 'Millet - Other', 'Millet', 'Agriculture', 0, 0, 0),
  ('1008.30.00', '10', '1008', 'Canary seed', 'Canary Seed', 'Agriculture', 0, 0, 0),
  ('1008.50.00', '10', '1008', 'Quinoa', 'Quinoa', 'Agriculture', 0, 0, 0),
  ('1008.60.00', '10', '1008', 'Triticale', 'Triticale', 'Agriculture', 0, 0, 0),
  ('1008.90.00', '10', '1008', 'Other cereals', 'Other Cereals', 'Agriculture', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 11: Products of the Milling Industry (Flour, Meal, Starch)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1101: Wheat or meslin flour
  ('1101.00.10', '11', '1101', 'Wheat flour (atta)', 'Atta Flour', 'Agriculture', 0, 0, 0),
  ('1101.00.20', '11', '1101', 'Wheat flour (maida)', 'Maida Flour', 'Agriculture', 0, 0, 0),
  ('1101.00.90', '11', '1101', 'Other wheat or meslin flour', 'Other Wheat Flour', 'Agriculture', 0, 0, 0),

  -- 1102: Cereal flours other than wheat
  ('1102.10.00', '11', '1102', 'Rye flour', 'Rye Flour', 'Agriculture', 0, 0, 0),
  ('1102.20.00', '11', '1102', 'Maize (corn) flour', 'Corn Flour', 'Agriculture', 0, 0, 0),
  ('1102.30.00', '11', '1102', 'Rice flour', 'Rice Flour', 'Agriculture', 0, 0, 0),
  ('1102.50.00', '11', '1102', 'Barley flour', 'Barley Flour', 'Agriculture', 0, 0, 0),
  ('1102.60.00', '11', '1102', 'Oat flour', 'Oat Flour', 'Agriculture', 0, 0, 0),
  ('1102.90.00', '11', '1102', 'Other cereal flours (buckwheat, millet)', 'Other Cereal Flour', 'Agriculture', 0, 0, 0),

  -- 1103: Cereal groats, meal and pellets
  ('1103.11.00', '11', '1103', 'Groats and meal of wheat', 'Wheat Groats', 'Agriculture', 0, 0, 0),
  ('1103.13.00', '11', '1103', 'Groats and meal of maize (corn)', 'Corn Meal', 'Agriculture', 0, 0, 0),
  ('1103.19.00', '11', '1103', 'Groats and meal of other cereals', 'Other Cereal Groats', 'Agriculture', 0, 0, 0),
  ('1103.20.00', '11', '1103', 'Pellets of cereals (sooji/rava)', 'Sooji/Rava', 'Agriculture', 0, 0, 0),

  -- 1104: Cereal grains otherwise worked (flaked, germ)
  ('1104.11.00', '11', '1104', 'Rolled or flaked wheat', 'Wheat Flakes', 'Agriculture', 0, 0, 0),
  ('1104.12.00', '11', '1104', 'Rolled or flaked oats', 'Oat Flakes', 'Agriculture', 0, 0, 0),
  ('1104.13.00', '11', '1104', 'Rolled or flaked maize (corn flakes)', 'Corn Flakes', 'Agriculture', 0, 0, 0),
  ('1104.19.00', '11', '1104', 'Rolled or flaked other cereals', 'Other Cereal Flakes', 'Agriculture', 0, 0, 0),
  ('1104.21.00', '11', '1104', 'Puffed wheat', 'Puffed Wheat', 'Agriculture', 0, 0, 0),
  ('1104.22.00', '11', '1104', 'Puffed rice (murmura)', 'Puffed Rice', 'Agriculture', 0, 0, 0),
  ('1104.23.00', '11', '1104', 'Puffed maize', 'Puffed Corn', 'Agriculture', 0, 0, 0),
  ('1104.29.00', '11', '1104', 'Other worked cereals (germ, etc.)', 'Other Worked Cereals', 'Agriculture', 0, 0, 0),

  -- 1105: Flour, meal, powder of potatoes
  ('1105.10.00', '11', '1105', 'Flour, meal and powder of potatoes', 'Potato Flour', 'Agriculture', 0, 0, 0),
  ('1105.20.00', '11', '1105', 'Flakes, granules and pellets of potatoes', 'Potato Flakes', 'Agriculture', 0, 0, 0),

  -- 1106: Flour, meal of dried legumes, sago, arrowroot
  ('1106.10.00', '11', '1106', 'Flour, meal of dried leguminous vegetables', 'Legume Flour', 'Agriculture', 0, 0, 0),
  ('1106.20.00', '11', '1106', 'Flour, meal of sago or of roots/tubers', 'Sago Flour', 'Agriculture', 0, 0, 0),
  ('1106.30.00', '11', '1106', 'Flour, meal of bananas (plantain)', 'Banana Flour', 'Agriculture', 0, 0, 0),

  -- 1107: Malt, whether or not roasted
  ('1107.10.00', '11', '1107', 'Malt, not roasted', 'Unroasted Malt', 'Agriculture', 0, 0, 0),
  ('1107.20.00', '11', '1107', 'Malt, roasted', 'Roasted Malt', 'Agriculture', 0, 0, 0),

  -- 1108: Starches; inulin
  ('1108.11.00', '11', '1108', 'Wheat starch', 'Wheat Starch', 'Agriculture', 0, 0, 0),
  ('1108.12.00', '11', '1108', 'Maize (corn) starch', 'Corn Starch', 'Agriculture', 0, 0, 0),
  ('1108.13.00', '11', '1108', 'Potato starch', 'Potato Starch', 'Agriculture', 0, 0, 0),
  ('1108.14.00', '11', '1108', 'Cassava (tapioca) starch', 'Tapioca Starch', 'Agriculture', 0, 0, 0),
  ('1108.19.00', '11', '1108', 'Other starches (rice starch, etc.)', 'Other Starch', 'Agriculture', 0, 0, 0),
  ('1108.20.00', '11', '1108', 'Inulin', 'Inulin', 'Agriculture', 0, 0, 0),

  -- 1109: Wheat gluten
  ('1109.00.00', '11', '1109', 'Wheat gluten, whether or not dried', 'Wheat Gluten', 'Agriculture', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 2: Chapters 15-16 (Fats & Oils, Prepared Meat/Fish)
-- ============================================================================

-- Chapter 15: Animal or Vegetable Fats and Oils
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1501: Pig fat (lard) and poultry fat
  ('1501.10.00', '15', '1501', 'Lard', 'Lard', 'Agriculture', 10, 0, 0),
  ('1501.20.00', '15', '1501', 'Rendered pork fat', 'Rendered Pork Fat', 'Agriculture', 10, 0, 0),
  ('1501.90.00', '15', '1501', 'Other pig fat and poultry fat', 'Other Animal Fat', 'Agriculture', 10, 0, 0),

  -- 1502: Fats of bovine animals, sheep or goats
  ('1502.10.00', '15', '1502', 'Fats of bovine animals, sheep or goats - Tallow', 'Tallow', 'Agriculture', 10, 0, 0),
  ('1502.90.00', '15', '1502', 'Other bovine/sheep/goat fats', 'Other Tallow', 'Agriculture', 10, 0, 0),

  -- 1503: Lard stearin, lard oil, oleostearin, oleo-oil, tallow oil
  ('1503.00.10', '15', '1503', 'Lard stearin and lard oil', 'Lard Stearin', 'Agriculture', 10, 0, 0),
  ('1503.00.90', '15', '1503', 'Other lard/tallow products', 'Other Lard Products', 'Agriculture', 10, 0, 0),

  -- 1504: Fats and oils of fish or marine mammals
  ('1504.10.00', '15', '1504', 'Fish-liver oils and their fractions', 'Fish Liver Oil', 'Agriculture', 0, 0, 0),
  ('1504.20.00', '15', '1504', 'Fats and oils of fish, other than liver oils', 'Fish Oil', 'Agriculture', 0, 0, 0),

  -- 1505: Wool grease (lanolin)
  ('1505.00.00', '15', '1505', 'Wool grease (lanolin)', 'Lanolin', 'Agriculture', 10, 0, 0),

  -- 1506: Other animal fats and oils
  ('1506.00.00', '15', '1506', 'Other animal fats and oils', 'Other Animal Oils', 'Agriculture', 10, 0, 0),

  -- 1507: Soya-bean oil
  ('1507.10.00', '15', '1507', 'Crude soya-bean oil', 'Crude Soyabean Oil', 'Agriculture', 0, 0, 0),
  ('1507.90.00', '15', '1507', 'Refined soya-bean oil', 'Refined Soyabean Oil', 'Agriculture', 0, 0, 0),

  -- 1508: Ground-nut (peanut) oil
  ('1508.10.00', '15', '1508', 'Crude ground-nut oil', 'Crude Peanut Oil', 'Agriculture', 0, 0, 0),
  ('1508.90.00', '15', '1508', 'Refined ground-nut oil', 'Refined Peanut Oil', 'Agriculture', 0, 0, 0),

  -- 1509: Olive oil
  ('1509.10.00', '15', '1509', 'Virgin olive oil', 'Virgin Olive Oil', 'Agriculture', 0, 0, 0),
  ('1509.90.00', '15', '1509', 'Other olive oil (refined)', 'Refined Olive Oil', 'Agriculture', 10, 0, 0),

  -- 1510: Other olive oils
  ('1510.00.00', '15', '1510', 'Other olive oils and their fractions', 'Other Olive Oil', 'Agriculture', 10, 0, 0),

  -- 1511: Palm oil
  ('1511.10.00', '15', '1511', 'Crude palm oil', 'Crude Palm Oil', 'Agriculture', 0, 0, 0),
  ('1511.90.00', '15', '1511', 'Refined palm oil (palmolein, cooking oil)', 'Refined Palm Oil', 'Agriculture', 0, 0, 0),

  -- 1512: Sunflower-seed, safflower or cotton-seed oil
  ('1512.11.00', '15', '1512', 'Crude sunflower-seed oil', 'Crude Sunflower Oil', 'Agriculture', 0, 0, 0),
  ('1512.19.00', '15', '1512', 'Refined sunflower-seed oil', 'Refined Sunflower Oil', 'Agriculture', 0, 0, 0),
  ('1512.21.00', '15', '1512', 'Crude safflower oil', 'Crude Safflower Oil', 'Agriculture', 0, 0, 0),
  ('1512.29.00', '15', '1512', 'Refined safflower oil', 'Refined Safflower Oil', 'Agriculture', 0, 0, 0),
  ('1512.31.00', '15', '1512', 'Crude cotton-seed oil', 'Crude Cottonseed Oil', 'Agriculture', 0, 0, 0),
  ('1512.39.00', '15', '1512', 'Refined cotton-seed oil', 'Refined Cottonseed Oil', 'Agriculture', 0, 0, 0),

  -- 1513: Coconut (copra), palm kernel or babassu oil
  ('1513.11.00', '15', '1513', 'Crude coconut oil', 'Crude Coconut Oil', 'Agriculture', 0, 0, 0),
  ('1513.19.00', '15', '1513', 'Refined coconut oil', 'Refined Coconut Oil', 'Agriculture', 0, 0, 0),
  ('1513.21.00', '15', '1513', 'Crude palm kernel oil', 'Crude Palm Kernel Oil', 'Agriculture', 0, 0, 0),
  ('1513.29.00', '15', '1513', 'Refined palm kernel oil', 'Refined Palm Kernel Oil', 'Agriculture', 0, 0, 0),

  -- 1514: Rape, colza or mustard oil
  ('1514.11.00', '15', '1514', 'Crude rape or colza oil (low erucic acid)', 'Crude Canola Oil', 'Agriculture', 0, 0, 0),
  ('1514.19.00', '15', '1514', 'Refined rape or colza oil', 'Refined Canola Oil', 'Agriculture', 0, 0, 0),
  ('1514.91.00', '15', '1514', 'Crude mustard oil', 'Crude Mustard Oil', 'Agriculture', 0, 0, 0),
  ('1514.99.00', '15', '1514', 'Refined mustard oil', 'Refined Mustard Oil', 'Agriculture', 0, 0, 0),

  -- 1515: Other fixed vegetable fats and oils
  ('1515.11.00', '15', '1515', 'Crude linseed (flaxseed) oil', 'Crude Linseed Oil', 'Agriculture', 0, 0, 0),
  ('1515.19.00', '15', '1515', 'Refined linseed (flaxseed) oil', 'Refined Linseed Oil', 'Agriculture', 0, 0, 0),
  ('1515.21.00', '15', '1515', 'Crude maize (corn) oil', 'Crude Corn Oil', 'Agriculture', 0, 0, 0),
  ('1515.29.00', '15', '1515', 'Refined maize (corn) oil', 'Refined Corn Oil', 'Agriculture', 0, 0, 0),
  ('1515.30.00', '15', '1515', 'Castor oil', 'Castor Oil', 'Agriculture', 0, 0, 0),
  ('1515.50.00', '15', '1515', 'Sesame oil', 'Sesame Oil', 'Agriculture', 0, 0, 0),
  ('1515.59.00', '15', '1515', 'Other fixed vegetable oils (jojoba, etc.)', 'Other Vegetable Oil', 'Agriculture', 0, 0, 0),

  -- 1516: Animal or vegetable fats and oils, hydrogenated
  ('1516.10.00', '15', '1516', 'Animal fats and oils, hydrogenated (dalda/vanaspati)', 'Dalda/Vanaspati', 'Agriculture', 0, 0, 0),
  ('1516.20.00', '15', '1516', 'Vegetable fats and oils, hydrogenated', 'Hydrogenated Veg Oil', 'Agriculture', 0, 0, 0),

  -- 1517: Margarine; edible mixtures or preparations of animal/vegetable fats
  ('1517.10.00', '15', '1517', 'Margarine (excl. liquid margarine)', 'Margarine', 'Agriculture', 0, 0, 0),
  ('1517.90.00', '15', '1517', 'Other edible mixtures of fats/oil', 'Edible Fat Mix', 'Agriculture', 0, 0, 0),

  -- 1518: Animal or vegetable fats and oils, chemically modified
  ('1518.00.10', '15', '1518', 'Chemically modified animal fats', 'Modified Animal Fat', 'Agriculture', 10, 0, 0),
  ('1518.00.90', '15', '1518', 'Chemically modified vegetable oils', 'Modified Vegetable Oil', 'Agriculture', 10, 0, 0),

  -- 1520: Glycerol crude
  ('1520.00.00', '15', '1520', 'Crude glycerol', 'Crude Glycerol', 'Agriculture', 0, 0, 0),

  -- 1521: Vegetable waxes, beeswax, insect waxes
  ('1521.10.00', '15', '1521', 'Vegetable waxes', 'Vegetable Wax', 'Agriculture', 0, 0, 0),
  ('1521.90.00', '15', '1521', 'Beeswax, insect waxes, spermaceti', 'Beeswax', 'Agriculture', 0, 0, 0),

  -- 1522: Degras; residues from fatty substances
  ('1522.00.00', '15', '1522', 'Degras and other residues of fats/oils', 'Fat Residues', 'Agriculture', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 16: Preparations of Meat, Fish or Crustaceans
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1601: Sausages and similar products of meat/meat offal
  ('1601.00.10', '16', '1601', 'Sausages of pork', 'Pork Sausages', 'Food & Beverage', 10, 10, 0),
  ('1601.00.20', '16', '1601', 'Sausages of beef', 'Beef Sausages', 'Food & Beverage', 10, 10, 0),
  ('1601.00.30', '16', '1601', 'Sausages of chicken', 'Chicken Sausages', 'Food & Beverage', 10, 10, 0),
  ('1601.00.90', '16', '1601', 'Other sausages and similar products', 'Other Sausages', 'Food & Beverage', 10, 10, 0),

  -- 1602: Other prepared or preserved meat, meat offal or blood
  ('1602.10.00', '16', '1602', 'Prepared/preserved meat of homogenised preparations', 'Homogenised Meat', 'Food & Beverage', 10, 10, 0),
  ('1602.20.00', '16', '1602', 'Prepared/preserved liver of any animal', 'Prepared Liver', 'Food & Beverage', 10, 10, 0),
  ('1602.31.00', '16', '1602', 'Prepared/preserved turkey', 'Prepared Turkey', 'Food & Beverage', 10, 10, 0),
  ('1602.32.00', '16', '1602', 'Prepared/preserved chicken (canned chicken)', 'Canned Chicken', 'Food & Beverage', 10, 10, 0),
  ('1602.39.00', '16', '1602', 'Prepared/preserved poultry other', 'Other Prepared Poultry', 'Food & Beverage', 10, 10, 0),
  ('1602.41.00', '16', '1602', 'Prepared/preserved pork (canned pork, ham)', 'Canned Pork/Ham', 'Food & Beverage', 10, 10, 0),
  ('1602.42.00', '16', '1602', 'Prepared/preserved pork (shoulder cuts)', 'Prepared Pork Shoulder', 'Food & Beverage', 10, 10, 0),
  ('1602.49.00', '16', '1602', 'Prepared/preserved pork (other)', 'Other Prepared Pork', 'Food & Beverage', 10, 10, 0),
  ('1602.50.00', '16', '1602', 'Prepared/preserved beef (canned beef, corned beef)', 'Canned Beef', 'Food & Beverage', 10, 10, 0),
  ('1602.90.00', '16', '1602', 'Other prepared/preserved meat (mutton, duck, etc.)', 'Other Prepared Meat', 'Food & Beverage', 10, 10, 0),

  -- 1603: Extracts and juices of meat, fish or crustaceans
  ('1603.00.00', '16', '1603', 'Extracts and juices of meat, fish or crustaceans', 'Meat Extracts', 'Food & Beverage', 10, 10, 0),

  -- 1604: Prepared or preserved fish; caviar
  ('1604.11.00', '16', '1604', 'Salmon, prepared or preserved (canned salmon)', 'Canned Salmon', 'Food & Beverage', 10, 10, 0),
  ('1604.12.00', '16', '1604', 'Herrings, prepared or preserved', 'Canned Herring', 'Food & Beverage', 10, 10, 0),
  ('1604.13.00', '16', '1604', 'Sardines, prepared/preserved (tin fish)', 'Canned Sardines', 'Food & Beverage', 10, 10, 0),
  ('1604.14.00', '16', '1604', 'Tuna, skipjack, prepared/preserved (tin fish)', 'Canned Tuna', 'Food & Beverage', 10, 10, 0),
  ('1604.15.00', '16', '1604', 'Mackerel, prepared or preserved', 'Canned Mackerel', 'Food & Beverage', 10, 10, 0),
  ('1604.16.00', '16', '1604', 'Anchovies, prepared or preserved', 'Canned Anchovies', 'Food & Beverage', 10, 10, 0),
  ('1604.19.00', '16', '1604', 'Other fish, prepared or preserved', 'Other Canned Fish', 'Food & Beverage', 10, 10, 0),
  ('1604.20.00', '16', '1604', 'Caviar', 'Caviar', 'Food & Beverage', 10, 10, 0),

  -- 1605: Crustaceans, molluscs prepared/preserved
  ('1605.10.00', '16', '1605', 'Prepared/preserved crab', 'Canned Crab', 'Food & Beverage', 10, 10, 0),
  ('1605.21.00', '16', '1605', 'Prepared/preserved shrimp (not airtight)', 'Prepared Shrimp', 'Food & Beverage', 10, 10, 0),
  ('1605.29.00', '16', '1605', 'Prepared/preserved shrimp (canned)', 'Canned Shrimp', 'Food & Beverage', 10, 10, 0),
  ('1605.30.00', '16', '1605', 'Prepared/preserved lobster', 'Canned Lobster', 'Food & Beverage', 10, 10, 0),
  ('1605.40.00', '16', '1605', 'Prepared/preserved molluscs (clam, oyster)', 'Canned Molluscs', 'Food & Beverage', 10, 10, 0),
  ('1605.51.00', '16', '1605', 'Prepared/preserved sea cucumbers', 'Prepared Sea Cucumber', 'Food & Beverage', 10, 10, 0),
  ('1605.59.00', '16', '1605', 'Other prepared/preserved aquatic invertebrates', 'Other Prepared Shellfish', 'Food & Beverage', 10, 10, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 3: Chapters 17-19 (Sugar, Cocoa, Cereal & Food Preparations)
-- ============================================================================

-- Chapter 17: Sugars and Sugar Confectionery
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1701: Cane or beet sugar
  ('1701.12.00', '17', '1701', 'Cane sugar, raw, in solid form', 'Raw Cane Sugar', 'Agriculture', 0, 0, 0),
  ('1701.13.00', '17', '1701', 'Cane sugar, raw, containing added flavour/colour', 'Flavoured Raw Sugar', 'Agriculture', 0, 0, 0),
  ('1701.14.00', '17', '1701', 'Cane sugar, raw, other', 'Other Raw Cane Sugar', 'Agriculture', 0, 0, 0),
  ('1701.91.00', '17', '1701', 'Refined sugar, containing added flavour/colour', 'Flavoured Refined Sugar', 'Agriculture', 0, 0, 0),
  ('1701.99.00', '17', '1701', 'Other refined sugar (white sugar)', 'White Sugar', 'Agriculture', 0, 0, 0),

  -- 1702: Other sugars (fructose, glucose, maltose, etc.)
  ('1702.20.00', '17', '1702', 'Maple sugar and maple syrup', 'Maple Sugar/Syrup', 'Agriculture', 10, 0, 0),
  ('1702.30.00', '17', '1702', 'Glucose and glucose syrup, not containing fructose >= 20%', 'Glucose Syrup', 'Agriculture', 0, 0, 0),
  ('1702.40.00', '17', '1702', 'Glucose and glucose syrup, containing fructose >= 20%', 'Glucose-Fructose Syrup', 'Agriculture', 0, 0, 0),
  ('1702.50.00', '17', '1702', 'Fructose (chemically pure)', 'Fructose', 'Agriculture', 0, 0, 0),
  ('1702.60.00', '17', '1702', 'Other fructose and fructose syrup', 'Other Fructose Syrup', 'Agriculture', 0, 0, 0),
  ('1702.90.00', '17', '1702', 'Other sugars (jaggery, gur, brown sugar)', 'Jaggery/Brown Sugar', 'Agriculture', 0, 0, 0),

  -- 1703: Molasses
  ('1703.10.00', '17', '1703', 'Cane molasses', 'Cane Molasses', 'Agriculture', 0, 0, 0),
  ('1703.90.00', '17', '1703', 'Other molasses', 'Other Molasses', 'Agriculture', 0, 0, 0),

  -- 1704: Sugar confectionery
  ('1704.10.00', '17', '1704', 'Chewing gum, whether or not sugar-coated', 'Chewing Gum', 'Food & Beverage', 10, 10, 0),
  ('1704.20.00', '17', '1704', 'Sugar confectionery (white chocolate)', 'White Chocolate', 'Food & Beverage', 10, 10, 0),
  ('1704.31.00', '17', '1704', 'Boiled sweets (candy), not containing cocoa', 'Boiled Sweets/Candy', 'Food & Beverage', 10, 10, 0),
  ('1704.32.00', '17', '1704', 'Toffees, caramels, nougat, not containing cocoa', 'Toffees/Caramels', 'Food & Beverage', 10, 10, 0),
  ('1704.39.00', '17', '1704', 'Other sugar confectionery (pastilles, lozenges)', 'Other Sugar Confectionery', 'Food & Beverage', 10, 10, 0),
  ('1704.90.00', '17', '1704', 'Other sugar confectionery', 'Confectionery Other', 'Food & Beverage', 10, 10, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 18: Cocoa and Cocoa Preparations
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1801: Cocoa beans, whole or broken, raw or roasted
  ('1801.00.10', '18', '1801', 'Cocoa beans, whole or broken, raw', 'Raw Cocoa Beans', 'Agriculture', 0, 0, 0),
  ('1801.00.20', '18', '1801', 'Cocoa beans, whole or broken, roasted', 'Roasted Cocoa Beans', 'Agriculture', 0, 0, 0),

  -- 1802: Cocoa shells, husks, skins and waste
  ('1802.00.00', '18', '1802', 'Cocoa shells, husks, skins and waste', 'Cocoa Waste', 'Agriculture', 0, 0, 0),

  -- 1803: Cocoa paste, whether or not defatted
  ('1803.10.00', '18', '1803', 'Cocoa paste, not defatted', 'Cocoa Paste', 'Agriculture', 0, 0, 0),
  ('1803.20.00', '18', '1803', 'Cocoa paste, wholly or partly defatted', 'Defatted Cocoa Paste', 'Agriculture', 0, 0, 0),

  -- 1804: Cocoa butter, fat and oil
  ('1804.00.00', '18', '1804', 'Cocoa butter, fat and oil', 'Cocoa Butter', 'Agriculture', 0, 0, 0),

  -- 1805: Cocoa powder, not containing added sugar/sweetening
  ('1805.00.10', '18', '1805', 'Cocoa powder, not containing added sugar', 'Unsweetened Cocoa Powder', 'Agriculture', 0, 0, 0),
  ('1805.00.90', '18', '1805', 'Other cocoa powder', 'Other Cocoa Powder', 'Agriculture', 0, 0, 0),

  -- 1806: Chocolate and other cocoa preparations
  ('1806.10.00', '18', '1806', 'Cocoa powder with added sugar/sweetener (drinking chocolate)', 'Drinking Chocolate', 'Food & Beverage', 10, 10, 0),
  ('1806.20.00', '18', '1806', 'Chocolate and cocoa preparations in blocks/slabs > 2kg', 'Bulk Chocolate', 'Food & Beverage', 10, 10, 0),
  ('1806.31.00', '18', '1806', 'Chocolate, filled (chocolate bars with filling)', 'Filled Chocolate Bars', 'Food & Beverage', 10, 10, 0),
  ('1806.32.00', '18', '1806', 'Chocolate, not filled (plain chocolate bars)', 'Plain Chocolate Bars', 'Food & Beverage', 10, 10, 0),
  ('1806.41.00', '18', '1806', 'White chocolate, in blocks/slabs/bars', 'White Chocolate Bars', 'Food & Beverage', 10, 10, 0),
  ('1806.42.00', '18', '1806', 'Chocolate confectionery containing alcohol', 'Liqueur Chocolates', 'Food & Beverage', 10, 10, 0),
  ('1806.52.00', '18', '1806', 'Chocolate, nuts/fruit based (fruit & nut chocolate)', 'Fruit & Nut Chocolate', 'Food & Beverage', 10, 10, 0),
  ('1806.90.00', '18', '1806', 'Other chocolate and cocoa preparations (kit kat, etc.)', 'Other Chocolate Prep', 'Food & Beverage', 10, 10, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 19: Preparations of Cereals, Flour, Starch or Milk; Pastrycooks' Products
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 1901: Malt extract; food preparations of flour, starch or malt extract
  ('1901.10.00', '19', '1901', 'Malt extract', 'Malt Extract', 'Food & Beverage', 0, 0, 0),
  ('1901.20.00', '19', '1901', 'Preparations for infant use (cerelac, lactogen)', 'Infant Formula/Cerelac', 'Food & Beverage', 0, 0, 0),
  ('1901.90.00', '19', '1901', 'Other food preparations of flour/starch/malt (horlicks, boost, bournvita)', 'Malt-Based Drinks', 'Food & Beverage', 0, 0, 0),

  -- 1902: Pasta, whether or not cooked or stuffed
  ('1902.11.00', '19', '1902', 'Pasta, uncooked, not stuffed (spaghetti, macaroni)', 'Dry Pasta', 'Food & Beverage', 0, 0, 0),
  ('1902.19.00', '19', '1902', 'Pasta, uncooked, other', 'Other Dry Pasta', 'Food & Beverage', 0, 0, 0),
  ('1902.20.00', '19', '1902', 'Pasta, stuffed (ravioli, canned pasta)', 'Stuffed Pasta', 'Food & Beverage', 10, 10, 0),
  ('1902.30.00', '19', '1902', 'Pasta, cooked (instant noodles, ramen)', 'Instant Noodles', 'Food & Beverage', 0, 0, 0),
  ('1902.40.00', '19', '1902', 'Couscous, whether or not prepared', 'Couscous', 'Food & Beverage', 0, 0, 0),

  -- 1903: Tapioca and substitutes therefor
  ('1903.00.00', '19', '1903', 'Tapioca and substitutes (sago pearls)', 'Tapioca/Sago', 'Food & Beverage', 0, 0, 0),

  -- 1904: Prepared foods obtained from unroasted cereal flakes or similar
  ('1904.10.00', '19', '1904', 'Prepared foods from cereal flakes (corn flakes, muesli)', 'Corn Flakes/Muesli', 'Food & Beverage', 10, 5, 0),
  ('1904.20.00', '19', '1904', 'Prepared foods from cereals, puffed/roasted (chocos, snacks)', 'Puffed/Roasted Cereals', 'Food & Beverage', 10, 5, 0),
  ('1904.30.00', '19', '1904', 'Bulghur (burghul)', 'Bulghur', 'Food & Beverage', 0, 0, 0),
  ('1904.90.00', '19', '1904', 'Other prepared cereal foods (rice cakes, chips)', 'Other Cereal Snacks', 'Food & Beverage', 10, 5, 0),

  -- 1905: Bread, pastry, cakes, biscuits and other bakers' wares
  ('1905.10.00', '19', '1905', 'Crispbread', 'Crispbread', 'Food & Beverage', 0, 0, 0),
  ('1905.20.00', '19', '1905', 'Gingerbread and the like', 'Gingerbread', 'Food & Beverage', 0, 0, 0),
  ('1905.31.00', '19', '1905', 'Sweet biscuits (cookies)', 'Sweet Biscuits/Cookies', 'Food & Beverage', 10, 5, 0),
  ('1905.32.00', '19', '1905', 'Waffles and wafers', 'Waffles/Wafers', 'Food & Beverage', 10, 5, 0),
  ('1905.40.00', '19', '1905', 'Rusk, toasted bread and similar toasted products', 'Rusks/Toast', 'Food & Beverage', 0, 0, 0),
  ('1905.90.00', '19', '1905', 'Other bread, pastry, cakes, biscuits (bread, cake, pastry)', 'Other Bakery Products', 'Food & Beverage', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 4: Chapters 20-21 (Preserved Foods, Mixed Food Preparations)
-- ============================================================================

-- Chapter 20: Preparations of Vegetables, Fruit, Nuts or Other Parts of Plants
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 2001: Vegetables, fruit, nuts prepared/preserved by vinegar (pickle)
  ('2001.10.00', '20', '2001', 'Cucumbers and gherkins, prepared by vinegar (pickle)', 'Cucumber Pickle', 'Food & Beverage', 10, 5, 0),
  ('2001.90.10', '20', '2001', 'Onions, prepared by vinegar', 'Pickled Onions', 'Food & Beverage', 10, 5, 0),
  ('2001.90.20', '20', '2001', 'Olives, prepared by vinegar', 'Pickled Olives', 'Food & Beverage', 10, 5, 0),
  ('2001.90.30', '20', '2001', 'Capers, prepared by vinegar', 'Pickled Capers', 'Food & Beverage', 10, 5, 0),
  ('2001.90.90', '20', '2001', 'Other vegetables/fruit prepared by vinegar (achar, pickle)', 'Other Pickles/Achar', 'Food & Beverage', 10, 5, 0),

  -- 2002: Tomatoes, prepared or preserved otherwise than by vinegar
  ('2002.10.00', '20', '2002', 'Tomatoes, whole or in pieces, prepared/preserved', 'Canned Tomatoes', 'Food & Beverage', 10, 5, 0),
  ('2002.90.00', '20', '2002', 'Tomato paste, puree, ketchup (not vinegar-based)', 'Tomato Paste/Puree', 'Food & Beverage', 10, 5, 0),

  -- 2003: Mushrooms and truffles, prepared or preserved
  ('2003.10.00', '20', '2003', 'Mushrooms, prepared or preserved (canned mushroom)', 'Canned Mushrooms', 'Food & Beverage', 10, 5, 0),
  ('2003.20.00', '20', '2003', 'Truffles, prepared or preserved', 'Preserved Truffles', 'Food & Beverage', 10, 5, 0),

  -- 2004: Other vegetables prepared/preserved, frozen
  ('2004.10.00', '20', '2004', 'Potatoes, prepared/preserved, frozen (frozen fries)', 'Frozen Potato Products', 'Food & Beverage', 10, 5, 0),
  ('2004.90.00', '20', '2004', 'Other vegetables, prepared/preserved, frozen', 'Frozen Prepared Veg', 'Food & Beverage', 10, 5, 0),

  -- 2005: Other vegetables prepared/preserved, not frozen
  ('2005.10.00', '20', '2005', 'Potatoes, prepared/preserved, not frozen (chips, crisps)', 'Potato Chips/Crisps', 'Food & Beverage', 10, 5, 0),
  ('2005.20.00', '20', '2005', 'Olives, prepared/preserved, not frozen', 'Prepared Olives', 'Food & Beverage', 10, 5, 0),
  ('2005.51.00', '20', '2005', 'Vegetables, not frozen, in airtight containers (canned beans)', 'Canned Beans', 'Food & Beverage', 10, 5, 0),
  ('2005.59.00', '20', '2005', 'Other vegetables, not frozen (bamboo shoots, peas)', 'Other Canned Vegetables', 'Food & Beverage', 10, 5, 0),
  ('2005.60.00', '20', '2005', 'Asparagus, prepared/preserved, not frozen', 'Prepared Asparagus', 'Food & Beverage', 10, 5, 0),
  ('2005.70.00', '20', '2005', 'Olives, other', 'Other Olives', 'Food & Beverage', 10, 5, 0),
  ('2005.80.00', '20', '2005', 'Sweet corn, prepared/preserved', 'Canned Sweet Corn', 'Food & Beverage', 10, 5, 0),
  ('2005.91.00', '20', '2005', 'Other vegetables, peas (canned peas)', 'Canned Peas', 'Food & Beverage', 10, 5, 0),
  ('2005.99.00', '20', '2005', 'Other vegetables, prepared/preserved', 'Other Preserved Veg', 'Food & Beverage', 10, 5, 0),

  -- 2006: Vegetables, fruit, nuts preserved by sugar
  ('2006.00.10', '20', '2006', 'Cherries, preserved by sugar (glace cherries)', 'Glace Cherries', 'Food & Beverage', 10, 5, 0),
  ('2006.00.90', '20', '2006', 'Other fruit/nuts preserved by sugar', 'Other Sugar-Preserved Fruit', 'Food & Beverage', 10, 5, 0),

  -- 2007: Jams, fruit jellies, marmalades, fruit puree/paste
  ('2007.10.00', '20', '2007', 'Jams, fruit jellies, marmalades (homogenised)', 'Homogenised Jams', 'Food & Beverage', 10, 5, 0),
  ('2007.91.00', '20', '2007', 'Jams (citrus fruit)', 'Citrus Jam', 'Food & Beverage', 10, 5, 0),
  ('2007.99.00', '20', '2007', 'Other jams, jellies, marmalades', 'Other Jams/Jellies', 'Food & Beverage', 10, 5, 0),

  -- 2008: Fruit, nuts and other edible parts of plants, prepared
  ('2008.11.00', '20', '2008', 'Peanuts, prepared (roasted peanuts, peanut butter)', 'Roasted Peanuts', 'Food & Beverage', 10, 5, 0),
  ('2008.19.00', '20', '2008', 'Other nuts, prepared (cashews, almonds, mixed nuts)', 'Prepared Nuts', 'Food & Beverage', 10, 5, 0),
  ('2008.20.00', '20', '2008', 'Pineapples, prepared', 'Prepared Pineapple', 'Food & Beverage', 10, 5, 0),
  ('2008.30.00', '20', '2008', 'Citrus fruit, prepared', 'Prepared Citrus', 'Food & Beverage', 10, 5, 0),
  ('2008.40.00', '20', '2008', 'Pears, prepared', 'Prepared Pears', 'Food & Beverage', 10, 5, 0),
  ('2008.50.00', '20', '2008', 'Apricots, prepared', 'Prepared Apricots', 'Food & Beverage', 10, 5, 0),
  ('2008.60.00', '20', '2008', 'Cherries, prepared', 'Prepared Cherries', 'Food & Beverage', 10, 5, 0),
  ('2008.70.00', '20', '2008', 'Peaches, prepared (canned peaches)', 'Canned Peaches', 'Food & Beverage', 10, 5, 0),
  ('2008.80.00', '20', '2008', 'Strawberries, prepared', 'Prepared Strawberries', 'Food & Beverage', 10, 5, 0),
  ('2008.91.00', '20', '2008', 'Palm hearts, prepared', 'Prepared Palm Hearts', 'Food & Beverage', 10, 5, 0),
  ('2008.99.00', '20', '2008', 'Other fruit, prepared (mixed fruit cocktail)', 'Other Prepared Fruit', 'Food & Beverage', 10, 5, 0),

  -- 2009: Fruit juices (including grape must) and vegetable juices
  ('2009.11.00', '20', '2009', 'Orange juice, frozen', 'Frozen Orange Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.12.00', '20', '2009', 'Orange juice, not frozen', 'Orange Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.19.00', '20', '2009', 'Other orange juice', 'Other Orange Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.21.00', '20', '2009', 'Grapefruit juice', 'Grapefruit Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.31.00', '20', '2009', 'Pineapple juice', 'Pineapple Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.41.00', '20', '2009', 'Tomato juice', 'Tomato Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.50.00', '20', '2009', 'Grape juice (incl. grape must)', 'Grape Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.61.00', '20', '2009', 'Apple juice', 'Apple Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.71.00', '20', '2009', 'Other single fruit juice (mango, litchi)', 'Mango/Litchi Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.79.00', '20', '2009', 'Other single fruit juice, not concentrated', 'Other Fruit Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.80.00', '20', '2009', 'Juice of any other single fruit/vegetable', 'Mixed/Vegetable Juice', 'Food & Beverage', 0, 0, 0),
  ('2009.90.00', '20', '2009', 'Mixtures of juices', 'Mixed Fruit Juice', 'Food & Beverage', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 21: Miscellaneous Edible Preparations
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 2101: Extracts, essences and concentrates of coffee/tea
  ('2101.11.00', '21', '2101', 'Extracts, essences of coffee (instant coffee)', 'Instant Coffee', 'Food & Beverage', 10, 5, 0),
  ('2101.12.00', '21', '2101', 'Preparations with a basis of coffee extracts (3-in-1 coffee)', '3-in-1 Coffee Mix', 'Food & Beverage', 10, 5, 0),
  ('2101.20.00', '21', '2101', 'Extracts, essences of tea (instant tea)', 'Instant Tea', 'Food & Beverage', 10, 5, 0),
  ('2101.30.00', '21', '2101', 'Roasted chicory and other roasted coffee substitutes', 'Chicory/Coffee Sub', 'Food & Beverage', 10, 5, 0),

  -- 2102: Yeasts; prepared baking powders
  ('2102.10.00', '21', '2102', 'Active yeasts (baker''s yeast)', 'Baker''s Yeast', 'Food & Beverage', 0, 0, 0),
  ('2102.20.00', '21', '2102', 'Inactive yeasts (nutritional yeast)', 'Inactive Yeast', 'Food & Beverage', 0, 0, 0),
  ('2102.30.00', '21', '2102', 'Prepared baking powders', 'Baking Powder', 'Food & Beverage', 0, 0, 0),

  -- 2103: Sauces and preparations thereof; mixed condiments; mustard
  ('2103.10.00', '21', '2103', 'Soya sauce', 'Soya Sauce', 'Food & Beverage', 10, 5, 0),
  ('2103.20.00', '21', '2103', 'Tomato ketchup and other tomato sauces', 'Tomato Ketchup', 'Food & Beverage', 10, 5, 0),
  ('2103.30.00', '21', '2103', 'Mustard flour and meal', 'Mustard Flour', 'Food & Beverage', 0, 0, 0),
  ('2103.90.10', '21', '2103', 'Mixed condiments and mixed seasonings (chutney, relish)', 'Chutney/Relish', 'Food & Beverage', 10, 5, 0),
  ('2103.90.20', '21', '2103', 'Spice mixtures for specific dishes (biryani masala, garam masala)', 'Spice Mixtures', 'Food & Beverage', 0, 0, 0),
  ('2103.90.30', '21', '2103', 'Other sauces (chilli sauce, fish sauce, oyster sauce)', 'Other Sauces', 'Food & Beverage', 10, 5, 0),
  ('2103.90.90', '21', '2103', 'Other mixed condiments and seasonings', 'Other Condiments', 'Food & Beverage', 10, 5, 0),

  -- 2104: Soups and broths; preparations for soups/broths
  ('2104.10.00', '21', '2104', 'Soups and broths and preparations therefor', 'Soup/Broth', 'Food & Beverage', 10, 5, 0),
  ('2104.20.00', '21', '2104', 'Homogenised composite food preparations', 'Homogenised Food Prep', 'Food & Beverage', 10, 5, 0),

  -- 2105: Ice cream and other edible ice
  ('2105.00.10', '21', '2105', 'Ice cream', 'Ice Cream', 'Food & Beverage', 10, 10, 0),
  ('2105.00.20', '21', '2105', 'Other edible ice (kulfi, popsicle)', 'Other Edible Ice', 'Food & Beverage', 10, 10, 0),

  -- 2106: Food preparations not elsewhere specified
  ('2106.10.00', '21', '2106', 'Protein concentrates and textured protein substances', 'Protein Supplements', 'Food & Beverage', 10, 5, 0),
  ('2106.90.10', '21', '2106', 'Honey preparations', 'Honey Preparations', 'Food & Beverage', 10, 5, 0),
  ('2106.90.20', '21', '2106', 'Preparations for beverages (syrups, drink mixes)', 'Drink Mixes/Syrups', 'Food & Beverage', 10, 5, 0),
  ('2106.90.30', '21', '2106', 'Prepared chewing gum (medicated)', 'Medicated Chewing Gum', 'Food & Beverage', 10, 10, 0),
  ('2106.90.40', '21', '2106', 'Food supplements and dietary supplements', 'Food/Dietary Supplements', 'Food & Beverage', 10, 5, 0),
  ('2106.90.90', '21', '2106', 'Other food preparations (pancake mix, pudding mix)', 'Other Food Preparations', 'Food & Beverage', 10, 5, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 5: Chapters 22, 24, 25 (Beverages, Tobacco, Salt)
-- ============================================================================

-- Chapter 22: Beverages, Spirits and Vinegar
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 2201: Waters, including mineral/aerated, not sweetened
  ('2201.10.10', '22', '2201', 'Mineral water, not sweetened', 'Mineral Water', 'Food & Beverage', 0, 0, 0),
  ('2201.10.90', '22', '2201', 'Other waters, not sweetened (plain water)', 'Plain Water', 'Food & Beverage', 0, 0, 0),

  -- 2202: Waters, including mineral/aerated, sweetened
  ('2202.10.00', '22', '2202', 'Waters, sweetened or flavoured (soft drinks, soda)', 'Soft Drinks/Soda', 'Food & Beverage', 10, 10, 0),
  ('2202.91.00', '22', '2202', 'Other non-alcoholic beverages (fruit drink, juice drink)', 'Fruit/Juice Drinks', 'Food & Beverage', 10, 10, 0),
  ('2202.99.00', '22', '2202', 'Other non-alcoholic beverages (energy drinks, sports drinks)', 'Energy/Sports Drinks', 'Food & Beverage', 10, 10, 0),

  -- 2203: Beer made from malt
  ('2203.00.10', '22', '2203', 'Beer, in cans/bottles', 'Beer (Canned/Bottled)', 'Food & Beverage', 10, 20, 0),
  ('2203.00.90', '22', '2203', 'Beer, other (draught beer)', 'Beer (Other)', 'Food & Beverage', 10, 20, 0),

  -- 2204: Wine of fresh grapes
  ('2204.10.00', '22', '2204', 'Sparkling wine', 'Sparkling Wine', 'Food & Beverage', 20, 30, 0),
  ('2204.21.00', '22', '2204', 'Wine in containers <= 2L', 'Wine (Bottled)', 'Food & Beverage', 20, 30, 0),
  ('2204.29.00', '22', '2204', 'Wine in containers > 2L', 'Wine (Bulk)', 'Food & Beverage', 20, 30, 0),
  ('2204.30.00', '22', '2204', 'Grape must, partly fermented', 'Grape Must', 'Food & Beverage', 20, 30, 0),

  -- 2205: Vermouth and other flavoured wines
  ('2205.10.00', '22', '2205', 'Vermouth and flavoured wine, in containers <= 2L', 'Vermouth', 'Food & Beverage', 20, 30, 0),
  ('2205.90.00', '22', '2205', 'Vermouth and flavoured wine, in containers > 2L', 'Vermouth (Bulk)', 'Food & Beverage', 20, 30, 0),

  -- 2206: Other fermented beverages (cider, perry, mead)
  ('2206.00.10', '22', '2206', 'Cider and perry', 'Cider/Perry', 'Food & Beverage', 20, 30, 0),
  ('2206.00.90', '22', '2206', 'Other fermented beverages', 'Other Fermented Drinks', 'Food & Beverage', 20, 30, 0),

  -- 2207: Undenatured ethyl alcohol >= 80%
  ('2207.10.00', '22', '2207', 'Undenatured ethyl alcohol >= 80% vol', 'Pure Alcohol', 'Food & Beverage', 20, 30, 0),
  ('2207.20.00', '22', '2207', 'Denatured ethyl alcohol >= 80% vol', 'Denatured Alcohol', 'Food & Beverage', 20, 30, 0),

  -- 2208: Undenatured ethyl alcohol < 80%; spirits, liqueurs
  ('2208.20.00', '22', '2208', 'Spirits obtained by distilling grape wine or grape marc (brandy, cognac)', 'Brandy/Cognac', 'Food & Beverage', 20, 50, 0),
  ('2208.30.00', '22', '2208', 'Whiskies', 'Whisky', 'Food & Beverage', 20, 50, 0),
  ('2208.40.00', '22', '2208', 'Rum and other spirits from sugar cane', 'Rum', 'Food & Beverage', 20, 50, 0),
  ('2208.50.00', '22', '2208', 'Gin and geneva', 'Gin', 'Food & Beverage', 20, 50, 0),
  ('2208.60.00', '22', '2208', 'Vodka', 'Vodka', 'Food & Beverage', 20, 50, 0),
  ('2208.70.00', '22', '2208', 'Liqueurs and cordials', 'Liqueurs', 'Food & Beverage', 20, 50, 0),
  ('2208.90.10', '22', '2208', 'Arrack', 'Arrack', 'Food & Beverage', 20, 50, 0),
  ('2208.90.90', '22', '2208', 'Other spirits and spirituous beverages', 'Other Spirits', 'Food & Beverage', 20, 50, 0),

  -- 2209: Vinegar and substitutes for vinegar
  ('2209.00.10', '22', '2209', 'Vinegar from wine', 'Wine Vinegar', 'Food & Beverage', 0, 0, 0),
  ('2209.00.90', '22', '2209', 'Other vinegar (apple cider vinegar, white vinegar)', 'Other Vinegar', 'Food & Beverage', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 24: Tobacco and Manufactured Tobacco Substitutes
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 2401: Unmanufactured tobacco; tobacco refuse
  ('2401.10.00', '24', '2401', 'Tobacco, not stemmed/stripped', 'Unstemmed Tobacco', 'Tobacco', 20, 30, 0),
  ('2401.20.00', '24', '2401', 'Tobacco, partly or wholly stemmed/stripped', 'Stemmed Tobacco', 'Tobacco', 20, 30, 0),
  ('2401.30.00', '24', '2401', 'Tobacco refuse', 'Tobacco Refuse', 'Tobacco', 20, 30, 0),

  -- 2402: Cigars, cheroots, cigarillos and cigarettes
  ('2402.10.00', '24', '2402', 'Cigars, cheroots and cigarillos, containing tobacco', 'Cigars/Cheroots', 'Tobacco', 30, 50, 0),
  ('2402.20.00', '24', '2402', 'Cigarettes, containing tobacco', 'Cigarettes', 'Tobacco', 30, 50, 0),
  ('2402.90.00', '24', '2402', 'Other cigarettes/cigars (herbal)', 'Herbal Cigarettes', 'Tobacco', 30, 50, 0),

  -- 2403: Other manufactured tobacco and substitutes; homogenised/reconstituted tobacco
  ('2403.11.00', '24', '2403', 'Smoking tobacco, whether or not containing tobacco substitutes', 'Smoking Tobacco', 'Tobacco', 20, 30, 0),
  ('2403.19.00', '24', '2403', 'Other manufactured tobacco (chewing tobacco, khaini)', 'Chewing Tobacco/Khaini', 'Tobacco', 20, 30, 0),
  ('2403.91.00', '24', '2403', 'Homogenised or reconstituted tobacco', 'Reconstituted Tobacco', 'Tobacco', 20, 30, 0),
  ('2403.99.10', '24', '2403', 'Pan masala containing tobacco', 'Pan Masala (with tobacco)', 'Tobacco', 30, 50, 0),
  ('2403.99.20', '24', '2403', 'Doma (betel quid with tobacco)', 'Doma', 'Tobacco', 30, 50, 0),
  ('2403.99.90', '24', '2403', 'Other manufactured tobacco substitutes', 'Other Tobacco Products', 'Tobacco', 20, 30, 0)

ON CONFLICT (code) DO NOTHING;

-- Chapter 25: Salt; Sulphur; Earths and Stone; Plastering Materials
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  -- 2501: Salt; pure sodium chloride; sea water
  ('2501.00.10', '25', '2501', 'Salt (for human consumption)', 'Table Salt', 'Agriculture', 0, 0, 0),
  ('2501.00.20', '25', '2501', 'Pure sodium chloride (industrial)', 'Industrial Salt', 'Agriculture', 0, 0, 0),
  ('2501.00.30', '25', '2501', 'Sea water', 'Sea Water', 'Agriculture', 0, 0, 0)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 6: Chapters 33-35 (Cosmetics, Soap, Glue)
-- ============================================================================

-- Chapter 33: Essential Oils, Cosmetics & Personal Care
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('3301.11.00', '33', '3301', 'Essential oil of sweet orange', 'Orange Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.12.00', '33', '3301', 'Essential oil of lemon', 'Lemon Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.13.00', '33', '3301', 'Essential oil of bergamot', 'Bergamot Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.19.10', '33', '3301', 'Essential oil of citronella', 'Citronella Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.19.20', '33', '3301', 'Essential oil of other citrus fruit', 'Other Citrus Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.21.00', '33', '3301', 'Essential oil of lavender (lavandin)', 'Lavender Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.22.00', '33', '3301', 'Essential oil of eucalyptus', 'Eucalyptus Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.24.00', '33', '3301', 'Essential oil of peppermint (mentha piperita)', 'Peppermint Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.25.00', '33', '3301', 'Essential oil of other mints (spearmint)', 'Mint Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.29.10', '33', '3301', 'Essential oil of sandalwood', 'Sandalwood Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.29.20', '33', '3301', 'Essential oil of jasmine', 'Jasmine Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.29.30', '33', '3301', 'Essential oil of rose', 'Rose Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.29.40', '33', '3301', 'Essential oil of tea tree', 'Tea Tree Essential Oil', 'Personal Care', 10, 10, 0),
  ('3301.29.90', '33', '3301', 'Other essential oils (neem, camphor, clove)', 'Other Essential Oils', 'Personal Care', 10, 10, 0),
  ('3301.30.00', '33', '3301', 'Resinoids', 'Resinoids', 'Personal Care', 10, 10, 0),
  ('3301.90.00', '33', '3301', 'Other odoriferous mixtures of a kind used in food/beverage', 'Other Odoriferous Mixtures', 'Personal Care', 10, 10, 0),
  ('3302.10.00', '33', '3302', 'Odoriferous mixtures of a kind used in the food/drink industry', 'Flavour Compounds', 'Personal Care', 10, 10, 0),
  ('3302.90.00', '33', '3302', 'Other odoriferous mixtures (not for food/drink)', 'Other Odoriferous Preps', 'Personal Care', 10, 10, 0),
  ('3303.00.10', '33', '3303', 'Perfumes (extracts, eau de parfum)', 'Perfumes', 'Personal Care', 20, 20, 0),
  ('3303.00.90', '33', '3303', 'Toilet waters (eau de toilette, cologne)', 'Toilet Waters/Cologne', 'Personal Care', 20, 20, 0),
  ('3304.10.00', '33', '3304', 'Lip make-up preparations (lipstick, lip gloss, lip liner)', 'Lipstick/Lip Gloss', 'Personal Care', 20, 20, 0),
  ('3304.20.00', '33', '3304', 'Eye make-up preparations (mascara, eyeliner, eyeshadow, kajal)', 'Eye Makeup', 'Personal Care', 20, 20, 0),
  ('3304.30.00', '33', '3304', 'Manicure or pedicure preparations (nail polish, nail remover)', 'Nail Polish/Manicure', 'Personal Care', 20, 20, 0),
  ('3304.91.00', '33', '3304', 'Face wash and face cleanser', 'Face Wash', 'Personal Care', 20, 20, 0),
  ('3304.92.00', '33', '3304', 'Face pack, face mask, face scrub', 'Face Pack/Mask', 'Personal Care', 20, 20, 0),
  ('3304.93.00', '33', '3304', 'Sun cream and sun protection preparations (sunscreen)', 'Sun Cream/Sunscreen', 'Personal Care', 20, 20, 0),
  ('3304.94.00', '33', '3304', 'Serum, moisturiser, anti-ageing preparations', 'Serum/Moisturiser', 'Personal Care', 20, 20, 0),
  ('3304.99.10', '33', '3304', 'Foundation, concealer, compact powder', 'Foundation/Compact', 'Personal Care', 20, 20, 0),
  ('3304.99.20', '33', '3304', 'Talcum powder for face/body (toilet purpose)', 'Toilet Talcum Powder', 'Personal Care', 20, 20, 0),
  ('3304.99.90', '33', '3304', 'Other beauty or makeup preparations (bb cream, primer)', 'Other Beauty Prep', 'Personal Care', 20, 20, 0),
  ('3305.10.00', '33', '3305', 'Shampoo', 'Shampoo', 'Personal Care', 20, 20, 0),
  ('3305.20.00', '33', '3305', 'Hair oil and hair tonic', 'Hair Oil/Tonic', 'Personal Care', 20, 20, 0),
  ('3305.30.00', '33', '3305', 'Hair colour and hair dye preparations', 'Hair Colour/Dye', 'Personal Care', 20, 20, 0),
  ('3305.41.00', '33', '3305', 'Hair conditioner', 'Hair Conditioner', 'Personal Care', 20, 20, 0),
  ('3305.42.00', '33', '3305', 'Hair lotion and hair cream', 'Hair Lotion/Cream', 'Personal Care', 20, 20, 0),
  ('3305.49.00', '33', '3305', 'Other hair care preparations (hair gel, hair spray)', 'Other Hair Care', 'Personal Care', 20, 20, 0),
  ('3305.90.00', '33', '3305', 'Other preparations for use on hair', 'Hair Prep Other', 'Personal Care', 20, 20, 0),
  ('3306.10.00', '33', '3306', 'Dentifrices (toothpaste, tooth powder)', 'Toothpaste', 'Personal Care', 20, 20, 0),
  ('3306.20.00', '33', '3306', 'Yarn used to clean between teeth (dental floss)', 'Dental Floss', 'Personal Care', 20, 20, 0),
  ('3306.30.00', '33', '3306', 'Toothbrush (manual and electric)', 'Toothbrush', 'Personal Care', 20, 20, 0),
  ('3306.40.00', '33', '3306', 'Denture fixative pastes/powders', 'Denture Fixative', 'Personal Care', 20, 20, 0),
  ('3306.90.00', '33', '3306', 'Other oral/dental hygiene preparations (mouthwash, gargle)', 'Mouthwash', 'Personal Care', 20, 20, 0),
  ('3307.10.00', '33', '3307', 'Pre-shave, shaving or after-shave preparations', 'Shaving Cream/Aftershave', 'Personal Care', 20, 20, 0),
  ('3307.20.00', '33', '3307', 'Personal deodorants and antiperspirants', 'Deodorant/Antiperspirant', 'Personal Care', 20, 20, 0),
  ('3307.30.00', '33', '3307', 'Perfumed bath salts and other bath preparations', 'Bath Salts/Prep', 'Personal Care', 20, 20, 0),
  ('3307.41.00', '33', '3307', 'Agarbatti (incense sticks) and other odoriferous preparations', 'Agarbatti/Incense', 'Personal Care', 10, 10, 0),
  ('3307.49.00', '33', '3307', 'Other odoriferous preparations (potpourri, room freshener)', 'Room Freshener', 'Personal Care', 10, 10, 0),
  ('3307.90.10', '33', '3307', 'Lip balm', 'Lip Balm', 'Personal Care', 20, 20, 0),
  ('3307.90.20', '33', '3307', 'Roll-on deodorant', 'Roll-On Deo', 'Personal Care', 20, 20, 0),
  ('3307.90.30', '33', '3307', 'Talcum powder (not toilet use, body talc)', 'Body Talcum Powder', 'Personal Care', 20, 20, 0),
  ('3307.90.90', '33', '3307', 'Other prepared perfumery, cosmetic or toilet preparations', 'Other Cosmetic Prep', 'Personal Care', 20, 20, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 34: Soap, Washing Preparations, Waxes, Candles
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('3401.11.10', '34', '3401', 'Toilet soap (bar)', 'Toilet Soap Bar', 'Household', 0, 0, 0),
  ('3401.11.90', '34', '3401', 'Other toilet soap (medicated, herbal)', 'Medicated/Herbal Soap', 'Household', 0, 0, 0),
  ('3401.19.10', '34', '3401', 'Bar soap (not toilet soap, laundry soap)', 'Laundry Soap Bar', 'Household', 10, 10, 0),
  ('3401.19.20', '34', '3401', 'Liquid soap', 'Liquid Soap', 'Household', 10, 10, 0),
  ('3401.19.90', '34', '3401', 'Other soap (soap flakes, soap powder)', 'Other Soap', 'Household', 10, 10, 0),
  ('3401.20.00', '34', '3401', 'Soap in forms or shapes for souvenir/decorative use', 'Decorative Soap', 'Household', 10, 10, 0),
  ('3401.30.00', '34', '3401', 'Organic surface-active products for toilet use (body wash)', 'Body Wash/Shower Gel', 'Household', 10, 10, 0),
  ('3402.11.00', '34', '3402', 'Detergents, retail packaged (surf, washing powder)', 'Detergent Powder (Surf)', 'Household', 10, 10, 0),
  ('3402.12.00', '34', '3402', 'Detergents, retail, for dish washing (dish soap, liquid wash)', 'Dish Soap/Liquid Wash', 'Household', 10, 10, 0),
  ('3402.19.00', '34', '3402', 'Other detergents (liquid detergent, detergent bar)', 'Other Detergent', 'Household', 10, 10, 0),
  ('3402.20.00', '34', '3402', 'Detergents, bulk/wholesale', 'Bulk Detergent', 'Household', 10, 10, 0),
  ('3402.41.00', '34', '3402', 'Surface-active preparations for floor cleaning (floor cleaner)', 'Floor Cleaner', 'Household', 10, 10, 0),
  ('3402.42.00', '34', '3402', 'Surface-active preparations for glass cleaning (glass cleaner)', 'Glass Cleaner', 'Household', 10, 10, 0),
  ('3402.49.00', '34', '3402', 'Other surface-active cleaning preparations (all-purpose cleaner)', 'All-Purpose Cleaner', 'Household', 10, 10, 0),
  ('3402.50.00', '34', '3402', 'Household or laundry-type bleaching preparations', 'Bleach', 'Household', 10, 10, 0),
  ('3402.90.00', '34', '3402', 'Other cleaning preparations (descaler, stain remover)', 'Other Cleaning Prep', 'Household', 10, 10, 0),
  ('3403.11.00', '34', '3403', 'Polishing creams for footwear and leather', 'Shoe Polish Cream', 'Household', 10, 10, 0),
  ('3403.19.00', '34', '3403', 'Other polishing creams', 'Other Polish Cream', 'Household', 10, 10, 0),
  ('3403.91.00', '34', '3403', 'Metal polish and metal cleaning paste', 'Metal Polish', 'Household', 10, 10, 0),
  ('3403.99.00', '34', '3403', 'Other polishing and metal cleaning preparations', 'Other Metal Polish', 'Household', 10, 10, 0),
  ('3404.20.00', '34', '3404', 'Artificial waxes (polyethylene wax)', 'Artificial Wax', 'Household', 10, 10, 0),
  ('3404.90.00', '34', '3404', 'Other prepared waxes', 'Other Prepared Wax', 'Household', 10, 10, 0),
  ('3405.10.00', '34', '3405', 'Polishes, creams for footwear and leather', 'Shoe Polish', 'Household', 10, 10, 0),
  ('3405.20.00', '34', '3405', 'Polishes, creams for wood furniture', 'Furniture Polish', 'Household', 10, 10, 0),
  ('3405.30.00', '34', '3405', 'Polishes for coachwork/floors (car polish, floor polish)', 'Car/Floor Polish', 'Household', 10, 10, 0),
  ('3405.40.00', '34', '3405', 'Scouring pastes and powders (vim, scouring powder)', 'Scouring Paste/Powder', 'Household', 10, 10, 0),
  ('3405.90.00', '34', '3405', 'Other polishes and creams', 'Other Polish/Cream', 'Household', 10, 10, 0),
  ('3406.00.10', '34', '3406', 'Candles, tapers (plain wax candles)', 'Wax Candles', 'Household', 10, 10, 0),
  ('3406.00.20', '34', '3406', 'Scented candles', 'Scented Candles', 'Household', 10, 10, 0),
  ('3406.00.30', '34', '3406', 'Decorative candles (floating, shaped)', 'Decorative Candles', 'Household', 10, 10, 0),
  ('3406.00.90', '34', '3406', 'Other candles and similar articles (votive, tealight)', 'Other Candles', 'Household', 10, 10, 0),
  ('3407.00.10', '34', '3407', 'Modelling pastes (play-doh, clay for children)', 'Modelling Paste', 'Household', 10, 10, 0),
  ('3407.00.20', '34', '3407', 'Dental wax and dental impression compounds', 'Dental Wax', 'Household', 10, 10, 0),
  ('3407.00.90', '34', '3407', 'Other modelling and dental preparations', 'Other Modelling Prep', 'Household', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 35: Albuminoidal Substances; Glues; Enzymes
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('3506.10.00', '35', '3506', 'Adhesives based on rubber or plastic (contact cement)', 'Contact Cement/Adhesive', 'Household', 10, 10, 0),
  ('3506.91.00', '35', '3506', 'Adhesives based on cellulose derivatives (fevicol, white glue)', 'Fevicol/White Glue', 'Household', 10, 10, 0),
  ('3506.92.00', '35', '3506', 'Glue sticks (solid adhesive for paper)', 'Glue Stick', 'Household', 10, 10, 0),
  ('3506.93.00', '35', '3506', 'Epoxy adhesives (two-part epoxy glue)', 'Epoxy Adhesive', 'Household', 10, 10, 0),
  ('3506.99.10', '35', '3506', 'Cyanoacrylate adhesives (superglue)', 'Superglue', 'Household', 10, 10, 0),
  ('3506.99.20', '35', '3506', 'Hot melt adhesives (glue gun sticks)', 'Hot Melt Glue', 'Household', 10, 10, 0),
  ('3506.99.90', '35', '3506', 'Other prepared glues and adhesives', 'Other Glue/Adhesive', 'Household', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 7: Chapters 39, 48 (Plastics, Paper)
-- ============================================================================

-- Chapter 39: Plastics and Articles Thereof
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('3924.10.00', '39', '3924', 'Plastic tableware and kitchenware - Plates, cups, tumblers', 'Plastic Plates/Cups', 'Household', 10, 10, 0),
  ('3924.90.10', '39', '3924', 'Plastic household articles - Storage containers, food boxes', 'Plastic Containers', 'Household', 10, 10, 0),
  ('3924.90.20', '39', '3924', 'Plastic household articles - Lunch boxes, tiffin carriers', 'Plastic Lunch Boxes', 'Household', 10, 10, 0),
  ('3924.90.30', '39', '3924', 'Plastic household articles - Water bottles, flasks', 'Plastic Water Bottles', 'Household', 10, 10, 0),
  ('3924.90.40', '39', '3924', 'Plastic household articles - Bowls, mugs, tumblers', 'Plastic Bowls/Mugs', 'Household', 10, 10, 0),
  ('3924.90.50', '39', '3924', 'Plastic household articles - Trays, cutting boards', 'Plastic Trays', 'Household', 10, 10, 0),
  ('3924.90.60', '39', '3924', 'Plastic household articles - Dustpans, buckets, basins', 'Plastic Buckets/Basins', 'Household', 10, 10, 0),
  ('3924.90.90', '39', '3924', 'Other plastic household articles', 'Other Plastic Household', 'Household', 10, 10, 0),
  ('3926.20.10', '39', '3926', 'Plastic articles - Garment bags, suit covers', 'Plastic Garment Bags', 'Household', 10, 10, 0),
  ('3926.20.90', '39', '3926', 'Other plastic articles for packing/conveying goods', 'Other Plastic Packing', 'Household', 10, 10, 0),
  ('3926.90.10', '39', '3926', 'Plastic bags, shopping bags, carry bags', 'Plastic Bags', 'Household', 10, 10, 0),
  ('3926.90.20', '39', '3926', 'Garbage bags, waste sacks of plastics', 'Garbage Bags', 'Household', 10, 10, 0),
  ('3926.90.30', '39', '3926', 'Cloth clips, clothes pegs of plastics', 'Cloth Clips', 'Household', 10, 10, 0),
  ('3926.90.40', '39', '3926', 'Zippers, slide fasteners of plastics', 'Plastic Zippers', 'Household', 10, 10, 0),
  ('3926.90.50', '39', '3926', 'Clothes hangers of plastics', 'Plastic Hangers', 'Household', 10, 10, 0),
  ('3926.90.60', '39', '3926', 'Drinking straws of plastics', 'Plastic Straws', 'Household', 10, 10, 0),
  ('3926.90.70', '39', '3926', 'Plastic twine, cordage, rope', 'Plastic Twine/Rope', 'Household', 10, 10, 0),
  ('3926.90.80', '39', '3926', 'Plastic stationery and office supplies (rulers, files)', 'Plastic Stationery', 'Stationery', 10, 5, 0),
  ('3926.90.90', '39', '3926', 'Other articles of plastics (gaskets, fittings, novelties)', 'Other Plastic Articles', 'Household', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 48: Paper and Paperboard; Articles of Paper
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('4818.10.00', '48', '4818', 'Toilet paper, in rolls or sheets', 'Toilet Paper', 'Household', 10, 5, 0),
  ('4818.20.00', '48', '4818', 'Handkerchiefs, facial tissues, of paper', 'Facial Tissues', 'Household', 10, 5, 0),
  ('4818.30.00', '48', '4818', 'Tablecloths, serviettes, napkins and sanitary pads of paper', 'Paper Napkins', 'Household', 10, 5, 0),
  ('4818.40.00', '48', '4818', 'Sanitary towels, tampons and similar sanitary articles of paper', 'Sanitary Pads', 'Household', 10, 5, 0),
  ('4818.50.00', '48', '4818', 'Paper towels, wiping cloths of paper pulp', 'Paper Towels', 'Household', 10, 5, 0),
  ('4818.90.00', '48', '4818', 'Other paper products for sanitary/household use (wet wipes)', 'Wet Wipes', 'Household', 10, 5, 0),
  ('4819.10.00', '48', '4819', 'Cartons, boxes and cases of corrugated paper/paperboard', 'Corrugated Cartons', 'Stationery', 10, 5, 0),
  ('4819.20.00', '48', '4819', 'Cartons, boxes and cases of non-corrugated paper/paperboard', 'Paper Boxes', 'Stationery', 10, 5, 0),
  ('4819.30.00', '48', '4819', 'Sacks and bags of paper having a base width >= 40cm', 'Paper Sacks (Large)', 'Stationery', 10, 5, 0),
  ('4819.40.00', '48', '4819', 'Sacks and bags of paper having a base width < 40cm (paper bags)', 'Paper Bags', 'Stationery', 10, 5, 0),
  ('4819.50.00', '48', '4819', 'Other packing containers of paper (gift bags, pouches)', 'Gift Bags/Paper Pouches', 'Stationery', 10, 5, 0),
  ('4819.60.00', '48', '4819', 'Trays, dishes, plates of moulded paper pulp', 'Moulded Paper Trays', 'Household', 10, 5, 0),
  ('4819.90.00', '48', '4819', 'Other packing containers of paper/paperboard', 'Other Paper Containers', 'Stationery', 10, 5, 0),
  ('4820.10.00', '48', '4820', 'Registers, account books, note books, diaries', 'Registers/Diaries', 'Stationery', 10, 5, 0),
  ('4820.20.00', '48', '4820', 'Exercise books, graph books', 'Exercise Books', 'Stationery', 10, 5, 0),
  ('4820.30.00', '48', '4820', 'Drawing books, scrapbooks', 'Drawing Books', 'Stationery', 10, 5, 0),
  ('4820.40.00', '48', '4820', 'Music manuscripts, notebooks with staff lines', 'Music Manuscripts', 'Stationery', 10, 5, 0),
  ('4820.50.00', '48', '4820', 'Albums for samples or collections', 'Sample Albums', 'Stationery', 10, 5, 0),
  ('4820.90.00', '48', '4820', 'Other paper stationery (memo pads, writing pads)', 'Memo/Writing Pads', 'Stationery', 10, 5, 0),
  ('4821.10.00', '48', '4821', 'Paper or paperboard labels, printed', 'Printed Paper Labels', 'Stationery', 10, 5, 0),
  ('4821.90.00', '48', '4821', 'Other paper or paperboard labels', 'Other Paper Labels', 'Stationery', 10, 5, 0),
  ('4822.10.00', '48', '4822', 'Bobbins, spools, cops of paper for textile winding', 'Paper Bobbins/Spools', 'Stationery', 10, 5, 0),
  ('4822.90.00', '48', '4822', 'Other bobbins, spools of paper pulp', 'Other Paper Spools', 'Stationery', 10, 5, 0),
  ('4823.10.00', '48', '4823', 'Envelopes of paper', 'Envelopes', 'Stationery', 10, 5, 0),
  ('4823.20.00', '48', '4823', 'Stickers, self-adhesive paper strips', 'Stickers/Labels', 'Stationery', 10, 5, 0),
  ('4823.50.00', '48', '4823', 'Book covers, file covers of paper', 'Book/File Covers', 'Stationery', 10, 5, 0),
  ('4823.60.00', '48', '4823', 'Paper plates, paper cups', 'Paper Plates/Cups', 'Household', 10, 5, 0),
  ('4823.70.10', '48', '4823', 'Filter paper and paperboard', 'Filter Paper', 'Stationery', 10, 5, 0),
  ('4823.70.20', '48', '4823', 'Carbon paper', 'Carbon Paper', 'Stationery', 10, 5, 0),
  ('4823.70.90', '48', '4823', 'Other paper for technical use (tracing papers, blotting paper)', 'Technical Paper', 'Stationery', 10, 5, 0),
  ('4823.90.10', '48', '4823', 'Paper trays, plates, cups for household use', 'Paper Household Trays', 'Household', 10, 5, 0),
  ('4823.90.90', '48', '4823', 'Other articles of paper/paperboard', 'Other Paper Articles', 'Stationery', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 8: Chapters 61, 63, 73, 82 (Textiles, Steel Articles, Tools/Cutlery)
-- ============================================================================

-- Chapter 61: Articles of Apparel, Knitted or Crocheted
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('6115.11.00', '61', '6115', 'Pantyhose and tights of synthetic fibres, knitted', 'Synthetic Tights', 'Textiles', 10, 5, 0),
  ('6115.12.00', '61', '6115', 'Pantyhose and tights of cotton, knitted', 'Cotton Tights', 'Textiles', 10, 5, 0),
  ('6115.19.00', '61', '6115', 'Pantyhose and tights of other textile materials, knitted', 'Other Tights', 'Textiles', 10, 5, 0),
  ('6115.20.00', '61', '6115', 'Women''s full-length stockings, knitted, measuring per pair <= 60cm', 'Women''s Stockings', 'Textiles', 10, 5, 0),
  ('6115.21.00', '61', '6115', 'Socks of cotton, knitted', 'Cotton Socks', 'Textiles', 10, 5, 0),
  ('6115.22.00', '61', '6115', 'Socks of wool or fine animal hair, knitted', 'Wool Socks', 'Textiles', 10, 5, 0),
  ('6115.23.00', '61', '6115', 'Socks of synthetic fibres, knitted', 'Synthetic Socks', 'Textiles', 10, 5, 0),
  ('6115.29.00', '61', '6115', 'Socks of other textile materials, knitted', 'Other Socks', 'Textiles', 10, 5, 0),
  ('6115.91.00', '61', '6115', 'Hosiery of cotton, knitted (undergarments, thermal pants)', 'Cotton Hosiery', 'Textiles', 10, 5, 0),
  ('6115.92.00', '61', '6115', 'Hosiery of wool or fine animal hair, knitted', 'Wool Hosiery', 'Textiles', 10, 5, 0),
  ('6115.93.00', '61', '6115', 'Hosiery of synthetic fibres, knitted (thermal pants)', 'Synthetic Hosiery', 'Textiles', 10, 5, 0),
  ('6115.99.00', '61', '6115', 'Hosiery of other textile materials, knitted', 'Other Hosiery', 'Textiles', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 63: Other Made Up Textile Articles
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('6302.21.00', '63', '6302', 'Bed linen, knitted or crocheted, of cotton (bed sheets)', 'Cotton Bed Sheets', 'Textiles', 10, 5, 0),
  ('6302.22.00', '63', '6302', 'Bed linen, knitted or crocheted, of synthetic fibres', 'Synthetic Bed Sheets', 'Textiles', 10, 5, 0),
  ('6302.29.00', '63', '6302', 'Bed linen, knitted or crocheted, of other textile materials', 'Other Bed Sheets', 'Textiles', 10, 5, 0),
  ('6302.31.00', '63', '6302', 'Bed linen, not knitted or crocheted, of cotton (bed sheet, pillow cover)', 'Cotton Bed Linen', 'Textiles', 10, 5, 0),
  ('6302.32.00', '63', '6302', 'Bed linen, not knitted, of synthetic fibres', 'Synthetic Bed Linen', 'Textiles', 10, 5, 0),
  ('6302.39.00', '63', '6302', 'Bed linen, not knitted, of other textile materials', 'Other Bed Linen', 'Textiles', 10, 5, 0),
  ('6302.40.00', '63', '6302', 'Table linen, knitted or crocheted (table cloth)', 'Knitted Table Cloth', 'Textiles', 10, 5, 0),
  ('6302.51.00', '63', '6302', 'Table linen, not knitted, of cotton (table cloth, napkin)', 'Cotton Table Linen', 'Textiles', 10, 5, 0),
  ('6302.53.00', '63', '6302', 'Table linen, not knitted, of synthetic fibres', 'Synthetic Table Linen', 'Textiles', 10, 5, 0),
  ('6302.59.00', '63', '6302', 'Table linen, not knitted, of other textile materials', 'Other Table Linen', 'Textiles', 10, 5, 0),
  ('6302.60.00', '63', '6302', 'Kitchen linen, of terry towelling (towel, kitchen towel)', 'Terry Towels', 'Textiles', 10, 5, 0),
  ('6302.91.00', '63', '6302', 'Kitchen linen, not knitted, of cotton (kitchen towel, napkin)', 'Cotton Kitchen Linen', 'Textiles', 10, 5, 0),
  ('6302.93.00', '63', '6302', 'Kitchen linen, not knitted, of synthetic fibres', 'Synthetic Kitchen Linen', 'Textiles', 10, 5, 0),
  ('6302.99.00', '63', '6302', 'Kitchen linen, not knitted, of other textile materials', 'Other Kitchen Linen', 'Textiles', 10, 5, 0),
  ('6304.11.00', '63', '6304', 'Curtains, knitted or crocheted (window curtain)', 'Knitted Curtains', 'Textiles', 10, 5, 0),
  ('6304.19.00', '63', '6304', 'Curtains, not knitted or crocheted (curtain, drape)', 'Curtains', 'Textiles', 10, 5, 0),
  ('6304.91.00', '63', '6304', 'Other furnishing articles, knitted or crocheted (cushion cover)', 'Knitted Cushion Covers', 'Textiles', 10, 5, 0),
  ('6304.92.00', '63', '6304', 'Other furnishing articles, not knitted, of cotton (cushion cover, pillow cover)', 'Cotton Furnishings', 'Textiles', 10, 5, 0),
  ('6304.93.00', '63', '6304', 'Other furnishing articles, not knitted, of synthetic fibres', 'Synthetic Furnishings', 'Textiles', 10, 5, 0),
  ('6304.99.00', '63', '6304', 'Other furnishing articles, not knitted, of other materials', 'Other Furnishings', 'Textiles', 10, 5, 0),
  ('6307.10.00', '63', '6307', 'Floor-cloths, dish-cloths, dusters and similar cleaning cloths', 'Cleaning Cloths', 'Textiles', 10, 5, 0),
  ('6307.20.00', '63', '6307', 'Life-jackets, life-belts and other life-saving garments', 'Life Jackets', 'Textiles', 10, 5, 0),
  ('6307.90.10', '63', '6307', 'Ropes, cords, twine of textile materials', 'Textile Rope/Twine', 'Textiles', 10, 5, 0),
  ('6307.90.20', '63', '6307', 'Flags, banners and similar textile articles', 'Flags/Banners', 'Textiles', 10, 5, 0),
  ('6307.90.30', '63', '6307', 'Sewing thread, put up for retail sale', 'Sewing Thread', 'Textiles', 10, 5, 0),
  ('6307.90.40', '63', '6307', 'Ironing board covers, toilet covers, textile covers', 'Textile Covers', 'Textiles', 10, 5, 0),
  ('6307.90.50', '63', '6307', 'Tablets, wads, gauze and similar articles for surgical use', 'Surgical Gauze', 'Textiles', 10, 5, 0),
  ('6307.90.90', '63', '6307', 'Other made-up textile articles (shoe laces, badges, etc.)', 'Other Textile Articles', 'Textiles', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 73: Articles of Iron or Steel
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('7310.10.00', '73', '7310', 'Steel tanks, casks, drums, cans, capacity >= 50L (steel container)', 'Steel Tanks/Drums', 'Household', 10, 10, 0),
  ('7310.21.00', '73', '7310', 'Steel cans, sealed by soldering or crimping, capacity < 50L (tin can)', 'Tin Cans', 'Household', 10, 10, 0),
  ('7310.29.00', '73', '7310', 'Steel cans, other, capacity < 50L (steel container, storage can)', 'Steel Cans', 'Household', 10, 10, 0),
  ('7310.30.00', '73', '7310', 'Steel casks, drums, cans, not sealed (open-top steel drum)', 'Open Steel Drums', 'Household', 10, 10, 0),
  ('7323.10.00', '73', '7323', 'Steel wool; pot scourers and scouring or polishing pads', 'Steel Wool/Scourers', 'Household', 10, 10, 0),
  ('7323.91.00', '73', '7323', 'Table, kitchen or household articles of iron/steel, enamelled (enamel plate, cup, bowl)', 'Enamel Kitchenware', 'Household', 10, 10, 0),
  ('7323.92.00', '73', '7323', 'Table, kitchen or household articles of iron/steel, not enamelled, stainless steel (steel spoon, plate, cup, bowl)', 'Stainless Steel Kitchenware', 'Household', 10, 10, 0),
  ('7323.93.00', '73', '7323', 'Table, kitchen or household articles of iron/steel, not enamelled, other steel (steel ladle, pressure cooker)', 'Steel Kitchen Utensils', 'Household', 10, 10, 0),
  ('7323.94.00', '73', '7323', 'Table, kitchen or household articles of iron/steel, not enamelled, tawa, karahi, frying pan', 'Steel Tawa/Karahi', 'Household', 10, 10, 0),
  ('7323.99.00', '73', '7323', 'Other table, kitchen or household articles of iron/steel (steel serving spoon, spatula)', 'Other Steel Kitchen Articles', 'Household', 10, 10, 0),
  ('7326.11.00', '73', '7326', 'Steel forged or stamped grinding balls and similar articles', 'Grinding Balls', 'Household', 10, 10, 0),
  ('7326.19.00', '73', '7326', 'Other articles of iron/steel, forged or stamped', 'Forged Steel Articles', 'Household', 10, 10, 0),
  ('7326.20.00', '73', '7326', 'Articles of iron/steel wire (steel wire, wire mesh, wire basket)', 'Steel Wire Articles', 'Household', 10, 10, 0),
  ('7326.90.10', '73', '7326', 'Nails, tacks, drawing pins, corrugated nails of iron/steel (nail)', 'Steel Nails', 'Household', 10, 10, 0),
  ('7326.90.20', '73', '7326', 'Bolts, screws, nuts, washers of iron/steel (bolt, nut)', 'Steel Bolts/Nuts', 'Household', 10, 10, 0),
  ('7326.90.30', '73', '7326', 'Chains and parts thereof, of iron/steel (chain)', 'Steel Chains', 'Household', 10, 10, 0),
  ('7326.90.40', '73', '7326', 'Locks, clasps, frames with clasps of iron/steel (lock)', 'Steel Locks', 'Household', 10, 10, 0),
  ('7326.90.50', '73', '7326', 'Hooks, eyes, eyes with hooks, pins of iron/steel (hook, safety pin)', 'Steel Hooks/Pins', 'Household', 10, 10, 0),
  ('7326.90.60', '73', '7326', 'Springs and leaves for springs, of iron/steel', 'Steel Springs', 'Household', 10, 10, 0),
  ('7326.90.90', '73', '7326', 'Other articles of iron or steel (brackets, handles, hinges)', 'Other Steel Articles', 'Household', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 82: Tools, Implements and Cutlery of Base Metal
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('8211.10.00', '82', '8211', 'Table knives, with cutting blades of base metal', 'Table Knives', 'Household', 10, 10, 0),
  ('8211.91.00', '82', '8211', 'Knives with cutting blades of base metal, kitchen knife, chopper', 'Kitchen Knives', 'Household', 10, 10, 0),
  ('8211.92.00', '82', '8211', 'Knives with cutting blades of base metal, cleaver, butcher knife', 'Cleavers', 'Household', 10, 10, 0),
  ('8211.93.00', '82', '8211', 'Scissors, tailors'' shears and similar shears of base metal', 'Scissors/Shears', 'Household', 10, 10, 0),
  ('8211.94.00', '82', '8211', 'Hair clippers and nail clippers with cutting blades of base metal', 'Hair/Nail Clippers', 'Household', 10, 10, 0),
  ('8211.99.00', '82', '8211', 'Other knives with cutting blades, blades and blanks of base metal', 'Other Knives/Blades', 'Household', 10, 10, 0),
  ('8212.10.00', '82', '8212', 'Razors, including safety razors, open steel razors (shaving razor)', 'Razors', 'Household', 10, 10, 0),
  ('8212.20.00', '82', '8212', 'Razor blades, including razor blade blanks (blade)', 'Razor Blades', 'Household', 10, 10, 0),
  ('8212.90.00', '82', '8212', 'Parts of razors, including safety razor guards (razor handle, razor cartridge)', 'Razor Parts', 'Household', 10, 10, 0),
  ('8214.10.00', '82', '8214', 'Paper knives, letter openers, erasing knives and similar articles', 'Paper Knives', 'Household', 10, 10, 0),
  ('8214.20.00', '82', '8214', 'Manicure or pedicure sets and instruments (nail clippers, tweezers, nail file, manicure set)', 'Manicure/Pedicure Sets', 'Household', 10, 10, 0),
  ('8214.90.00', '82', '8214', 'Other articles of cutlery (cuticle pusher, callus remover, cuticle nippers)', 'Other Cutlery Articles', 'Household', 10, 10, 0),
  ('8215.10.00', '82', '8215', 'Sets of assorted spoons, forks or ladles, of base metal (cutlery set)', 'Cutlery Sets', 'Household', 10, 10, 0),
  ('8215.20.00', '82', '8215', 'Spoons, forks, ladles, of base metal, plated with precious metal (table spoon, fork)', 'Plated Spoons/Forks', 'Household', 10, 10, 0),
  ('8215.91.00', '82', '8215', 'Spoons, forks, ladles, of base metal, not plated, of stainless steel (table spoon, soup ladle)', 'Stainless Steel Spoons', 'Household', 10, 10, 0),
  ('8215.92.00', '82', '8215', 'Spoons, forks, ladles, of base metal, not plated, of iron/steel (serving spoon)', 'Iron/Steel Spoons', 'Household', 10, 10, 0),
  ('8215.99.00', '82', '8215', 'Other spoons, forks, ladles of base metal (soup ladle, serving spoon, slotted spoon)', 'Other Spoons/Ladles', 'Household', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 9: Chapters 84-85 Supplement (Headings 8419, 8509, 8510)
-- ============================================================================

-- Chapter 84: Machinery — Heading 8419 (Water Heaters, Water Purifiers)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('8419.11.00', '84', '8419', 'Instantaneous gas water heaters', 'Gas Water Heaters', 'Electronics', 10, 5, 0),
  ('8419.19.10', '84', '8419', 'Electric instantaneous water heaters (geyser)', 'Electric Geyser', 'Electronics', 10, 5, 0),
  ('8419.19.20', '84', '8419', 'Electric storage water heaters', 'Storage Water Heater', 'Electronics', 10, 5, 0),
  ('8419.19.30', '84', '8419', 'Immersion heaters', 'Immersion Heater', 'Electronics', 10, 5, 0),
  ('8419.19.90', '84', '8419', 'Other electric water heaters', 'Other Water Heaters', 'Electronics', 10, 5, 0),
  ('8419.21.00', '84', '8419', 'Solar water heaters', 'Solar Water Heater', 'Electronics', 10, 5, 0),
  ('8419.31.00', '84', '8419', 'Instantaneous or storage water heaters, non-electric', 'Non-Electric Water Heaters', 'Electronics', 10, 5, 0),
  ('8419.40.10', '84', '8419', 'Water purifier / RO systems', 'Water Purifier/RO', 'Electronics', 10, 5, 0),
  ('8419.40.20', '84', '8419', 'Water softening / filtration apparatus', 'Water Filter/Softener', 'Electronics', 10, 5, 0),
  ('8419.50.10', '84', '8419', 'Heat exchange units for domestic use', 'Domestic Heat Exchanger', 'Electronics', 10, 5, 0),
  ('8419.89.10', '84', '8419', 'Other small household electrical machinery n.e.c.', 'Other Household Machinery', 'Electronics', 10, 5, 0),
  ('8419.90.10', '84', '8419', 'Parts of water heaters and purifiers', 'Water Heater Parts', 'Electronics', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 85: Electrical — Heading 8509 (Electro-Mechanical Domestic Appliances with Electric Motor)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('8509.40.10', '85', '8509', 'Food grinders, mixers and blenders (domestic)', 'Mixer/Grinder/Blender', 'Electronics', 10, 5, 0),
  ('8509.40.20', '85', '8509', 'Electric juicers (domestic)', 'Electric Juicer', 'Electronics', 10, 5, 0),
  ('8509.40.30', '85', '8509', 'Electric food processors (domestic)', 'Food Processor', 'Electronics', 10, 5, 0),
  ('8509.40.40', '85', '8509', 'Electric choppers and mincers (domestic)', 'Electric Chopper/Mincer', 'Electronics', 10, 5, 0),
  ('8509.60.00', '85', '8509', 'Electric vacuum cleaners (domestic)', 'Vacuum Cleaner', 'Electronics', 10, 5, 0),
  ('8509.80.10', '85', '8509', 'Other domestic electro-mechanical appliances with electric motor', 'Other Domestic Appliances', 'Electronics', 10, 5, 0),
  ('8509.90.00', '85', '8509', 'Parts of domestic electro-mechanical appliances', 'Domestic Appliance Parts', 'Electronics', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- Chapter 85: Electrical — Heading 8510 (Electric Shavers, Hair Clippers, Hair Removers)
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('8510.10.00', '85', '8510', 'Electric shavers (razors)', 'Electric Razor', 'Electronics', 10, 5, 0),
  ('8510.20.00', '85', '8510', 'Electric hair clippers', 'Hair Clipper', 'Electronics', 10, 5, 0),
  ('8510.30.00', '85', '8510', 'Electric hair removers and epilators', 'Hair Remover/Epilator', 'Electronics', 10, 5, 0),
  ('8510.90.10', '85', '8510', 'Electric trimmers (beard, nose, ear)', 'Electric Trimmer', 'Electronics', 10, 5, 0),
  ('8510.90.90', '85', '8510', 'Parts of electric shavers and hair clippers', 'Shaver/Clipper Parts', 'Electronics', 10, 5, 0)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- STAGE 10: Chapter 96 (Miscellaneous Manufactured Articles)
-- ============================================================================

-- Chapter 96: Miscellaneous Manufactured Articles
INSERT INTO hsn_master (code, chapter, heading, description, short_description, category, customs_duty, sales_tax, green_tax) VALUES
  ('9601.10.00', '96', '9601', 'Worked ivory and articles of ivory', 'Worked Ivory', 'Household', 10, 10, 0),
  ('9601.90.10', '96', '9601', 'Worked conch shell and articles of conch shell', 'Conch Shell Items', 'Household', 10, 10, 0),
  ('9601.90.20', '96', '9601', 'Worked coral and articles of coral', 'Coral Items', 'Household', 10, 10, 0),
  ('9601.90.30', '96', '9601', 'Worked bone and articles of bone', 'Worked Bone', 'Household', 10, 10, 0),
  ('9601.90.90', '96', '9601', 'Other worked animal carving material', 'Other Carved Material', 'Household', 10, 10, 0),
  ('9603.10.00', '96', '9603', 'Brooms and brushes consisting of twigs or other vegetable materials', 'Brooms', 'Household', 10, 10, 0),
  ('9603.21.00', '96', '9603', 'Toothbrushes, including dental-plate brushes', 'Toothbrush Wooden', 'Personal Care', 10, 10, 0),
  ('9603.29.00', '96', '9603', 'Other toothbrushes and dental brushes', 'Dental Brushes', 'Personal Care', 10, 10, 0),
  ('9603.30.00', '96', '9603', 'Artists brushes, writing brushes and similar brushes for applying cosmetics', 'Paint Brush', 'Household', 10, 10, 0),
  ('9603.40.00', '96', '9603', 'Paint brushes and other brushes for applying cosmetics', 'Cosmetic Brushes', 'Personal Care', 10, 10, 0),
  ('9603.50.00', '96', '9603', 'Other brushes used as parts of machines or vehicles', 'Industrial Brushes', 'Household', 10, 10, 0),
  ('9603.69.10', '96', '9603', 'Scrub brushes', 'Scrub Brush', 'Household', 10, 10, 0),
  ('9603.69.20', '96', '9603', 'Floor brushes', 'Floor Brush', 'Household', 10, 10, 0),
  ('9603.69.30', '96', '9603', 'Toilet brushes', 'Toilet Brush', 'Household', 10, 10, 0),
  ('9603.69.40', '96', '9603', 'Shaving brushes', 'Shaving Brush', 'Personal Care', 10, 10, 0),
  ('9603.69.90', '96', '9603', 'Other household brushes', 'Household Brushes', 'Household', 10, 10, 0),
  ('9603.70.00', '96', '9603', 'Mops and feather dusters', 'Mops and Dusters', 'Household', 10, 10, 0),
  ('9603.90.00', '96', '9603', 'Other brooms and brushes', 'Other Brooms/Brushes', 'Household', 10, 10, 0),
  ('9606.10.00', '96', '9606', 'Press-fasteners and parts thereof', 'Press-Fasteners', 'Household', 10, 10, 0),
  ('9606.21.00', '96', '9606', 'Buttons of plastics, not overcoated', 'Plastic Buttons', 'Household', 10, 10, 0),
  ('9606.22.00', '96', '9606', 'Buttons of base metal, not overcoated', 'Metal Buttons', 'Household', 10, 10, 0),
  ('9606.29.00', '96', '9606', 'Other buttons not overcoated', 'Other Buttons', 'Household', 10, 10, 0),
  ('9606.30.00', '96', '9606', 'Buttons overcoated with textile', 'Covered Buttons', 'Household', 10, 10, 0),
  ('9606.90.00', '96', '9606', 'Other button blanks and parts of buttons', 'Button Parts', 'Household', 10, 10, 0),
  ('9607.11.00', '96', '9607', 'Slide fasteners with chain scoops of base metal', 'Metal Zippers', 'Household', 10, 10, 0),
  ('9607.19.00', '96', '9607', 'Other slide fasteners', 'Other Zippers', 'Household', 10, 10, 0),
  ('9607.20.00', '96', '9607', 'Scoops for slide fasteners, of base metal', 'Zipper Scoops', 'Household', 10, 10, 0),
  ('9607.90.00', '96', '9607', 'Other parts of slide fasteners', 'Zipper Parts', 'Household', 10, 10, 0),
  ('9608.10.00', '96', '9608', 'Ball point pens', 'Ball Point Pens', 'Stationery', 10, 10, 0),
  ('9608.20.00', '96', '9608', 'Fountain pens and stylograph pens', 'Fountain Pens', 'Stationery', 10, 10, 0),
  ('9608.30.00', '96', '9608', 'Felt tipped and other porous-tipped pens and markers', 'Markers', 'Stationery', 10, 10, 0),
  ('9608.40.00', '96', '9608', 'Gel ink pens', 'Gel Pens', 'Stationery', 10, 10, 0),
  ('9608.50.00', '96', '9608', 'Propelling or sliding pencils', 'Mechanical Pencils', 'Stationery', 10, 10, 0),
  ('9608.60.00', '96', '9608', 'Pencil cases, pen cases and similar containers', 'Pencil Cases', 'Stationery', 10, 10, 0),
  ('9608.91.00', '96', '9608', 'Parts of ball point pens', 'Pen Parts', 'Stationery', 10, 10, 0),
  ('9608.99.00', '96', '9608', 'Other pen and pencil parts', 'Other Pen Parts', 'Stationery', 10, 10, 0),
  ('9609.10.00', '96', '9609', 'Pencils and crayons with colouring material', 'Colour Pencils', 'Stationery', 10, 10, 0),
  ('9609.20.00', '96', '9609', 'Pencils with black leads', 'Graphite Pencils', 'Stationery', 10, 10, 0),
  ('9609.90.10', '96', '9609', 'Pastels and drawing charcoals', 'Pastels/Charcoals', 'Stationery', 10, 10, 0),
  ('9609.90.90', '96', '9609', 'Other pencils and drawing materials', 'Other Drawing Materials', 'Stationery', 10, 10, 0),
  ('9610.00.10', '96', '9610', 'Slates and boards with writing or drawing surfaces', 'Slates', 'Stationery', 10, 10, 0),
  ('9610.00.20', '96', '9610', 'Blackboards and whiteboards', 'Blackboards', 'Stationery', 10, 10, 0),
  ('9610.00.90', '96', '9610', 'Other writing or drawing boards', 'Other Writing Boards', 'Stationery', 10, 10, 0),
  ('9612.10.00', '96', '9612', 'Ribbons for typewriters or computer printers, inked', 'Printer Ribbons', 'Stationery', 10, 10, 0),
  ('9612.20.00', '96', '9612', 'Ink pads', 'Ink Pads', 'Stationery', 10, 10, 0),
  ('9613.10.00', '96', '9613', 'Pocket lighters, gas fuelled, non-refillable', 'Disposable Lighters', 'Household', 10, 10, 0),
  ('9613.20.00', '96', '9613', 'Pocket lighters, gas fuelled, refillable', 'Refillable Lighters', 'Household', 10, 10, 0),
  ('9613.80.00', '96', '9613', 'Other lighters', 'Other Lighters', 'Household', 10, 10, 0),
  ('9613.90.00', '96', '9613', 'Parts of lighters', 'Lighter Parts', 'Household', 10, 10, 0),
  ('9614.10.00', '96', '9614', 'Smoking pipes and pipe bowls', 'Smoking Pipes', 'Household', 10, 10, 0),
  ('9614.20.00', '96', '9614', 'Cigar holders and cigarette holders', 'Cigar Holders', 'Household', 10, 10, 0),
  ('9614.90.00', '96', '9614', 'Parts of smoking pipes and holders', 'Pipe Parts', 'Household', 10, 10, 0),
  ('9615.11.00', '96', '9615', 'Combs of hard rubber or plastics', 'Plastic Combs', 'Personal Care', 10, 10, 0),
  ('9615.19.00', '96', '9615', 'Other combs', 'Other Combs', 'Personal Care', 10, 10, 0),
  ('9615.90.10', '96', '9615', 'Hair pins and hair clips', 'Hair Clips', 'Personal Care', 10, 10, 0),
  ('9615.90.20', '96', '9615', 'Hair bands', 'Hair Bands', 'Personal Care', 10, 10, 0),
  ('9615.90.30', '96', '9615', 'Hair slides', 'Hair Slides', 'Personal Care', 10, 10, 0),
  ('9615.90.90', '96', '9615', 'Other hair accessories', 'Other Hair Accessories', 'Personal Care', 10, 10, 0),
  ('9616.10.00', '96', '9616', 'Spray dispensers and parts thereof', 'Spray Dispensers', 'Household', 10, 10, 0),
  ('9616.20.10', '96', '9616', 'Perfume atomisers', 'Perfume Atomisers', 'Household', 10, 10, 0),
  ('9616.20.20', '96', '9616', 'Spray bottles and pump dispensers', 'Spray Bottles', 'Household', 10, 10, 0),
  ('9616.20.90', '96', '9616', 'Other spray dispensing mechanisms', 'Other Spray Dispensers', 'Household', 10, 10, 0),
  ('9617.00.10', '96', '9617', 'Vacuum flasks and jugs, with outer casing of plastics', 'Thermos Flask (Plastic)', 'Household', 10, 10, 0),
  ('9617.00.20', '96', '9617', 'Vacuum flasks and jugs, with outer casing of metal', 'Thermos Flask (Metal)', 'Household', 10, 10, 0),
  ('9617.00.30', '96', '9617', 'Vacuum bottles and cups', 'Vacuum Bottles', 'Household', 10, 10, 0),
  ('9617.00.90', '96', '9617', 'Other vacuum insulated containers', 'Other Vacuum Containers', 'Household', 10, 10, 0),
  ('9618.00.10', '96', '9618', 'Tailors dummies and mannequins', 'Tailors Dummies', 'Household', 10, 10, 0),
  ('9618.00.20', '96', '9618', 'Display mannequins and automata', 'Display Mannequins', 'Household', 10, 10, 0),
  ('9618.00.90', '96', '9618', 'Other mannequins and display figures', 'Other Mannequins', 'Household', 10, 10, 0),
  ('9619.00.10', '96', '9619', 'Sanitary towels and tampons', 'Sanitary Towels', 'Personal Care', 10, 10, 0),
  ('9619.00.20', '96', '9619', 'Baby diapers and diaper covers', 'Baby Diapers', 'Personal Care', 10, 10, 0),
  ('9619.00.30', '96', '9619', 'Incontinence products', 'Incontinence Products', 'Personal Care', 10, 10, 0),
  ('9619.00.40', '96', '9619', 'Cleansing wipes for personal use', 'Personal Wipes', 'Personal Care', 10, 10, 0),
  ('9619.00.90', '96', '9619', 'Other sanitary and hygiene products', 'Other Sanitary Products', 'Personal Care', 10, 10, 0)
ON CONFLICT (code) DO NOTHING;
