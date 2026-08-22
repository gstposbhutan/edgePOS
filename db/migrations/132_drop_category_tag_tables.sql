-- 132_drop_category_tag_tables.sql — Category consolidation Phase 3 (DESTRUCTIVE).
--
-- Drops the redundant category TAG system (pos.categories + pos.product_categories). Every
-- product already carries an HSN-derived category/subcategory, so the tag tables duplicated a
-- taxonomy the HSN tree already provides. Preconditions (all met 2026-08-13):
--   * Phase 2.5 code repoint deployed + baked (no live code reads/writes the tag tables).
--   * pg_dump taken (backups/phase3_tagtables_*.dump + full_*.dump).
--
-- NOTE: the tables live in the `pos` schema (migration 121 flip), not public. A live-DB audit
-- found MORE coupling than the original prep doc listed — all handled below:
--   * FK children of pos.categories: category_properties, entity_categories, product_categories,
--     retailer_wholesalers, distributor_wholesalers (the doc only knew of 2).
--   * Two dormant RLS policies (RLS is currently DISABLED on both tables) whose bodies JOIN
--     entity_categories + categories — a hard dependency that would otherwise block the DROP.
--   * pos.calculate_stock_predictions JOINs product_categories (late-bound; not caught by CASCADE).
--
-- Idempotent. Runs as one transaction — any surprise dependency raises and rolls the whole thing back.
BEGIN;

-- ── RLS policies referencing the doomed tables (dormant — RLS is off on both parents) ──────────
-- entities: rewrite to keep the distributor self-read, drop the dead entity_categories/categories
-- branch (entity_categories is empty, so that branch grants nothing today).
ALTER POLICY distributor_category_entities ON public.entities
  USING ((public.auth_role() = 'DISTRIBUTOR') AND (id = public.auth_entity_id()));

-- orders: no non-category semantics (seller_own_orders already covers a distributor's own-sold
-- orders); drop it.
DROP POLICY IF EXISTS distributor_category_orders ON pos.orders;

-- ── Unhook the FK children that STAY (keep their category_id columns; drop only the FK) ─────────
-- distributor_wholesalers / retailer_wholesalers: code still filters `.is('category_id', null)`,
-- so the columns stay (nullable uuid, no FK).
ALTER TABLE pos.distributor_wholesalers DROP CONSTRAINT IF EXISTS distributor_wholesalers_category_id_fkey;
ALTER TABLE pos.retailer_wholesalers    DROP CONSTRAINT IF EXISTS retailer_wholesalers_category_id_fkey;

-- category_properties: the entity-spec table STAYS (HSN-pattern-keyed; all category_id are NULL).
-- Keep the nullable column (Phase 2.5 left harmless category_id handling in the routes); drop only the FK.
ALTER TABLE pos.category_properties DROP CONSTRAINT IF EXISTS category_properties_category_id_fkey;

