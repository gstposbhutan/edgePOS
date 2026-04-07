-- Migration 019: Recursive Package Stock Operations
-- Enables pallets (packages of packages) with full recursive stock deduction.
-- Selling a pallet walks the composition tree to leaf SINGLE products.
-- Circular reference protection: max depth = 5.

-- Add PALLET to package_type enum
ALTER TABLE product_packages
  DROP CONSTRAINT IF EXISTS product_packages_package_type_check;

ALTER TABLE product_packages
  ADD CONSTRAINT product_packages_package_type_check
  CHECK (package_type IN ('BULK', 'BUNDLE', 'MIXED', 'PALLET'));

-- ─── RECURSIVE: COLLECT LEAF PRODUCT DEDUCTIONS ───────────────────────────
-- Given a package_id and a multiplier (how many of this package),
-- returns a set of (product_id, total_qty) for all leaf SINGLE products.
-- Handles arbitrary nesting depth up to max_depth.

CREATE OR REPLACE FUNCTION resolve_package_to_leaves(
  p_package_id UUID,
  p_multiplier INT DEFAULT 1,
  p_depth      INT DEFAULT 0
)
RETURNS TABLE (product_id UUID, total_qty INT) AS $$
BEGIN
  -- Circular reference / depth guard
  IF p_depth > 5 THEN
    RAISE EXCEPTION 'Package nesting exceeds maximum depth (5). Check for circular references.';
  END IF;

  RETURN QUERY
  WITH components AS (
    SELECT pi.product_id, pi.quantity * p_multiplier AS qty
    FROM package_items pi
    WHERE pi.package_id = p_package_id
  )
  SELECT
    c.product_id,
    c.qty
  FROM components c
  JOIN products p ON p.id = c.product_id
  WHERE p.product_type = 'SINGLE'   -- leaf product

  UNION ALL

  -- Recurse into nested packages
  SELECT
    r.product_id,
    r.total_qty
  FROM components c
  JOIN products p ON p.id = c.product_id
  JOIN product_packages pp ON pp.product_id = c.product_id
  JOIN LATERAL resolve_package_to_leaves(pp.id, c.qty, p_depth + 1) r ON TRUE
  WHERE p.product_type = 'PACKAGE';
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── RECURSIVE: PACKAGE AVAILABILITY ──────────────────────────────────────
-- Returns how many complete packages can be assembled from current stock.
-- Works for pallets (packages of packages) as well as simple packages.

CREATE OR REPLACE FUNCTION package_available_qty(p_package_id UUID, p_depth INT DEFAULT 0)
RETURNS INT AS $$
DECLARE
  min_available INT := 2147483647;
  component     RECORD;
  child_avail   INT;
BEGIN
  IF p_depth > 5 THEN RETURN 0; END IF;

  FOR component IN
    SELECT pi.quantity AS needed, p.product_type, pp.id AS child_pkg_id, p.current_stock
    FROM package_items pi
    JOIN products p ON p.id = pi.product_id
    LEFT JOIN product_packages pp ON pp.product_id = p.id
    WHERE pi.package_id = p_package_id
  LOOP
    IF component.product_type = 'SINGLE' THEN
      -- Leaf product: floor(stock / qty_needed)
      child_avail := FLOOR(component.current_stock::FLOAT / component.needed);

    ELSIF component.product_type = 'PACKAGE' AND component.child_pkg_id IS NOT NULL THEN
      -- Nested package: recursive call, then floor by needed count
      child_avail := FLOOR(
        package_available_qty(component.child_pkg_id, p_depth + 1)::FLOAT
        / component.needed
      );

    ELSE
      child_avail := 0;
    END IF;

    IF child_avail < min_available THEN
      min_available := child_avail;
    END IF;
  END LOOP;

  IF min_available = 2147483647 THEN RETURN 0; END IF;
  RETURN GREATEST(0, min_available);
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── UPDATE: DEDUCT STOCK ON CONFIRM (fully recursive) ────────────────────

