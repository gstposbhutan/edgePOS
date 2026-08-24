-- 139 — sellable_products exposes gst_exempt
--
-- Migration 115 added products.gst_exempt but did not recreate this view, so the column never
-- reached it. app/api/products/sellable selects gst_exempt, so that endpoint has been answering
-- `column sellable_products.gst_exempt does not exist` ever since — which is the product list
-- behind hooks/use-products.js and therefore the whole /pos/touch till.
--
-- Appending a column is the one shape CREATE OR REPLACE VIEW accepts; the rest of the definition
-- is reproduced unchanged from pg_get_viewdef.

CREATE OR REPLACE VIEW pos.sellable_products AS
 SELECT p.id,
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
            WHEN p.product_type = 'PACKAGE'::text AND pp.stocked_as_unit THEN p.current_stock
            WHEN p.product_type = 'PACKAGE'::text THEN pos.package_available_qty(pp.id)::numeric
            ELSE pb.quantity
        END AS available_stock,
    pp.id AS package_def_id,
    pp.package_type,
    pp.barcode AS package_barcode,
    pb.id AS batch_id,
    pb.batch_number,
    pb.expires_at,
    pb.barcode AS batch_barcode,
    pb.entity_id,
    p.barcode,
    p.category,
    p.subcategory,
    p.condition,
    p.description,
    p.brand,
    p.tags,
    p.specifications,
    p.video_url,
    p.sold_by_weight,
    p.gst_exempt
   FROM pos.products p
     JOIN pos.product_batches pb ON pb.product_id = p.id AND pb.entity_id = auth_entity_id() AND pb.status = 'ACTIVE'::text AND pb.quantity > 0::numeric
     LEFT JOIN pos.product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = true AND p.sold_as_package_only = false;