-- ── Patch pos.calculate_stock_predictions: drop the product_categories JOIN lead-time fallback ──
-- (Full current body, with only the middle COALESCE branch removed.)
CREATE OR REPLACE FUNCTION pos.calculate_stock_predictions(p_entity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pos', 'public'
AS $function$
DECLARE
  v_calculated_at TIMESTAMPTZ := NOW();
  v_record RECORD;
  v_units_7d  INT;
  v_units_23d INT;
  v_total_units INT;
  v_days_with_sales INT;
  v_ads DECIMAL(10,2);
  v_wads DECIMAL(10,2);
  v_stock INT;
  v_reorder_point INT;
  v_days_left DECIMAL(10,2);
  v_reorder_qty DECIMAL(10,2);
  v_lead_time INT;
  v_status TEXT;
BEGIN
  -- Get all active products for this entity
  FOR v_record IN
    SELECT
      p.id AS product_id,
      p.name,
      p.current_stock,
      COALESCE(p.reorder_point, 0) AS reorder_point
    FROM products p
    WHERE p.is_active = true
  LOOP
    v_stock := COALESCE(v_record.current_stock, 0);
    v_reorder_point := v_record.reorder_point;

    -- Error check: negative stock
    IF v_stock < 0 THEN
      INSERT INTO stock_predictions (product_id, entity_id, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 'ERROR', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Count sales in last 7 days
    SELECT COALESCE(SUM(im.quantity), 0), COUNT(DISTINCT DATE(im.timestamp))
    INTO v_units_7d, v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '7 days';

    -- Count sales in previous 23 days (days 8-30)
    SELECT COALESCE(SUM(im.quantity), 0)
    INTO v_units_23d
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '30 days'
      AND im.timestamp < v_calculated_at - INTERVAL '7 days';

    v_total_units := v_units_7d + v_units_23d;

    -- Exclude: insufficient data (< 7 unique days with sales in 30-day window)
    SELECT COUNT(DISTINCT DATE(im.timestamp)) INTO v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.timestamp >= v_calculated_at - INTERVAL '30 days';

    IF v_days_with_sales < 7 THEN
      INSERT INTO stock_predictions (product_id, entity_id, avg_daily_sales, weighted_ads, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 0, 0, 'INSUFFICIENT_DATA', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Exclude: dead stock (0 sales in 30 days)
    IF v_total_units = 0 THEN
      INSERT INTO stock_predictions (product_id, entity_id, avg_daily_sales, weighted_ads, status, calculated_at)
      VALUES (v_record.product_id, p_entity_id, 0, 0, 'DEAD_STOCK', v_calculated_at)
      ON CONFLICT (product_id, entity_id, calculated_at) DO NOTHING;
      CONTINUE;
    END IF;

    -- Calculate ADS (plain 30-day)
    v_ads := ROUND(v_total_units::DECIMAL / 30, 2);

    -- Calculate weighted ADS: (last 7d * 3 + prev 23d * 1) / 44
    v_wads := ROUND((v_units_7d * 3.0 + v_units_23d * 1.0) / 44.0, 2);

    -- Handle zero weighted ADS (shouldn't happen if total > 0, but safety)
    IF v_wads = 0 THEN v_wads := v_ads; END IF;

    -- Days until stockout
    IF v_stock = 0 THEN
      v_days_left := 0;
    ELSE
      v_days_left := ROUND(v_stock::DECIMAL / v_wads, 2);
    END IF;

    -- Get lead time (product-level > default 7). The category-level fallback that JOINed
    -- product_categories was removed with the tag tables (category consolidation Phase 3).
    SELECT COALESCE(
      (SELECT slt.lead_time_days FROM supplier_lead_times slt
       WHERE slt.product_id = v_record.product_id AND slt.entity_id = p_entity_id
       ORDER BY slt.lead_time_days ASC LIMIT 1),
      7
    ) INTO v_lead_time;

    -- Suggested reorder qty = wADS * lead_time * 1.5
    v_reorder_qty := ROUND(v_wads * v_lead_time * 1.5, 0);

    -- Determine status
    IF v_stock = 0 THEN
      v_status := 'CRITICAL';
    ELSIF v_days_left < 3 THEN
      v_status := 'CRITICAL';
    ELSIF v_reorder_point > 0 AND v_stock <= v_reorder_point THEN
      -- Use reorder_point as the AT_RISK threshold if set
      v_status := 'AT_RISK';
    ELSIF v_days_left < 7 THEN
      v_status := 'AT_RISK';
    ELSE
      v_status := 'HEALTHY';
    END IF;

    -- Upsert prediction
    INSERT INTO stock_predictions
      (product_id, entity_id, avg_daily_sales, weighted_ads,
       days_until_stockout, suggested_reorder_qty, status, calculated_at)
    VALUES
      (v_record.product_id, p_entity_id, v_ads, v_wads,
       v_days_left, v_reorder_qty, v_status, v_calculated_at)
    ON CONFLICT (product_id, entity_id, calculated_at) DO UPDATE SET
      avg_daily_sales = EXCLUDED.avg_daily_sales,
      weighted_ads = EXCLUDED.weighted_ads,
      days_until_stockout = EXCLUDED.days_until_stockout,
      suggested_reorder_qty = EXCLUDED.suggested_reorder_qty,
      status = EXCLUDED.status;

  END LOOP;
END;
$function$;

-- M: retire the backfill helper (references product_categories). This one is in public.
DROP FUNCTION IF EXISTS public.backfill_product_categories_from_hsn();

-- entity_categories: empty tag-system join table (entity↔category), now fully unreferenced
-- (no FK/function/policy/code points at it after the fixes above) — drop it.
DROP TABLE IF EXISTS pos.entity_categories;

-- ── The tag tables themselves (child first). No CASCADE: a surprise dependency should raise. ────
DROP TABLE IF EXISTS pos.product_categories;
DROP TABLE IF EXISTS pos.categories;

COMMIT;
-- After running: NOTIFY pgrst, 'reload schema';
