-- 084_model_b_packages.sql
-- Model B (discrete / physical) package inventory for the vendor consoles.
--
-- Vendors (distributors, wholesalers) buy and sell sealed units at each level — a pallet, a
-- box, a piece are three distinct `products` rows, each carrying its own sealed on-hand count
-- in `current_stock`. "Opening" a package converts one sealed unit of the parent into its
-- direct components (one level: pallet -> boxes, box -> pieces).
--
-- IMPORTANT — what this migration deliberately does NOT touch:
--   * deduct_stock_on_confirm / guard_stock_on_confirm. These already deduct/guard the order
--     line's OWN product_id current_stock (they are not recursive and order_items never carry
--     package_id), so the live write path is already Model-B-shaped. Leaving them alone keeps
--     the retailer POS package-sale flow byte-for-byte unchanged.
--   * The retailer POS reads (/api/products/catalog, /pos/*, package_available_qty). Retailer
--     packages keep stocked_as_unit = false, so they keep the computed (Model-A) availability.
--
-- All Model-B isolation rides on the new `stocked_as_unit` flag (default false) plus app-layer
-- scoping. Only vendor-console-created packages flip the flag true.

BEGIN;

-- 1. Per-level stock seam + provenance ------------------------------------------------------
-- stocked_as_unit: when true, this package's availability is its own product current_stock
--   (Model B) instead of the floored-over-components package_available_qty (Model A).
-- source_package_id: links a buyer's mirror package back to the seller's definition so a
--   future receive-on-buy (P4) can dedupe auto-provisioned mirrors. Added now, unused in P0-P3.
ALTER TABLE "public"."product_packages"
  ADD COLUMN IF NOT EXISTS "stocked_as_unit" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."product_packages"
  ADD COLUMN IF NOT EXISTS "source_package_id" uuid REFERENCES "public"."product_packages"("id");

-- 2. Allow the OPEN movement type ----------------------------------------------------------
-- Opening a package writes one negative movement on the parent + one positive per direct
-- component. Both rows use OPEN so the audit trail is self-describing (and they net to zero
-- stock value), rather than overloading TRANSFER.
ALTER TABLE "public"."inventory_movements"
  DROP CONSTRAINT IF EXISTS "inventory_movements_movement_type_check";

ALTER TABLE "public"."inventory_movements"
  ADD CONSTRAINT "inventory_movements_movement_type_check"
  CHECK (("movement_type" = ANY (ARRAY[
    'SALE'::"text", 'RESTOCK'::"text", 'TRANSFER'::"text",
    'LOSS'::"text", 'DAMAGED'::"text", 'RETURN'::"text", 'OPEN'::"text"
  ])));

-- 3. open_package RPC ----------------------------------------------------------------------
-- Opens p_qty sealed units of a PACKAGE product into its direct components, one level deep.
-- SECURITY DEFINER so it can run regardless of RLS, but it self-guards on ownership: the
-- caller's entity (passed from the server, never the client) must own the package via
-- created_by. apply_inventory_movement (the inventory_movement_apply trigger) does the actual
-- current_stock math per inserted row; doing the guard + all inserts inside one function keeps
-- the decrement/increments atomic and the on-hand check race-free.
CREATE OR REPLACE FUNCTION "public"."open_package"(
  "p_package_product_id" uuid,
  "p_entity_id" uuid,
  "p_qty" integer
) RETURNS void
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_pkg_id    uuid;
  v_pkg_name  text;
  v_on_hand   integer;
  v_component RECORD;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'Open quantity must be at least 1';
  END IF;

  -- Resolve the package definition for this PACKAGE product, scoped to the caller's entity.
  SELECT pp.id, p.name, p.current_stock
    INTO v_pkg_id, v_pkg_name, v_on_hand
  FROM products p
  JOIN product_packages pp ON pp.product_id = p.id
  WHERE p.id = p_package_product_id
    AND p.created_by = p_entity_id
    AND p.product_type = 'PACKAGE'
  LIMIT 1;

  IF v_pkg_id IS NULL THEN
    RAISE EXCEPTION 'Package not found for this entity';
  END IF;

  IF v_on_hand < p_qty THEN
    RAISE EXCEPTION 'Not enough sealed stock: have %, need %', v_on_hand, p_qty;
  END IF;

  -- Consume the sealed parents.
  INSERT INTO inventory_movements
    (product_id, entity_id, movement_type, quantity, package_id, package_qty, notes)
  VALUES
    (p_package_product_id, p_entity_id, 'OPEN', -p_qty, v_pkg_id, p_qty,
     'Opened ' || v_pkg_name || ' x' || p_qty);

  -- Release the direct components (one level deep — no recursion).
  FOR v_component IN
    SELECT pi.product_id, pi.quantity, comp.name AS comp_name
    FROM package_items pi
    JOIN products comp ON comp.id = pi.product_id
    WHERE pi.package_id = v_pkg_id
  LOOP
    INSERT INTO inventory_movements
      (product_id, entity_id, movement_type, quantity, package_id, package_qty, notes)
    VALUES
      (v_component.product_id, p_entity_id, 'OPEN', v_component.quantity * p_qty,
       v_pkg_id, p_qty,
       'From opening ' || v_pkg_name || ' x' || p_qty || ' -> ' || v_component.comp_name
         || ' x' || (v_component.quantity * p_qty));
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."open_package"(uuid, uuid, integer) OWNER TO "postgres";

GRANT ALL ON FUNCTION "public"."open_package"(uuid, uuid, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."open_package"(uuid, uuid, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."open_package"(uuid, uuid, integer) TO "service_role";

-- 4. sellable_products: branch availability by stocked_as_unit ------------------------------
-- Model-B packages (stocked_as_unit) read their own current_stock; Model-A packages keep the
-- computed package_available_qty floor; SINGLE products keep the batch quantity. Column list /
-- order / types are unchanged so CREATE OR REPLACE VIEW is valid.
CREATE OR REPLACE VIEW "public"."sellable_products" AS
 SELECT "p"."id",
    "p"."name",
    "p"."sku",
    "p"."hsn_code",
    "p"."image_url",
    "p"."mrp",
    COALESCE("pb"."selling_price", "p"."selling_price", "p"."mrp") AS "selling_price",
    "p"."wholesale_price",
    "p"."unit",
    "p"."is_active",
    "p"."product_type",
    "p"."sold_as_package_only",
    "p"."reorder_point",
        CASE
            WHEN ("p"."product_type" = 'PACKAGE'::"text" AND "pp"."stocked_as_unit") THEN "p"."current_stock"
            WHEN ("p"."product_type" = 'PACKAGE'::"text") THEN "public"."package_available_qty"("pp"."id")
            ELSE "pb"."quantity"
        END AS "available_stock",
    "pp"."id" AS "package_def_id",
    "pp"."package_type",
    "pp"."barcode" AS "package_barcode",
    "pb"."id" AS "batch_id",
    "pb"."batch_number",
    "pb"."expires_at",
    "pb"."barcode" AS "batch_barcode",
    "pb"."entity_id"
   FROM (("public"."products" "p"
     JOIN "public"."product_batches" "pb" ON ((("pb"."product_id" = "p"."id") AND ("pb"."entity_id" = "public"."auth_entity_id"()) AND ("pb"."status" = 'ACTIVE'::"text") AND ("pb"."quantity" > 0))))
     LEFT JOIN "public"."product_packages" "pp" ON (("pp"."product_id" = "p"."id")))
  WHERE (("p"."is_active" = true) AND ("p"."sold_as_package_only" = false));

COMMIT;
