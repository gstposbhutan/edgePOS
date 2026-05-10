# Feature: Product Packaging Variants

**Feature ID**: F-PKG-001  
**Phase**: 2 (Core POS) + 5 (Marketplace) — affects product registration, inventory, cart, orders, marketplace  
**Status**: Scoped  
**Last Updated**: 2026-04-07

---

## Overview

Products in the Bhutan supply chain move at different granularities depending on who is buying:

- **Distributor → Wholesaler**: Pallets / Cases (bulk)
- **Wholesaler → Retailer**: Cartons / Packs (intermediate bulk)
- **Retailer → Consumer**: Singles / Pieces (base unit)

A package can contain **one or more different products in different quantities** and is itself **a first-class product** — it appears in the POS grid, marketplace, and has its own product detail page showing its contents.

Component products can be marked **"sold as package only"** — they are hidden from the POS grid and marketplace search but their stock is still tracked normally.

Package types across the supply chain hierarchy:

| Level | Type | Example | Sold by |
|-------|------|---------|---------|
| Consumer | `SINGLE` product | 1× Wai Wai 75g | Retailer |
| Retailer buy | `BULK` package | Carton of 24× Wai Wai | Wholesaler |
| Retailer buy | `BUNDLE` package | Breakfast Bundle (Bread + Butter + Jam) | Wholesaler |
| Retailer buy | `MIXED` package | Mixed Case (12× Coke + 12× Sprite) | Wholesaler |
| Distributor | `PALLET` package | 10× Breakfast Bundle + 5× Wai Wai Carton | Distributor |

**Pallets are packages of packages** — components are other packages (not raw products), each with their own quantities. Since packages are products (`product_type = 'PACKAGE'`), `package_items` already supports this via `product_id` referencing a package product.

Stock deduction is **recursive** — selling a pallet walks the full composition tree down to leaf `SINGLE` products and deducts each one proportionally. Intermediate package products are never deducted directly.

---

## Examples

| Package | Contents | Price |
|---------|----------|-------|
| Wai Wai Single | 1× Wai Wai 75g | Nu. 10 |
| Wai Wai Carton | 24× Wai Wai 75g | Nu. 220 |
| Breakfast Bundle | 1× Bread + 2× Butter + 1× Jam | Nu. 185 |
| Mixed Drinks Case | 12× Coke 330ml + 12× Sprite 330ml | Nu. 480 |
| School Kit | 2× Notebook + 3× Pen + 1× Ruler | Nu. 95 |

---

## Data Model

### Products integration

A package IS a product. `products.product_type` distinguishes it:

```sql
-- products additions (migration 018)
ALTER TABLE products ADD COLUMN product_type       TEXT DEFAULT 'SINGLE'
                       CHECK (product_type IN ('SINGLE', 'PACKAGE'));
ALTER TABLE products ADD COLUMN sold_as_package_only BOOLEAN DEFAULT FALSE;
-- sold_as_package_only = TRUE → hidden from POS grid, marketplace, direct add
-- stock still tracked normally, still appears as component in package detail
```

`product_packages` gains a `product_id` FK linking the package definition to its product listing:
```sql
ALTER TABLE product_packages ADD COLUMN product_id UUID REFERENCES products(id);
-- The package product_id IS the product that appears in marketplace/POS
```

### Package availability (virtual stock)

A package has no independent stock. Its availability is derived:
```
available_packages = MIN OVER all components OF (component.current_stock / component_qty_in_package)

Breakfast Bundle (1 Bread + 2 Butter + 1 Jam):
  Bread  stock: 10 → can make 10 bundles
  Butter stock: 8  → can make 4 bundles
  Jam    stock: 12 → can make 12 bundles
  → Available: 4 bundles
```

This is computed at read time — no separate stock column on the package.

### `product_packages` table — Package header

