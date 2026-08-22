# HSN-Based Product Specifications System

## Overview
Product categories and specifications are now automatically derived from HSN (Harmonized System of Nomenclature) codes. This creates a unified system where HSN codes drive both product categorization and applicable specifications.

## Architecture

### HSN Structure
- **Chapter** (2 digits): e.g., "30" = Pharmaceutical products
- **Heading** (4 digits): e.g., "3004" = Medicaments
- **Subheading** (6-8 digits): e.g., "3004.10" = Antibiotics

### Property Matching Levels
Properties are matched at three levels:
1. **Exact HSN Code**: `hsn_code = '3004.10.90'`
2. **Heading Level**: `hsn_heading = '3004'` (applies to all 3004.* codes)
3. **Chapter Level**: `hsn_chapter = '30'` (applies to all 30.*.* codes)
4. **Pattern Matching**: `applies_to_hsn_pattern = '3004.%'` (regex support)

## Database Schema

### category_properties Table
```sql
CREATE TABLE category_properties (
  id UUID PRIMARY KEY,
  hsn_chapter TEXT,              -- Chapter level (e.g., "30")
  hsn_heading TEXT,              -- Heading level (e.g., "3004")
  hsn_code TEXT,                 -- Exact code match
  applies_to_hsn_pattern TEXT,   -- Regex pattern
  name TEXT NOT NULL,            -- Display name
  slug TEXT NOT NULL,            -- URL-friendly identifier
  data_type TEXT NOT NULL,       -- text_single, text_multi, number, unit, datetime
  is_required BOOLEAN,
  validation_rules JSONB,
  sort_order INTEGER,
  UNIQUE(hsn_chapter, hsn_heading, slug)
);
```

### get_hsn_properties() Function
```sql
get_hsn_properties(p_hsn_code TEXT)
RETURNS TABLE (
  property_id UUID,
  property_name TEXT,
  slug TEXT,
  data_type TEXT,
  is_required BOOLEAN,
  validation_rules JSONB,
  sort_order INTEGER,
  applies_to_hsn_pattern TEXT
)
```

## API Endpoints

### Get Properties by HSN Code
```
GET /api/admin/category-properties?hsn_code=3004.10.90
```
Returns all applicable properties for the HSN code, matched by:
1. Exact code match
2. Heading match (first 4 digits)
3. Chapter match (first 2 digits)
4. Pattern match (regex)

### Get HSN Code Details
```
POST /api/hsn
Body: { codes: ["3004.10.90"] }
```
Returns HSN details including:
- Chapter, heading, subheading
- Category (inherited)
- Short description (inherited as subcategory)
- Tax rates (CD, ST, GT)

## Component Usage

### EntityProductForm
```jsx
<HsnCodeSelector
  value={formData.hsn_code}
  onChange={(code) => {
    setFormData({ ...formData, hsn_code: code })
    // Category automatically inherited from HSN
  }}
/>

<EntityProductSpecifications
  hsnCode={formData.hsn_code}  // Properties fetched based on HSN
  entityProductId={entityProduct?.id}
  values={specifications}
  onChange={setSpecifications}
/>
```

### HsnCodeSelector
Displays:
- HSN code search with autocomplete
- Inherited category and subcategory
- HSN hierarchy (Chapter → Heading → Subheading)
- Tax rate summary (CD + ST + GT)

## Example Properties

### Pharmaceuticals (Chapter 30)
- **3004** (Medicaments): dosage_form, chemical_composition, storage_conditions, expiry_date
- **3002** (Vaccines): storage_temperature, vaccine_type
- **3001** (Blood Products): blood_type, processing_method

### Electronics (Chapters 84-85)
- **8415** (Air Conditioning): cooling_capacity, energy_rating, ac_type
- **8414** (Fans): fan_size, air_flow, power_rating
- **8501** (Motors): power_output, speed, phase, efficiency_class
- **8506/8507** (Batteries): battery_capacity, battery_voltage, cell_type

## Tax Inheritance
Tax rates are automatically applied from HSN codes:
- **Customs Duty (CD)**: Applied at import
- **Sales Tax (ST)**: Bhutan GST (typically 5%)
- **Green Tax (GT)**: Environmental levy

Total Tax = CD + ST + GT

## Migration Notes

### Migration 034: HSN Inheritance
- Links products and entity_products to hsn_master table
- Adds triggers for automatic category sync
- Creates hsn_master_id foreign key

### Migration 035: HSN-Based Properties
- Links category_properties to HSN structure
- Creates get_hsn_properties() function
- Seeds sample properties for common HSN codes

## Testing

### Verify HSN Property Lookup
```sql
SELECT * FROM get_hsn_properties('3004.10.90');
```

### Check Inherited Categories
```sql
SELECT * FROM products_with_hsn WHERE hsn_code = '3004.10.90';
```

### View All Properties for HSN Code
```sql
SELECT * FROM hsn_code_properties WHERE code = '3004.10.90';
```

## Benefits

1. **Consistency**: Same products always get same categories and specifications
2. **Reduced Manual Entry**: Categories and properties auto-populate from HSN
3. **Tax Compliance**: Tax rates automatically applied based on HSN
4. **Flexible Matching**: Properties apply at chapter/heading/code levels
5. **International Standard**: HSN codes are globally recognized
