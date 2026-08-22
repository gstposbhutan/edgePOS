-- Migration 018: Packages as First-Class Products
-- Packages are now products (product_type = 'PACKAGE') — listed in marketplace and POS.
-- Component products can be hidden from direct sale with sold_as_package_only = TRUE.
-- Package availability is derived from component stock — no separate stock column.

-- ─── PRODUCTS: TYPE AND VISIBILITY FLAGS ──────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type
  TEXT NOT NULL DEFAULT 'SINGLE' CHECK (product_type IN ('SINGLE', 'PACKAGE'));

ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_as_package_only
  BOOLEAN NOT NULL DEFAULT FALSE;
-- When TRUE: hidden from POS grid, marketplace listing, direct cart add.
-- Stock still tracked normally. Still visible as component in package detail page.

-- ─── PRODUCT_PACKAGES: LINK TO PRODUCT LISTING ────────────────────────────

ALTER TABLE product_packages ADD COLUMN IF NOT EXISTS product_id
  UUID UNIQUE REFERENCES products(id) ON DELETE SET NULL;
-- product_id = the products row that represents this package in POS/marketplace.
-- A package without product_id is internal only (wholesaler B2B, not consumer-facing).

-- ─── COMPUTED FUNCTION: PACKAGE AVAILABILITY ──────────────────────────────
-- Returns how many complete packages can be assembled from current component stock.
-- Used by marketplace and POS to show availability without a separate stock column.

CREATE OR REPLACE FUNCTION package_available_qty(p_package_id UUID)
RETURNS INT AS $$
DECLARE
  min_available INT := 2147483647;  -- start at max int
  component     RECORD;
  component_available INT;
BEGIN
  FOR component IN
    SELECT pi.quantity AS needed, p.current_stock
    FROM package_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.package_id = p_package_id
  LOOP
    component_available := FLOOR(component.current_stock::FLOAT / component.needed);
    IF component_available < min_available THEN
      min_available := component_available;
    END IF;
  END LOOP;

  -- No components found → 0 available
  IF min_available = 2147483647 THEN RETURN 0; END IF;
  RETURN GREATEST(0, min_available);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── VIEW: PRODUCT CATALOGUE (unified products + packages) ────────────────
-- Used by POS grid and marketplace to list all sellable items in one query.
-- Filters out sold_as_package_only single products.
-- Shows computed availability for package products.

CREATE OR REPLACE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN
        package_available_qty(pp.id)
      ELSE
        p.current_stock
    END AS available_stock,
    pp.id          AS package_def_id,
    pp.package_type,
    pp.barcode     AS package_barcode
  FROM products p
  LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = TRUE
    AND p.sold_as_package_only = FALSE;

-- ─── PRODUCT DETAIL: PACKAGE CONTENTS VIEW ────────────────────────────────
-- Returns the full component breakdown for a package product.
-- Used by the product detail page and receipt.

CREATE OR REPLACE VIEW package_contents AS
  SELECT
    pp.id            AS package_id,
    pp.product_id    AS package_product_id,
    pp.package_type,
    pi.product_id    AS component_product_id,
    comp.name        AS component_name,
    comp.image_url   AS component_image,
    comp.unit        AS component_unit,
    pi.quantity      AS component_quantity,
    comp.current_stock AS component_stock,
    -- How many packages can this component support
    FLOOR(comp.current_stock::FLOAT / pi.quantity) AS component_supports_qty
  FROM product_packages pp
  JOIN package_items pi ON pi.package_id = pp.id
  JOIN products comp    ON comp.id = pi.product_id;

-- ─── MARKETPLACE: HIDE PACKAGE-ONLY PRODUCTS ──────────────────────────────
-- Update RLS on products to enforce sold_as_package_only visibility.
-- Authenticated users see all products for internal use (POS stock management).
-- Public marketplace queries should filter sold_as_package_only = FALSE at app layer.

-- No RLS change needed — filtering is handled via the sellable_products view.
-- The view is the contract for all POS and marketplace product queries.

-- ─── INDEX: FAST LOOKUP FOR PACKAGE PRODUCTS ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_type
  ON products(product_type) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_package_only
  ON products(sold_as_package_only) WHERE sold_as_package_only = TRUE;

CREATE INDEX IF NOT EXISTS idx_product_packages_product_id
  ON product_packages(product_id) WHERE product_id IS NOT NULL;