CREATE OR REPLACE FUNCTION deduct_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi   RECORD;
  leaf RECORD;
  pp   RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP

      IF oi.package_id IS NOT NULL THEN
        -- Resolve entire package tree to leaf products
        FOR leaf IN
          SELECT product_id, SUM(total_qty * oi.quantity) AS qty
          FROM resolve_package_to_leaves(oi.package_id, 1)
          GROUP BY product_id
        LOOP
          INSERT INTO inventory_movements
            (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
          VALUES (
            leaf.product_id, NEW.seller_id, 'SALE', -leaf.qty,
            NEW.id, oi.package_id, oi.quantity,
            'Package sale: ' || COALESCE(oi.package_name,'') || ' x' || oi.quantity || ' (' || NEW.order_no || ')'
          );
        END LOOP;

      ELSIF oi.product_id IS NOT NULL THEN
        INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
        VALUES (oi.product_id, NEW.seller_id, 'SALE', -oi.quantity, NEW.id,
          'Sale: ' || oi.name || ' x' || oi.quantity || ' (' || NEW.order_no || ')');
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: STOCK GUARD ON CONFIRM (recursive check) ─────────────────────

CREATE OR REPLACE FUNCTION guard_stock_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  oi        RECORD;
  leaf      RECORD;
  p         RECORD;
  needed    INT;
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
    FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP

      IF oi.package_id IS NOT NULL THEN
        -- Check every leaf product in the resolved tree
        FOR leaf IN
          SELECT product_id, SUM(total_qty * oi.quantity) AS qty
          FROM resolve_package_to_leaves(oi.package_id, 1)
          GROUP BY product_id
        LOOP
          SELECT current_stock, name INTO p FROM products WHERE id = leaf.product_id;
          IF p.current_stock < leaf.qty THEN
            RAISE EXCEPTION
              'Insufficient stock for package "%": "%" requires %, only % available.',
              COALESCE(oi.package_name, oi.package_id::TEXT), p.name, leaf.qty, p.current_stock
              USING ERRCODE = 'P0001';
          END IF;
        END LOOP;

      ELSIF oi.product_id IS NOT NULL THEN
        SELECT current_stock, name INTO p FROM products WHERE id = oi.product_id;
        IF p.current_stock < oi.quantity THEN
          RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available.',
            p.name, oi.quantity, p.current_stock USING ERRCODE = 'P0001';
        END IF;
      END IF;

    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: RESTORE STOCK ON CANCEL (recursive) ──────────────────────────

CREATE OR REPLACE FUNCTION restore_stock_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  oi   RECORD;
  leaf RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED' THEN
    IF OLD.status IN ('CONFIRMED','PROCESSING','DISPATCHED','DELIVERED',
                      'CANCELLATION_REQUESTED','REFUND_REQUESTED') THEN
      FOR oi IN SELECT * FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE' LOOP
        IF oi.package_id IS NOT NULL THEN
          FOR leaf IN
            SELECT product_id, SUM(total_qty * oi.quantity) AS qty
            FROM resolve_package_to_leaves(oi.package_id, 1)
            GROUP BY product_id
          LOOP
            INSERT INTO inventory_movements
              (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
            VALUES (leaf.product_id, NEW.seller_id, 'RETURN', leaf.qty, NEW.id, oi.package_id, oi.quantity,
              'Cancel: ' || COALESCE(oi.package_name,'') || ' (' || NEW.order_no || ')');
          END LOOP;
        ELSIF oi.product_id IS NOT NULL THEN
          INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
          VALUES (oi.product_id, NEW.seller_id, 'RETURN', oi.quantity, NEW.id,
            'Cancel: ' || oi.name || ' (' || NEW.order_no || ')');
        END IF;
      END LOOP;
      UPDATE order_items SET status = 'CANCELLED' WHERE order_id = NEW.id AND status = 'ACTIVE';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── UPDATE: RESTORE ON ITEM CANCEL/REFUND (recursive) ────────────────────

CREATE OR REPLACE FUNCTION restore_stock_on_item_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR leaf IN
        SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
          'Partial cancel: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Partial cancel: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION restore_stock_on_item_refund()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
  v_order_no  TEXT;
  leaf        RECORD;
BEGIN
  IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
    SELECT seller_id, order_no INTO v_seller_id, v_order_no FROM orders WHERE id = NEW.order_id;
    IF NEW.package_id IS NOT NULL THEN
      FOR leaf IN
        SELECT product_id, SUM(total_qty * NEW.quantity) AS qty
        FROM resolve_package_to_leaves(NEW.package_id, 1) GROUP BY product_id
      LOOP
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, package_id, package_qty, notes)
        VALUES (leaf.product_id, v_seller_id, 'RETURN', leaf.qty, NEW.order_id, NEW.package_id, NEW.quantity,
          'Refund: ' || COALESCE(NEW.package_name,'') || ' (' || v_order_no || ')');
      END LOOP;
    ELSIF NEW.product_id IS NOT NULL THEN
      INSERT INTO inventory_movements (product_id, entity_id, movement_type, quantity, reference_id, notes)
      VALUES (NEW.product_id, v_seller_id, 'RETURN', NEW.quantity, NEW.order_id,
        'Refund: ' || NEW.name || ' (' || v_order_no || ')');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── REFRESH: sellable_products VIEW (uses updated package_available_qty) ─

DROP VIEW IF EXISTS sellable_products;
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
      WHEN p.product_type = 'PACKAGE' THEN package_available_qty(pp.id)
      ELSE p.current_stock
    END AS available_stock,
    pp.id           AS package_def_id,
    pp.package_type,
    pp.barcode      AS package_barcode
  FROM products p
  LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = TRUE
    AND p.sold_as_package_only = FALSE;
