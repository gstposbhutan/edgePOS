-- Migration 023: Stock Prediction Engine (F-PREDICT-001)
-- Tables for daily stock-out predictions and supplier lead times.
-- Includes a DB function to calculate predictions from inventory_movements.

-- ─── SUPPLIER LEAD TIMES ──────────────────────────────────────────────────

CREATE TABLE supplier_lead_times (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID REFERENCES products(id),
  category_id     UUID,
  supplier_id     UUID REFERENCES entities(id),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  lead_time_days  INT NOT NULL DEFAULT 7 CHECK (lead_time_days > 0),
  updated_by      UUID REFERENCES user_profiles(id),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,

  -- One lead time per (product, supplier) or (category, supplier)
  CONSTRAINT uq_slt_product_supplier UNIQUE (product_id, supplier_id),
  CONSTRAINT uq_slt_category_supplier UNIQUE (category_id, supplier_id)
);

CREATE INDEX idx_slt_product ON supplier_lead_times(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_slt_category ON supplier_lead_times(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_slt_entity ON supplier_lead_times(entity_id);

-- ─── STOCK PREDICTIONS ────────────────────────────────────────────────────

CREATE TABLE stock_predictions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  avg_daily_sales       DECIMAL(10,2) NOT NULL DEFAULT 0,
  weighted_ads          DECIMAL(10,2) NOT NULL DEFAULT 0,
  days_until_stockout   DECIMAL(10,2),
  suggested_reorder_qty DECIMAL(10,2),
  status                TEXT NOT NULL CHECK (status IN (
                            'HEALTHY', 'AT_RISK', 'CRITICAL',
                            'INSUFFICIENT_DATA', 'DEAD_STOCK', 'ERROR'
                          )),
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(product_id, entity_id, calculated_at)
);

CREATE INDEX idx_stock_pred_status ON stock_predictions(entity_id, status);
CREATE INDEX idx_stock_pred_days ON stock_predictions(entity_id, days_until_stockout);
CREATE INDEX idx_stock_pred_latest ON stock_predictions(entity_id, calculated_at DESC);

-- ─── PREDICTION CALCULATION FUNCTION ──────────────────────────────────────
-- Calculates stock-out predictions for all products of a given entity.
-- Uses weighted ADS (last 7 days weighted 3x vs previous 23 days).
-- Excludes products with < 7 days data or 0 sales.

CREATE OR REPLACE FUNCTION calculate_stock_predictions(p_entity_id UUID)
RETURNS void AS $$
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

    -- Get lead time (product-level > category-level > default 7)
    SELECT COALESCE(
      (SELECT slt.lead_time_days FROM supplier_lead_times slt
       WHERE slt.product_id = v_record.product_id AND slt.entity_id = p_entity_id
       ORDER BY slt.lead_time_days ASC LIMIT 1),
      (SELECT slt.lead_time_days FROM supplier_lead_times slt
       JOIN product_categories pc ON pc.category_id = slt.category_id
       WHERE pc.product_id = v_record.product_id AND slt.entity_id = p_entity_id
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
$$ LANGUAGE plpgsql;

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE stock_predictions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_lead_times  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_stock_predictions" ON stock_predictions
  FOR ALL USING (
    is_super_admin() OR
    entity_id = auth_entity_id()
  );

CREATE POLICY "tenant_supplier_lead_times" ON supplier_lead_times
  FOR ALL USING (
    is_super_admin() OR
    entity_id = auth_entity_id()
  );
