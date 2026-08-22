# Feature: Product Specifications (HSN-Driven)

**Feature ID**: F-SPEC-001
**Phase**: 2
**Status**: Code Complete
**Last Updated**: 2026-04-29

---

## Overview

Each product can carry a set of dynamic specification fields whose definition is driven entirely by the product's HSN code (see F-HSN-001). A pharmaceutical gets `dosage_form` and `expiry_date`. An air conditioner gets `cooling_capacity` and `energy_rating`. A battery gets `battery_capacity` and `cell_type`. No field is hardcoded — all field definitions live in `category_properties` and are resolved at runtime by the `get_hsn_properties()` database function.

Specifications are stored in a JSON column on `entity_products.specifications` and are displayed in:
- The **product form** when adding/editing a vendor product (editable)
- The **product detail modal** in the POS and shop (read-only)
- The **product specifications display** component in product lists (compact/expanded)

---

## Data Model

### Storage

Specifications are stored as a flat JSONB object on `entity_products`:

```json
{
  "dosage_form": "Tablet",
  "chemical_composition": "Amoxicillin 500mg",
  "storage_conditions": "Below 25°C",
  "expiry_date": "2027-06-30"
}
```

Keys are the `slug` of the `category_property`. This allows straightforward lookup without joins for display.

For POS products (master `products` table), specifications are stored in a separate `product_specifications` table as property_id → value pairs, fetched via `GET /api/entity-products/[id]/specifications`.

### `entity_product_specifications` table (Migration 032)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `entity_product_id` | UUID FK | Vendor product |
| `property_id` | UUID FK | `category_properties.id` |
| `value` | JSONB | Typed value (string, number, `{value, unit}`, ISO datetime) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## Property Data Types

Five data types are supported. Each has a corresponding input widget and serialisation format.

| `data_type` | Input Widget | Stored As |
|-------------|-------------|-----------|
| `text_single` | Plain text input | `"Tablet"` |
| `text_multi` | Textarea | `"Amoxicillin 500mg, Excipients"` |
| `number` | Number input with optional validation | `250` |
| `unit` | Number input + unit selector | `{ "value": 1.5, "unit": "<unit-id>" }` |
| `datetime` | Date or datetime picker | `"2027-06-30"` (ISO 8601) |

`validation_rules` JSONB on the property definition drives input constraints:

```json
// number type
{ "min": 0, "max": 10000 }

// text_single type with allowed values
{ "allowed_values": ["Tablet", "Capsule", "Syrup", "Injection"] }

// datetime type, date only
{ "date_only": true }
```

---

## API Routes

### `GET /api/entity-products/[id]/specifications`

Returns all specification values for a vendor product, joined with property metadata.

```json
{
  "specifications": [
    {
      "id": "...",
      "property_id": "...",
      "property_name": "Dosage Form",
      "slug": "dosage_form",
      "data_type": "text_single",
      "value": "Tablet",
      "is_required": true,
      "sort_order": 1
    }
  ]
}
```

### `POST /api/admin/entity-products/[id]/specifications`

Upserts all specifications for a vendor product in a single call (replace strategy).

```json
// Request
{
  "specifications": {
    "<property_id>": "Tablet",
    "<property_id>": { "value": 500, "unit": "<unit-id>" }
  }
}
```

---

## Components

### `EntityProductSpecifications` (`components/pos/products/entity-product-specifications.jsx`)

Dynamic form rendering specifications for **editing**. Receives `hsnCode` (preferred) or `categoryId` (legacy), fetches applicable properties via `useCategoryProperties`, and renders appropriate input widgets per `data_type`.

Supports:
- `readonly` prop for view-only display (used in read-only product detail modals)
- Controlled mode via `values` + `onChange` props
- Falls back gracefully when no properties are defined for the HSN code

### `ProductSpecificationsDisplay` (`components/pos/products/product-specifications-display.jsx`)

Lightweight **read-only display** for use in product cards, admin lists, and POS. Three variants:

| Variant | Description |
|---------|-------------|
| `compact` | First 3 specs inline, `+N more` expand toggle |
| `expanded` | Full grid with property name / value pairs |

