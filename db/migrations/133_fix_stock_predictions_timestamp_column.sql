-- 133_fix_stock_predictions_timestamp_column.sql
--
-- Pre-existing bug (NOT introduced by the category work — surfaced while verifying migration 132):
-- pos.calculate_stock_predictions filters inventory_movements on `im.timestamp`, but that table's
-- movement-time column is `created_at`. Every call errored at the 7-day sales-count query with
-- `column im.timestamp does not exist`, so reorder-point predictions never computed.
--
-- Fix: rename all `im.timestamp` references to `im.created_at`. Body is otherwise identical to the
-- version migration 132 installed (product_categories lead-time JOIN already removed). Idempotent.
BEGIN;

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
    SELECT COALESCE(SUM(im.quantity), 0), COUNT(DISTINCT DATE(im.created_at))
    INTO v_units_7d, v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.created_at >= v_calculated_at - INTERVAL '7 days';

    -- Count sales in previous 23 days (days 8-30)
    SELECT COALESCE(SUM(im.quantity), 0)
    INTO v_units_23d
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.created_at >= v_calculated_at - INTERVAL '30 days'
      AND im.created_at < v_calculated_at - INTERVAL '7 days';

    v_total_units := v_units_7d + v_units_23d;

    -- Exclude: insufficient data (< 7 unique days with sales in 30-day window)
    SELECT COUNT(DISTINCT DATE(im.created_at)) INTO v_days_with_sales
    FROM inventory_movements im
    WHERE im.product_id = v_record.product_id
      AND im.entity_id = p_entity_id
      AND im.movement_type = 'SALE'
      AND im.created_at >= v_calculated_at - INTERVAL '30 days';

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

COMMIT;
