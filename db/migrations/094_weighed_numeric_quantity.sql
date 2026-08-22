-- 094_weighed_numeric_quantity.sql
-- Weighed-goods parity: quantities/stock must hold fractional amounts (e.g. 1.5 kg). Convert the
-- integer quantity/stock columns to numeric, and surface sold_by_weight through sellable_products.
-- Three views depend on these columns, so drop + recreate them around the ALTERs.
BEGIN;

DROP VIEW IF EXISTS sellable_products;
DROP VIEW IF EXISTS products_with_hsn;
DROP VIEW IF EXISTS package_contents;
DROP TRIGGER IF EXISTS batch_auto_deplete ON product_batches;

ALTER TABLE cart_items          ALTER COLUMN quantity      TYPE numeric(14,3);
ALTER TABLE order_items         ALTER COLUMN quantity      TYPE numeric(14,3);
ALTER TABLE products            ALTER COLUMN current_stock TYPE numeric(14,3);
ALTER TABLE product_batches     ALTER COLUMN quantity      TYPE numeric(14,3);
ALTER TABLE inventory_movements ALTER COLUMN quantity      TYPE numeric(14,3);

CREATE TRIGGER batch_auto_deplete BEFORE UPDATE OF quantity ON public.product_batches FOR EACH ROW EXECUTE FUNCTION auto_deplete_batch();

CREATE VIEW package_contents AS
 SELECT pp.id AS package_id, pp.product_id AS package_product_id, pp.package_type,
    pi.product_id AS component_product_id, comp.name AS component_name, comp.image_url AS component_image,
    comp.unit AS component_unit, pi.quantity AS component_quantity, comp.current_stock AS component_stock,
    floor(comp.current_stock::double precision / pi.quantity::double precision) AS component_supports_qty
   FROM product_packages pp
     JOIN package_items pi ON pi.package_id = pp.id
     JOIN products comp ON comp.id = pi.product_id;

CREATE VIEW products_with_hsn AS
 SELECT p.id, p.name, p.sku, p.hsn_code, p.hsn_master_id, p.hsn_chapter, p.hsn_heading, p.hsn_subheading,
    p.category, p.subcategory, p.image_url, p.current_stock, p.wholesale_price, p.mrp, p.unit, p.is_active,
    p.created_by, p.created_at, p.updated_at, hsn.customs_duty, hsn.sales_tax, hsn.green_tax, hsn.tax_type,
    CASE WHEN p.category IS NOT NULL THEN p.category ELSE hsn.category END AS display_category,
    CASE WHEN p.subcategory IS NOT NULL THEN p.subcategory ELSE hsn.short_description END AS display_subcategory
   FROM products p LEFT JOIN hsn_master hsn ON p.hsn_master_id = hsn.id;

CREATE VIEW sellable_products AS
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
    p.barcode, p.category, p.subcategory, p.condition, p.description, p.brand,
    p.tags, p.specifications, p.video_url, p.sold_by_weight
   FROM products p
     JOIN product_batches pb ON pb.product_id = p.id AND pb.entity_id = auth_entity_id() AND pb.status = 'ACTIVE'::text AND pb.quantity > 0
     LEFT JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.is_active = true AND p.sold_as_package_only = false;

COMMIT;
