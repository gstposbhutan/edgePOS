# Feature: HSN Master & Category Integration

**Feature ID**: F-HSN-001
**Phase**: 2
**Status**: Code Complete
**Last Updated**: 2026-04-29

---

## Overview

Every product in Nexus Bhutan is anchored to a Harmonized System of Nomenclature (HSN) code drawn from the **Bhutan Trade Classification & Tariff Schedule 2022 (7th Edition)**, published by the Department of Revenue and Customs, Ministry of Finance, Royal Government of Bhutan.

Selecting an HSN code on a product automatically:
1. Assigns the product's **category** and **subcategory** (inherited from the HSN master)
2. Applies the correct **tax rates** (Customs Duty, Sales Tax, Green Tax)
3. Surfaces the set of **specification fields** applicable to that code (see F-SPEC-001)

This replaces all manual category dropdowns. The HSN code is the single source of truth for product classification.

---

## HSN Code Structure

Bhutan's BTC 2022 uses a hierarchical code structure:

```
Chapter  (2 digits): 30         → Pharmaceutical products
Heading  (4 digits): 3004       → Medicaments for therapeutic use
Sub-hd   (6 digits): 3004.10    → Containing penicillins or derivatives
Tariff   (8 digits): 3004.10.10 → In primary packs for retail sale
```

All four levels are stored in `hsn_master`. Properties can be defined at any level (chapter, heading, exact code, or regex pattern) and are merged at lookup time via the `get_hsn_properties()` database function.

---

## Database Schema

### `hsn_master` table

Master reference table seeded from the BTC 2022 PDF.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `code` | TEXT | Primary display code (e.g. `3004.10.10`) |
| `code_8digit` | TEXT | Optional 8-digit variant |
| `chapter` | TEXT | 2-digit chapter (`01`–`99`) |
| `heading` | TEXT | 4-digit heading |
| `subheading` | TEXT | 6-digit subheading |
| `tariff_item` | TEXT | 8-digit tariff item |
| `description` | TEXT | Full BTC description |
| `short_description` | TEXT | Short name for dropdowns |
| `category` | TEXT | Major category (Agriculture, Electronics, etc.) |
| `customs_duty` | DECIMAL(5,2) | CD rate % |
| `sales_tax` | DECIMAL(5,2) | ST rate % (typically 5% GST) |
| `green_tax` | DECIMAL(5,2) | GT rate % |
| `tax_type` | TEXT | `CD` / `ST` / `GT` / `CD+ST` / `CD+ST+GT` |
| `is_active` | BOOLEAN | |

### `products` / `entity_products` HSN link (Migration 034)

```sql
ALTER TABLE products       ADD COLUMN hsn_master_id UUID REFERENCES hsn_master(id);
ALTER TABLE entity_products ADD COLUMN hsn_master_id UUID REFERENCES hsn_master(id);
```

A DB trigger fires on `hsn_code` insert/update to automatically set `hsn_master_id` and copy `category` + `subcategory` from `hsn_master`.

### `category_properties` table (Migration 035)

Defines which specification fields apply to a given HSN scope.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `hsn_chapter` | TEXT | Chapter-level match |
| `hsn_heading` | TEXT | Heading-level match |
| `hsn_code` | TEXT | Exact code match |
| `applies_to_hsn_pattern` | TEXT | LIKE pattern (e.g. `3004.%`) |
| `name` | TEXT | Display name |
| `slug` | TEXT | URL-safe identifier |
| `data_type` | TEXT | `text_single` / `text_multi` / `number` / `unit` / `datetime` |
| `is_required` | BOOLEAN | |
| `validation_rules` | JSONB | Min/max, allowed values, date_only flag, etc. |
| `sort_order` | INT | Display order within a product form |

### `get_hsn_properties(p_hsn_code TEXT)` DB Function

Merges properties from all matching scopes in priority order: exact code → heading → chapter → pattern. Returns deduplicated rows ordered by `sort_order`.

```sql
SELECT * FROM get_hsn_properties('3004.10.10');
-- Returns: dosage_form, chemical_composition, storage_conditions, expiry_date, ...
```

---

## API Routes

### `GET /api/hsn`

Searches `hsn_master` with optional filters. Used by the `HsnCodeSelector` autocomplete.

| Param | Type | Notes |
|-------|------|-------|
| `q` | string | Searches `code`, `description`, `short_description`, `category` |
| `chapter` | string | Filter to a specific chapter |
| `category` | string | Filter to a major category |
| `limit` | int | Max results (default 50, cap 200) |

```json
// Response
{
  "hsn_codes": [{ "code": "3004.10.10", "category": "Pharmaceuticals", ... }],
  "count": 12
}
```

### `POST /api/hsn`

Fetches full details for one or more known codes. Used to populate the selector when editing an existing product.

```json
// Request
{ "codes": ["3004.10.10"] }

// Response
{ "hsn_codes": [{ "code": "3004.10.10", "customs_duty": 0, "sales_tax": 5, ... }] }
```

### `GET /api/admin/category-properties?hsn_code=3004.10.10`