Also exports `StandardFieldsDisplay` for manufacturer name, brand, batch number, and expiry date — these are standard `entity_products` columns, not `category_properties`.

### `HsnCodeSelector` (see F-HSN-001)

Selecting an HSN code in the product form automatically triggers `EntityProductSpecifications` to reload its property list via the `hsnCode` prop.

---

## Hooks

### `useEntityProductSpecifications(entityProductId?)` (`hooks/use-entity-product-specifications.js`)

| Method | Description |
|--------|-------------|
| `fetchSpecifications(id?)` | Load specs for a vendor product |
| `saveSpecifications(id, specsData)` | Upsert all specs in one call |

### `useCategoryProperties(categoryId?, hsnCode?)` (see F-HSN-001)

Fetches the property definitions (not the values) for a given HSN scope. `EntityProductSpecifications` uses this to know what fields to render.

---

## Integration Points

### Product Form (`EntityProductForm`)

Specifications are the third section of the add/edit form, below pricing and inventory. The `HsnCodeSelector` value feeds directly into `EntityProductSpecifications` as `hsnCode`. On form submit, spec values are saved via `saveSpecifications`.

### Product Detail Modal — POS (`components/pos/product-detail-modal.jsx`)

Renders `EntityProductSpecifications` in `readonly` mode alongside price, stock, and batch info. Shown when a cashier clicks a product in the POS panel.

### Product Detail Modal — Shop (`components/shop/product-detail-modal.jsx`)

Renders specifications from the `product.specifications` JSONB column directly (not via the API hook, since customer-facing data comes from the public products query). Iterates `Object.entries(product.specifications)` for display.

### POS Product Panel (`components/pos/product-panel.jsx`)

`ProductSpecificationsDisplay` in `compact` variant shows first 3 specs on each product card in the grid.

---

## Admin Workflow: Defining Properties

1. SUPER_ADMIN or DISTRIBUTOR navigates to **Admin → Categories**
2. Clicks a category to open `PropertyConfigModal`
3. Adds a property: name, `data_type`, `is_required`, optional `validation_rules`
4. Property is stored in `category_properties` linked to an HSN chapter/heading/code
5. All products with a matching HSN code now show that field in their form and detail views

The linkage is HSN-first: properties defined at `hsn_chapter = '30'` appear on every product whose HSN code starts with `30`, regardless of what category label the product carries.

---

## Scope Boundaries

- **Specifications are per vendor product** (`entity_products`), not per master product (`products`). Two vendors stocking the same product can have different specification values (e.g. different batch numbers, different storage notes).
- **Property definitions are global** — set by SUPER_ADMIN / DISTRIBUTOR, not by individual retailers.
- **No nested or grouped properties**. All specs are flat key-value pairs. Complex structures (e.g. a list of ingredients) should use `text_multi`.
- **No file/image attachments** as specification values. Images are stored on the product record itself, not in specifications.
- **No specification versioning**. Saving replaces all values. History is not tracked (audit_logs captures the change at DB level).

---

## Implementation Checklist

- [x] Migration 032: `entity_product_specifications` table with RLS
- [x] Migration 034: HSN trigger syncing `category` to products on `hsn_code` change
- [x] Migration 035: `get_hsn_properties()` DB function, HSN columns on `category_properties`
- [x] `GET /api/entity-products/[id]/specifications`
- [x] `POST /api/admin/entity-products/[id]/specifications` (upsert)
- [x] `EntityProductSpecifications` component — all 5 data types with validation
- [x] `ProductSpecificationsDisplay` — compact + expanded variants
- [x] `StandardFieldsDisplay` — manufacturer / batch / expiry
- [x] `useEntityProductSpecifications` hook
- [x] `useCategoryProperties` hook (HSN + legacy category modes)
- [x] HSN → spec reload wired in `EntityProductForm`
- [x] Read-only specs in POS product detail modal
- [x] Specs display in shop product detail modal (from JSONB column)
- [ ] Spec search / filter in inventory list
- [ ] Required field validation at checkout (warn if critical specs missing)