```sql
CREATE TABLE product_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,           -- 'Single', 'Carton', 'Breakfast Bundle', etc.
  package_type    TEXT NOT NULL DEFAULT 'BULK'
                    CHECK (package_type IN (
                      'BULK',    -- same product, larger quantity (carton, case, pallet)
                      'BUNDLE',  -- multiple different products (combo, kit)
                      'MIXED'    -- multiple products with same category (mixed case)
                    )),
  barcode         TEXT UNIQUE,
  qr_code         TEXT,
  wholesale_price DECIMAL(12,2),           -- price for this package (B2B)
  mrp             DECIMAL(12,2),           -- retail price for this package
  hsn_code        TEXT,                    -- GST HSN for the package (may differ from components)
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID REFERENCES entities(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `package_items` table — Package composition

Defines what products (and how many) are inside a package. One row per product per package.

```sql
CREATE TABLE package_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id  UUID NOT NULL REFERENCES product_packages(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL DEFAULT 1,   -- how many of this product in the package
  UNIQUE (package_id, product_id)       -- same product can only appear once per package
);
```

### `entity_packages` — Which packages a store/wholesaler sells

```sql
CREATE TABLE entity_packages (
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  package_id  UUID NOT NULL REFERENCES product_packages(id) ON DELETE CASCADE,
  is_default  BOOLEAN DEFAULT FALSE,  -- show as default in POS for this entity
  sort_order  INT DEFAULT 0,
  PRIMARY KEY (entity_id, package_id)
);
```

### Changes to existing tables

**`cart_items`** — reference package instead of raw product:
```sql
-- package_id replaces the single product reference for packaged sales
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS package_id  UUID REFERENCES product_packages(id);
-- quantity = number of packages sold
-- product_id remains for single-product (non-packaged) sales
```

**`order_items`** — same:
```sql
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS package_id    UUID REFERENCES product_packages(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS package_name  TEXT;   -- snapshot
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS package_type  TEXT;   -- snapshot
```

**`inventory_movements`** — record package context:
```sql
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS package_id  UUID REFERENCES product_packages(id);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS package_qty INT;  -- qty in package units
-- quantity (existing) = sum of (pkg_item.quantity × package_qty) in base units per product
```

---

## Hierarchical Composition Example

```
PALLET "Distributor Mixed Pallet" (1× pallet sold)
  ├── 10× Breakfast Bundle
  │     ├── 1× Bread
  │     ├── 2× Butter
  │     └── 1× Jam
  └── 5× Wai Wai Carton
        └── 24× Wai Wai 75g

Stock deducted from leaf products:
  Bread:      10 × 1  =  10 units
  Butter:     10 × 2  =  20 units
  Jam:        10 × 1  =  10 units
  Wai Wai:     5 × 24 = 120 units
```

Circular reference protection: max recursion depth = 5. If a package references itself (directly or indirectly), the operation is blocked.

---

## Stock Deduction Logic

When a packaged order_item is confirmed, each constituent product in the package is deducted:

```
Order: 2× Breakfast Bundle (1 Bread + 2 Butter + 1 Jam)

Stock deductions:
  Bread  → -2  (1 per bundle × 2 bundles)
  Butter → -4  (2 per bundle × 2 bundles)
  Jam    → -2  (1 per bundle × 2 bundles)

DB trigger iterates package_items and inserts one inventory_movement per product.
```

For single-product BULK packages:
```
Order: 3× Wai Wai Carton (24 units each)
  Wai Wai → -72  (24 per carton × 3 cartons)
```

---

## GST on Packages

- **BULK packages**: GST calculated on the package MRP/wholesale price as a whole — same 5% flat rate
- **BUNDLE packages**: GST calculated on the total bundle price — not split per component
- Receipt shows the bundle price and GST, with component list as a sub-line breakdown

```
Breakfast Bundle × 2             Nu. 370.00
  ├─ Bread × 2
  ├─ Butter × 4
  └─ Jam × 2
  GST (5%)                        Nu. 17.62
  Total                           Nu. 387.62
```

---

## Stock Availability Check

Before confirming, check ALL constituent products have sufficient stock:

```
Order: 2× Breakfast Bundle
  Check: Bread.current_stock  ≥ 2  ✓
  Check: Butter.current_stock ≥ 4  ✗  (only 3 in stock)
  → BLOCK: "Insufficient stock for Breakfast Bundle: Butter requires 4, only 3 available"
```

---

## UI Behaviour

### POS Product Grid
- Packages appear as their own cards alongside individual products
- Package card shows: name, component summary ("1 Bread + 2 Butter + 1 Jam"), price
- Tapping adds the package to cart as one line item

### Cart Display
- Bundle line item shows package name + expandable component list
- Qty controls apply to the whole package (not individual components)
- Removing the package restores all constituent product stock

### Product & Package Management (`/pos/products`)
- Separate tab: **Packages**
- Create/edit package: name, type, price, barcode, add/remove products with quantities
- Associate packages with entity (which stores sell this package)

### Inventory
- Stock table shows individual products only (packages don't have their own stock)
- Low-stock alert fires if ANY component of an active package is below its reorder point

---

## Implementation Checklist

### Schema (Migration 017 — replaces previous version)
- [ ] Create `product_packages` table (with `package_type`)
- [ ] Create `package_items` table
- [ ] Create `entity_packages` table
- [ ] Add `package_id` to `cart_items`, `order_items`, `inventory_movements`
- [ ] Update `deduct_stock_on_confirm` — iterate `package_items`, deduct per product
- [ ] Update `restore_stock_on_cancel/refund` — same iteration
- [ ] Update `guard_stock_on_confirm` — check all package component stocks

### Product Management
- [ ] Packages tab in `/pos/products`
- [ ] Package form: name, type, price, barcode, component list (add product + qty)
- [ ] `use-product-catalog.js` — package CRUD

### POS Cart
- [ ] Package cards in product grid
- [ ] `addPackage()` in `use-cart.js` — stores `package_id`, expands to component display
- [ ] Cart shows bundle line with collapsible component list
- [ ] GST calculated on package price

### Inventory
- [ ] Low-stock alert checks package component availability
