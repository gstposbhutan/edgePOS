-- 092_sellable_products_ai_fields.sql
-- Surface the AI/catalog metadata (category, condition, brand, tags, specifications, description,
-- video, barcode, subcategory) through the sellable_products view so the POS product-detail card can
-- show them. New columns are appended at the end (CREATE OR REPLACE VIEW requirement).
CREATE OR REPLACE VIEW sellable_products AS
 SELECT p.id, p.name, p.sku, p.hsn_code, p.image_url, p.mrp,
    COALESCE(pb.selling_price, p.selling_price, p.mrp) AS selling_price,
    p.wholesale_price, p.unit, p.is_active, p.product_type, p.sold_as_package_only, p.reorder_point,
        CASE
            WHEN p.product_type = 'PACKAGE'::text AND pp.stocked_as_unit THEN p.current_stock
            WHEN p.product_type = 'PACKAGE'::text THEN package_available_qty(pp.id)
            ELSE pb.quantity
        END AS available_stock,
    pp.id AS package_def_id, pp.package_type, pp.barcode AS package_barcode,
    pb.id AS batch_id, pb.batch_number, pb.expires_at, pb.barcode AS batch_barcode, pb.entity_id,
    -- appended: catalog + AI metadata
    p.barcode, p.category, p.subcategory, p.condition, p.description, p.brand,
    p.tags, p.specifications, p.video_url
   FROM products p
     JOIN product_batches pb ON pb.product_id = p.id AND pb.entity_id = auth_entity_id() AND pb.status = 'ACTIVE'::text AND pb.quantity > 0
     LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = true AND p.sold_as_package_only = false;