Returns the merged property list for an HSN code by calling `get_hsn_properties()`. Also accepts `category_id` for legacy category-based lookup. Requires SUPER_ADMIN or DISTRIBUTOR role.

---

## Components

### `HsnCodeSelector` (`components/pos/products/hsn-code-selector.jsx`)

Autocomplete input for selecting an HSN code. On selection displays:
- **Category path** — chapter → heading → subheading labels
- **Inherited category** and subcategory from `hsn_master`
- **Tax summary** — `CD: X% + ST: 5% + GT: Y%` / `Tax Free`

Used in `EntityProductForm`. Debounces input at 300ms before hitting `/api/hsn`.

### `PropertyConfigModal` (`components/admin/categories/property-config-modal.jsx`)

Admin UI for SUPER_ADMIN / DISTRIBUTOR to create, edit, and delete properties on a category. Supports all five `data_type` variants with type-specific validation rule builders via `PropertyTypeConfigs`.

### Admin Categories Page (`app/admin/categories/page.jsx`)

Lists all categories with their HSN-linked property counts. Clicking a category opens `PropertyConfigModal`. Accessible to SUPER_ADMIN and DISTRIBUTOR roles only.

---

## Hooks

### `useHsnCodes(options?)` (`hooks/use-hsn-codes.js`)

| Method | Description |
|--------|-------------|
| `searchCodes(query)` | Debounced search against `/api/hsn` |
| `getCodeDetails(code)` | Fetch full HSN record for a single code |
| `getCategoryPath(code)` | Returns `{ chapter, heading, category, subcategory }` |
| `formatCode(code)` | Normalises to dotted format (`300410` → `3004.10.00`) |
| `getTaxSummary(code)` | Returns `{ display: "CD: 0% + ST: 5%", total: 5 }` |

Also exports `useHsnChapters()` for listing all 99 chapters with product counts.

### `useCategoryProperties(categoryId?, hsnCode?)` (`hooks/use-category-properties.js`)

Fetches, creates, updates, and deletes `category_properties` records. When `hsnCode` is provided, calls `get_hsn_properties()` via the API. When `categoryId` is provided, falls back to legacy category-based lookup.

---

## Tax Calculation Integration

The three tax components from `hsn_master` are used at different points:

| Tax | When Applied | Where |
|-----|-------------|-------|
| Customs Duty (CD) | Import reconciliation (F-BANK-001) | Admin Hub — future |
| Sales Tax (ST) | Every transaction — the 5% GST | POS checkout, cart GST line |
| Green Tax (GT) | Product display info only (currently) | Product detail modal |

The `sales_tax` column is the authoritative source for the per-product GST rate. Currently all products carry 5% (Bhutan flat rate), but the column allows future differentiation by commodity.

---

## Data Seeding

`hsn_master` is populated from the BTC 2022 PDF (manual extraction). The full dataset covers all 99 chapters with Bhutan-specific CD/ST/GT rates. The migration file `033_hsn_master.sql` seeds commonly used chapters; the complete import is handled separately via `scripts/`.

Sample properties are seeded in `035_category_properties_hsn_link.sql` for:
- Pharmaceuticals (chapter 30): `dosage_form`, `chemical_composition`, `storage_conditions`
- Electronics (chapters 84–85): `cooling_capacity`, `energy_rating`, `power_output`, `battery_capacity`
- Textiles (chapters 50–63): `material`, `thread_count`, `care_instructions`

---

## Scope Boundaries

- **HSN code is required** on all `entity_products`. The form validates before save.
- **Category is read-only** on the product form — it is always inherited from HSN, never entered manually.
- **Tax rates are informational** at product level. Actual GST charged at checkout always uses the flat 5% (`sales_tax` value).
- **Property management** (creating/editing `category_properties`) is restricted to SUPER_ADMIN and DISTRIBUTOR roles. Retailers cannot define their own properties.
- **HSN master data** is read-only for all roles except SUPER_ADMIN. Retailers search and select; they do not edit.

---

## Implementation Checklist

- [x] Migration 033: `hsn_master` table with BTC 2022 seed data
- [x] Migration 034: `hsn_master_id` FK on products + entity_products, category sync trigger
- [x] Migration 035: `category_properties` HSN columns, `get_hsn_properties()` function, sample seeds
- [x] Migration 036: Fix HSN trigger to fire on `hsn_code` column (not `hsn_master_id`)
- [x] `GET /api/hsn` — search with query/chapter/category filters
- [x] `POST /api/hsn` — fetch full details by code array
- [x] `GET /api/admin/category-properties?hsn_code=` — property lookup by HSN
- [x] `HsnCodeSelector` component with autocomplete, category path, and tax summary
- [x] `useCategoryProperties` hook — CRUD for category properties
- [x] `useHsnCodes` hook — search, details, category path, tax summary
- [x] Admin categories page with property count display
- [x] `PropertyConfigModal` for admin property CRUD
- [ ] Complete BTC 2022 import (all 99 chapters via scripts/)
- [ ] HSN chapter browser UI in admin (filter by chapter, view all codes)
- [ ] Bulk property definition for a full chapter/heading
