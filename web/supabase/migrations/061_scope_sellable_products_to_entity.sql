-- Migration 061: Scope sellable_products view to the authenticated entity
-- Problem: the view joined product_batches with pb.entity_id = p.created_by,
-- meaning a retailer who received products created by a wholesaler would get
-- NULL batch columns (no stock shown). It also meant any entity could see all
-- products regardless of whether they have stock.
-- Fix: join batches using auth_entity_id() so each entity only sees their own
-- batches. Products with no batches for the current entity are excluded (INNER JOIN).

DROP VIEW IF EXISTS sellable_products;

CREATE VIEW sellable_products AS
  SELECT
    p.id,
    p.name,
    p.sku,
    p.hsn_code,
    p.image_url,
    p.mrp,
    COALESCE(pb.selling_price, p.selling_price, p.mrp) AS selling_price,
    p.wholesale_price,
    p.unit,
    p.is_active,
    p.product_type,
    p.sold_as_package_only,
    p.reorder_point,
    CASE
      WHEN p.product_type = 'PACKAGE' THEN package_available_qty(pp.id)
      ELSE pb.quantity
    END AS available_stock,
    pp.id          AS package_def_id,
    pp.package_type,
    pp.barcode     AS package_barcode,
    pb.id          AS batch_id,
    pb.batch_number,
    pb.expires_at,
    pb.barcode     AS batch_barcode,
    pb.entity_id
  FROM products p
  JOIN product_batches pb        -- INNER JOIN: only products the entity has stock of
         ON pb.product_id = p.id
        AND pb.entity_id  = auth_entity_id()
        AND pb.status     = 'ACTIVE'
        AND pb.quantity   > 0
  LEFT JOIN product_packages pp
         ON pp.product_id = p.id
  WHERE p.is_active            = TRUE
    AND p.sold_as_package_only = FALSE;
