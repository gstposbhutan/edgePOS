


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';

-- Extensions required by the schema but omitted by `supabase db dump --schema public`:
-- pgvector (image_embedding / buyer_hash vector columns) and pg_trgm (trigram indexes).
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";



CREATE OR REPLACE FUNCTION "public"."apply_inventory_movement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE products
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."apply_inventory_movement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_synced_khata_txn"("p_account_id" "uuid", "p_external_id" "text", "p_type" "text", "p_amount" numeric, "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_txn_id  UUID;
  v_balance NUMERIC;
  v_actor   UUID := p_created_by;
BEGIN
  IF p_type NOT IN ('DEBIT', 'CREDIT') THEN
    RAISE EXCEPTION 'apply_synced_khata_txn: unsupported type %', p_type;
  END IF;

  -- created_by is NOT NULL (FK → user_profiles). A synced txn carries no cloud user,
  -- so when the caller supplies none, attribute it to the account's entity actor
  -- (prefer OWNER → ADMIN → MANAGER) — mirroring how the cloud confirm-trigger
  -- (khata_debit_on_confirm) attributes a khata txn to a user_profiles id.
  IF v_actor IS NULL THEN
    SELECT up.id INTO v_actor
    FROM user_profiles up
    JOIN khata_accounts ka ON ka.id = p_account_id
    WHERE up.entity_id = ka.creditor_entity_id
    ORDER BY CASE up.sub_role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 ELSE 3 END
    LIMIT 1;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'apply_synced_khata_txn: no user_profiles actor for the entity owning account %', p_account_id;
    END IF;
  END IF;

  -- Claim the external_id. If it already exists, this txn was already reconciled.
  INSERT INTO khata_transactions
    (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by, external_id)
  VALUES
    (p_account_id, p_order_id, p_type, p_amount, 0, p_notes, v_actor, p_external_id)
  ON CONFLICT (external_id) DO NOTHING
  RETURNING id INTO v_txn_id;

  IF v_txn_id IS NULL THEN
    RETURN 'duplicate';        -- balance already reflects it
  END IF;

  -- Newly claimed → move the balance with the SAME semantics as the cloud triggers.
  IF p_type = 'DEBIT' THEN
    UPDATE khata_accounts
    SET outstanding_balance = outstanding_balance + p_amount, updated_at = NOW()
    WHERE id = p_account_id RETURNING outstanding_balance INTO v_balance;
  ELSE
    UPDATE khata_accounts
    SET outstanding_balance = GREATEST(0, outstanding_balance - p_amount), updated_at = NOW()
    WHERE id = p_account_id RETURNING outstanding_balance INTO v_balance;
  END IF;

  UPDATE khata_transactions SET balance_after = v_balance WHERE id = v_txn_id;
  RETURN 'applied';
END;
$$;


ALTER FUNCTION "public"."apply_synced_khata_txn"("p_account_id" "uuid", "p_external_id" "text", "p_type" "text", "p_amount" numeric, "p_order_id" "uuid", "p_notes" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_order_item_discount"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF OLD.discount IS DISTINCT FROM NEW.discount
     OR OLD.discount_type IS DISTINCT FROM NEW.discount_type THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, actor_id, actor_role)
    VALUES (
      'order_items',
      NEW.id,
      'UPDATE',
      jsonb_build_object(
        'discount', OLD.discount,
        'discount_type', OLD.discount_type,
        'discount_value', OLD.discount_value
      ),
      jsonb_build_object(
        'discount', NEW.discount,
        'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value
      ),
      auth.uid(),
      (auth.jwt() ->> 'sub_role')
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."audit_order_item_discount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_entity_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'entity_id')::UUID;
$$;


ALTER FUNCTION "public"."auth_entity_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;


ALTER FUNCTION "public"."auth_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_sub_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'sub_role';
$$;


ALTER FUNCTION "public"."auth_sub_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_deplete_batch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.quantity <= 0 AND OLD.status = 'ACTIVE' THEN
    NEW.status := 'DEPLETED';
  END IF;
  -- Reactivate if stock is added back to a depleted batch (e.g. return/correction)
  IF NEW.quantity > 0 AND OLD.status = 'DEPLETED' THEN
    NEW.status := 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_deplete_batch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_product_categories_from_hsn"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Backfill products table
  UPDATE products p
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = p.hsn_code LIMIT 1),
    category = COALESCE(p.category, hsn.category),
    subcategory = COALESCE(p.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = p.hsn_code;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Backfill entity_products table
  UPDATE entity_products ep
  SET
    hsn_master_id = (SELECT id FROM hsn_master WHERE code = ep.hsn_code LIMIT 1),
    category = COALESCE(ep.category, hsn.category),
    subcategory = COALESCE(ep.subcategory, hsn.short_description),
    hsn_chapter = hsn.chapter,
    hsn_heading = hsn.heading,
    hsn_subheading = hsn.subheading
  FROM hsn_master hsn
  WHERE hsn.code = ep.hsn_code;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."backfill_product_categories_from_hsn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_stock_predictions"("p_entity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."calculate_stock_predictions"("p_entity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_cart_on_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND NEW.cart_id IS NOT NULL THEN
    UPDATE carts SET status = 'CONVERTED' WHERE id = NEW.cart_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."convert_cart_on_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    AS $$
DECLARE
  app_metadata  JSONB;
  profile RECORD;
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles
  WHERE id = (event->>'user_id')::UUID;

  IF profile IS NULL THEN
    RETURN event;
  END IF;

  app_metadata := event->'app_metadata';
  app_metadata := jsonb_set(app_metadata, '{entity_id}',  to_jsonb(profile.entity_id::TEXT));
  app_metadata := jsonb_set(app_metadata, '{role}',        to_jsonb(profile.role));
  app_metadata := jsonb_set(app_metadata, '{sub_role}',    to_jsonb(profile.sub_role));
  app_metadata := jsonb_set(app_metadata, '{permissions}', to_jsonb(profile.permissions));

  RETURN jsonb_set(event, '{app_metadata}', app_metadata);
END;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_stock_on_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    INSERT INTO inventory_movements
      (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
    SELECT
      oi.product_id,
      NEW.seller_id,
      'SALE',
      -(oi.quantity),
      NEW.id,
      oi.batch_id,
      'Auto-deducted on order confirmation: ' || NEW.order_no
    FROM order_items oi
    WHERE oi.order_id   = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status     = 'ACTIVE';

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_stock_on_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deduct_stock_on_sales_invoice"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item RECORD;
  v_old_status TEXT;
BEGIN
  -- On INSERT, treat OLD.status as NULL (always distinct from CONFIRMED)
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.order_type = 'SALES_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED' THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE'
    LOOP
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      VALUES (
        v_item.product_id,
        NEW.seller_id,
        'SALE',
        -(v_item.quantity),
        NEW.id,
        v_item.batch_id,
        'Auto-deducted from Sales Invoice: ' || NEW.order_no
      );
    END LOOP;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."deduct_stock_on_sales_invoice"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_face_profile"("p_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE face_profiles
  SET
    embedding  = NULL,
    name       = '[deleted]',
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$;


ALTER FUNCTION "public"."delete_face_profile"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_stale_batches"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE product_batches
  SET status = 'EXPIRED'
  WHERE expires_at < CURRENT_DATE
    AND status = 'ACTIVE'
    AND quantity > 0;
END;
$$;


ALTER FUNCTION "public"."expire_stale_batches"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzzy_match_product"("p_name" "text", "p_entity_id" "uuid", "p_threshold" numeric DEFAULT 0.7) RETURNS TABLE("id" "uuid", "name" "text", "mrp" numeric, "score" numeric)
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.mrp,
    similarity(p.name, p_name) AS score
  FROM products p
  WHERE p.entity_id = p_entity_id
    AND p.is_active = true
    AND similarity(p.name, p_name) >= p_threshold
  ORDER BY score DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."fuzzy_match_product"("p_name" "text", "p_entity_id" "uuid", "p_threshold" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hsn_category_tree"("p_hsn_code" "text") RETURNS TABLE("hsn_code" "text", "chapter" "text", "heading" "text", "subheading" "text", "category" "text", "short_description" "text", "customs_duty" numeric, "sales_tax" numeric, "green_tax" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    hsn.code,
    hsn.chapter,
    hsn.heading,
    hsn.subheading,
    hsn.category,
    hsn.short_description,
    hsn.customs_duty,
    hsn.sales_tax,
    hsn.green_tax
  FROM hsn_master hsn
  WHERE hsn.code = p_hsn_code;
END;
$$;


ALTER FUNCTION "public"."get_hsn_category_tree"("p_hsn_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_hsn_properties"("p_hsn_code" "text") RETURNS TABLE("property_id" "uuid", "property_name" "text", "slug" "text", "data_type" "text", "is_required" boolean, "validation_rules" "jsonb", "sort_order" integer, "applies_to_hsn_pattern" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.id,
    cp.name as property_name,
    cp.slug,
    cp.data_type,
    cp.is_required,
    cp.validation_rules,
    cp.sort_order,
    cp.applies_to_hsn_pattern
  FROM category_properties cp
  WHERE
    -- Match by exact HSN code
    (cp.hsn_code = p_hsn_code)
    OR
    -- Match by heading (e.g., all 3004.*)
    (cp.hsn_heading = SUBSTRING(p_hsn_code FROM 1 FOR 4) AND cp.hsn_heading IS NOT NULL)
    OR
    -- Match by chapter (e.g., all 30.*.*)
    (cp.hsn_chapter = SUBSTRING(p_hsn_code FROM 1 FOR 2) AND cp.hsn_chapter IS NOT NULL AND cp.hsn_heading IS NULL)
    OR
    -- Match by pattern (regex)
    (cp.applies_to_hsn_pattern IS NOT NULL AND p_hsn_code ~ cp.applies_to_hsn_pattern)
  ORDER BY cp.sort_order;
END;
$$;


ALTER FUNCTION "public"."get_hsn_properties"("p_hsn_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_stock_on_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  shortage  RECORD;
  v_old_status TEXT;
BEGIN
  v_old_status := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END;

  IF NEW.status = 'CONFIRMED'
     AND v_old_status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE', 'SALES_INVOICE') THEN

    -- Non-batch items: check product.current_stock
    SELECT oi.name, oi.quantity, p.current_stock
    INTO shortage
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id   = NEW.id
      AND oi.status     = 'ACTIVE'
      AND oi.product_id IS NOT NULL
      AND oi.batch_id   IS NULL
      AND p.current_stock < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient stock: "%" requires %, only % available',
        shortage.name, shortage.quantity, shortage.current_stock;
    END IF;

    -- Batch items: check product_batches.quantity
    SELECT oi.name, oi.quantity, pb.quantity AS batch_qty, pb.batch_number
    INTO shortage
    FROM order_items oi
    JOIN product_batches pb ON pb.id = oi.batch_id
    WHERE oi.order_id  = NEW.id
      AND oi.status    = 'ACTIVE'
      AND oi.batch_id  IS NOT NULL
      AND pb.quantity  < oi.quantity
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Insufficient batch stock: "%" batch "%" requires %, only % available',
        shortage.name, shortage.batch_number, shortage.quantity, shortage.batch_qty;
    END IF;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_stock_on_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT auth_role() = 'SUPER_ADMIN';
$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."khata_apply_repayment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
  v_limit       DECIMAL(12,2);
  v_profile_id  UUID;
BEGIN
  IF NEW.status = 'PAYMENT_MADE' AND OLD.status = 'CREATED' THEN

    UPDATE khata_accounts
    SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.amount),
        last_payment_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.khata_account_id
    RETURNING outstanding_balance, credit_limit INTO v_new_balance, v_limit;

    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.confirmed_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.confirmed_by; END IF;

    INSERT INTO khata_transactions
      (khata_account_id, transaction_type, amount, balance_after, payment_method, notes, created_by)
    VALUES
      (NEW.khata_account_id, 'CREDIT', NEW.amount, v_new_balance, NEW.payment_method,
       'Repayment via ' || NEW.payment_method || COALESCE(' ref: ' || NEW.reference_no, ''),
       v_profile_id);

    -- Auto-unfreeze if balance now below limit
    IF v_new_balance < v_limit THEN
      UPDATE khata_accounts SET status = 'ACTIVE', updated_at = NOW()
      WHERE id = NEW.khata_account_id AND status = 'FROZEN';
    END IF;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."khata_apply_repayment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."khata_credit_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_account_id   UUID;
  v_new_balance  DECIMAL(12,2);
  v_profile_id   UUID;
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.payment_method = 'CREDIT'
     AND OLD.status = 'CONFIRMED' THEN

    -- Find the DEBIT transaction for this order
  SELECT khata_account_id INTO v_account_id
    FROM khata_transactions
    WHERE order_id = NEW.id AND transaction_type = 'DEBIT'
    LIMIT 1;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Reduce balance
    UPDATE khata_accounts
    SET outstanding_balance = GREATEST(0, outstanding_balance - NEW.grand_total),
        updated_at = NOW()
    WHERE id = v_account_id
    RETURNING outstanding_balance INTO v_new_balance;

    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.created_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.created_by; END IF;

    INSERT INTO khata_transactions
      (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
    VALUES
      (v_account_id, NEW.id, 'CREDIT', NEW.grand_total, v_new_balance,
       'Reversal for cancelled order ' || NEW.order_no, v_profile_id);

    -- Mark any CREATED repayments for this order as irrelevant (delete them)
    DELETE FROM khata_repayments
    WHERE khata_account_id = v_account_id
      AND notes LIKE '%order ' || NEW.order_no || '%'
      AND status = 'CREATED';

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."khata_credit_on_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."khata_debit_on_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_account_id      UUID;
  v_new_balance     DECIMAL(12,2);
  v_term_days       INT;
  v_debtor_phone    TEXT;
  v_debtor_entity   UUID;
  v_party_type      TEXT;
  v_profile_id      UUID;
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT' THEN

    IF NEW.order_type = 'POS_SALE' THEN
      v_debtor_phone  := NEW.buyer_whatsapp;
      v_debtor_entity := NULL;
      v_party_type    := 'CONSUMER';
    ELSE
      v_debtor_phone  := NULL;
      v_debtor_entity := NEW.buyer_id;
      v_party_type    := 'RETAILER';
    END IF;

    -- Look up the khata account
    SELECT id, credit_term_days INTO v_account_id, v_term_days
    FROM khata_accounts
    WHERE creditor_entity_id = NEW.seller_id
      AND (debtor_entity_id = v_debtor_entity OR (v_debtor_entity IS NULL AND debtor_entity_id IS NULL))
      AND (debtor_phone = v_debtor_phone OR (v_debtor_phone IS NULL AND debtor_phone IS NULL))
      AND party_type = v_party_type
      AND status IN ('ACTIVE', 'FROZEN')
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active khata account found for credit sale';
    END IF;

    -- Check credit limit
    IF (SELECT outstanding_balance + NEW.grand_total > credit_limit
        FROM khata_accounts WHERE id = v_account_id) THEN
      RAISE EXCEPTION 'Credit limit exceeded for khata account %', v_account_id;
    END IF;

    -- Update balance
    UPDATE khata_accounts
    SET outstanding_balance = outstanding_balance + NEW.grand_total,
        updated_at = NOW()
    WHERE id = v_account_id
    RETURNING outstanding_balance INTO v_new_balance;

    -- Get created_by profile
    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.created_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.created_by; END IF;

    -- Log DEBIT transaction
    INSERT INTO khata_transactions
      (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
    VALUES
      (v_account_id, NEW.id, 'DEBIT', NEW.grand_total, v_new_balance,
       'Order ' || NEW.order_no, v_profile_id);

    -- Create repayment with due date
    IF v_term_days > 0 THEN
      INSERT INTO khata_repayments
        (khata_account_id, amount, payment_method, status, due_date, notes, created_by)
      VALUES
        (v_account_id, NEW.grand_total, 'CASH', 'CREATED',
         (NOW() + (v_term_days || ' days')::INTERVAL)::DATE,
         'Auto-created for order ' || NEW.order_no, v_profile_id);
    END IF;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."khata_debit_on_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log (order_id, from_status, to_status, metadata)
    VALUES (NEW.id, OLD.status, NEW.status, jsonb_build_object('updated_at', NOW()));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_product_price_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.mrp IS DISTINCT FROM NEW.mrp THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'MRP', OLD.mrp, NEW.mrp, auth.uid());
  END IF;
  IF OLD.wholesale_price IS DISTINCT FROM NEW.wholesale_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'WHOLESALE', OLD.wholesale_price, NEW.wholesale_price, auth.uid());
  END IF;
  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price THEN
    INSERT INTO product_price_history
      (product_id, entity_id, price_type, old_price, new_price, changed_by)
    VALUES (NEW.id, NEW.created_by, 'SELLING', OLD.selling_price, NEW.selling_price, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_product_price_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_pos_order_no"("p_seller_id" "uuid", "p_prefix" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_year   INT  := EXTRACT(YEAR FROM NOW())::INT;
  v_prefix TEXT := COALESCE(NULLIF(regexp_replace(UPPER(COALESCE(p_prefix, '')), '[^A-Z0-9]', '', 'g'), ''), 'POS');
  v_serial INT;
BEGIN
  INSERT INTO pos_order_counters (seller_id, year, last_serial)
  VALUES (p_seller_id, v_year, 1)
  ON CONFLICT (seller_id, year)
  DO UPDATE SET last_serial = pos_order_counters.last_serial + 1
  RETURNING last_serial INTO v_serial;

  RETURN LEFT(v_prefix, 4) || '-' || v_year::TEXT || '-' || LPAD(v_serial::TEXT, 5, '0');
END;
$$;


ALTER FUNCTION "public"."next_pos_order_no"("p_seller_id" "uuid", "p_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."package_available_qty"("p_package_id" "uuid", "p_depth" integer DEFAULT 0) RETURNS integer
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."package_available_qty"("p_package_id" "uuid", "p_depth" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_package_to_leaves"("p_package_id" "uuid", "p_multiplier" integer DEFAULT 1, "p_depth" integer DEFAULT 0) RETURNS TABLE("product_id" "uuid", "total_qty" integer)
    LANGUAGE "plpgsql" STABLE
    AS $$
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
$$;


ALTER FUNCTION "public"."resolve_package_to_leaves"("p_package_id" "uuid", "p_multiplier" integer, "p_depth" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_buyer_on_delivery"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status IN ('DELIVERED', 'COMPLETED')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.order_type = 'WHOLESALE'
     AND NEW.buyer_id IS NOT NULL THEN

    INSERT INTO inventory_movements (id, product_id, entity_id, movement_type, quantity, reference_id, timestamp)
    SELECT
      gen_random_uuid(),
      oi.product_id,
      NEW.buyer_id,
      'RESTOCK',
      oi.quantity,
      NEW.id,
      NOW()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restock_buyer_on_delivery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_on_invoice_confirm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item       RECORD;
  v_batch_id   UUID;
  v_batch_no   TEXT;
  v_mrp        DECIMAL(12,2);
  v_sell       DECIMAL(12,2);
BEGIN
  IF NEW.order_type = 'PURCHASE_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.buyer_id IS NOT NULL THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status = 'ACTIVE'
    LOOP
      -- Build batch number
      v_batch_no := COALESCE(
        NULLIF(TRIM(v_item.batch_number), ''),
        'PI-' || NEW.order_no || '-' || SUBSTRING(v_item.id::TEXT, 1, 8)
      );

      -- Get current product MRP and selling price as fallbacks
      SELECT mrp, COALESCE(selling_price, mrp)
        INTO v_mrp, v_sell
        FROM products WHERE id = v_item.product_id;

      -- Create batch
      INSERT INTO product_batches (
        product_id, entity_id, batch_number, barcode,
        manufactured_at, expires_at,
        quantity, unit_cost, mrp, selling_price, status, notes
      ) VALUES (
        v_item.product_id,
        NEW.buyer_id,
        v_batch_no,
        NULLIF(TRIM(COALESCE(v_item.batch_barcode, '')), ''),
        v_item.manufactured_at,
        v_item.expires_at,
        v_item.quantity,
        COALESCE(v_item.unit_cost, v_item.unit_price),
        v_mrp,
        v_sell,
        'ACTIVE',
        'Created from Purchase Invoice: ' || NEW.order_no
      )
      ON CONFLICT (product_id, entity_id, batch_number) DO NOTHING
      RETURNING id INTO v_batch_id;

      -- If batch was created (not a duplicate), create RESTOCK movement
      IF v_batch_id IS NOT NULL THEN
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
        VALUES (
          v_item.product_id,
          NEW.buyer_id,
          'RESTOCK',
          v_item.quantity,
          NEW.id,
          v_batch_id,
          'Auto-restocked from Purchase Invoice: ' || NEW.order_no
        );

        -- Update product wholesale_price if unit_cost provided on the invoice line
        IF v_item.unit_cost IS NOT NULL THEN
          UPDATE products
          SET wholesale_price = v_item.unit_cost, updated_at = NOW()
          WHERE id = v_item.product_id;
        END IF;
      END IF;

    END LOOP;

    -- Stamp the received_at timestamp
    UPDATE orders SET received_at = NOW() WHERE id = NEW.id;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restock_on_invoice_confirm"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_stock_on_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE') THEN

    IF OLD.status IN (
      'CONFIRMED', 'PROCESSING', 'DISPATCHED', 'DELIVERED',
      'CANCELLATION_REQUESTED', 'REFUND_REQUESTED'
    ) THEN
      INSERT INTO inventory_movements
        (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
      SELECT
        oi.product_id,
        NEW.seller_id,
        'RETURN',
        oi.quantity,
        NEW.id,
        oi.batch_id,
        'Auto-restored on order cancellation: ' || NEW.order_no
      FROM order_items oi
      WHERE oi.order_id   = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status     = 'ACTIVE';

      UPDATE order_items
        SET status = 'CANCELLED'
      WHERE order_id = NEW.id
        AND status   = 'ACTIVE';
    END IF;

  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restore_stock_on_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_stock_on_item_cancel"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."restore_stock_on_item_cancel"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_stock_on_item_refund"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."restore_stock_on_item_refund"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_khata_on_refund"("p_order_id" "uuid", "p_amount" numeric, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_account UUID;
  v_actor   UUID := p_created_by;
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN NULL; END IF;

  -- The credit-sale confirm logged a DEBIT keyed to the order; that ties us to the account.
  SELECT khata_account_id INTO v_account
  FROM khata_transactions
  WHERE order_id = p_order_id AND transaction_type = 'DEBIT'
  LIMIT 1;
  IF v_account IS NULL THEN RETURN NULL; END IF;   -- not a credit sale / no khata debt

  -- created_by is NOT NULL — fall back to the account's entity actor when none passed.
  IF v_actor IS NULL THEN
    SELECT up.id INTO v_actor
    FROM user_profiles up
    JOIN khata_accounts ka ON ka.id = v_account
    WHERE up.entity_id = ka.creditor_entity_id
    ORDER BY CASE up.sub_role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'MANAGER' THEN 2 ELSE 3 END
    LIMIT 1;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'reverse_khata_on_refund: no user_profiles actor for the account''s entity';
    END IF;
  END IF;

  UPDATE khata_accounts
  SET outstanding_balance = GREATEST(0, outstanding_balance - p_amount), updated_at = NOW()
  WHERE id = v_account
  RETURNING outstanding_balance INTO v_balance;

  INSERT INTO khata_transactions
    (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
  VALUES
    (v_account, p_order_id, 'CREDIT', p_amount, v_balance, COALESCE(p_notes, 'Refund reversal'), v_actor);

  RETURN v_balance;
END;
$$;


ALTER FUNCTION "public"."reverse_khata_on_refund"("p_order_id" "uuid", "p_amount" numeric, "p_created_by" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_batch_quantity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    UPDATE product_batches
    SET quantity = quantity + NEW.quantity  -- quantity is signed (neg for sales)
    WHERE id = NEW.batch_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_batch_quantity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_entity_product_category_from_hsn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only update if hsn_master_id is set
  IF NEW.hsn_master_id IS NOT NULL THEN
    UPDATE entity_products
    SET
      category = COALESCE(NEW.category, hsn.category),
      subcategory = COALESCE(NEW.subcategory, hsn.short_description),
      hsn_chapter = hsn.chapter,
      hsn_heading = hsn.heading,
      hsn_subheading = hsn.subheading,
      hsn_code = hsn.code
    FROM hsn_master hsn
    WHERE hsn.id = NEW.hsn_master_id AND entity_products.id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_entity_product_category_from_hsn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_hsn_master_id_from_code_products"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only sync if hsn_code is provided and hsn_master_id is not already set
  IF NEW.hsn_code IS NOT NULL AND NEW.hsn_master_id IS NULL THEN
    SELECT id INTO NEW.hsn_master_id
    FROM hsn_master
    WHERE code = NEW.hsn_code AND is_active = true
    LIMIT 1;
  END IF;

  -- If hsn_code was cleared, also clear hsn_master_id
  IF NEW.hsn_code IS NULL THEN
    NEW.hsn_master_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_hsn_master_id_from_code_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_product_category_from_hsn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  h hsn_master%ROWTYPE;
BEGIN
  IF NEW.hsn_master_id IS NOT NULL THEN
    SELECT * INTO h FROM hsn_master WHERE id = NEW.hsn_master_id;
    IF FOUND THEN
      NEW.category       := COALESCE(NEW.category, h.category);
      NEW.subcategory    := COALESCE(NEW.subcategory, h.short_description);
      NEW.hsn_chapter    := h.chapter;
      NEW.hsn_heading    := h.heading;
      NEW.hsn_subheading := h.subheading;
      NEW.hsn_code       := h.code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_product_category_from_hsn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "operation" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "actor_id" "uuid",
    "actor_role" "text",
    "ip_address" "text",
    "user_agent" "text",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "audit_logs_operation_check" CHECK (("operation" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text", 'IMPERSONATE'::"text", 'AUTH'::"text"])))
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cart_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cart_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sku" "text",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "discount" numeric(12,2) DEFAULT 0,
    "gst_5" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "added_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "package_id" "uuid",
    "batch_id" "uuid",
    "discount_type" "text" DEFAULT 'FLAT'::"text" NOT NULL,
    "discount_value" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "cart_items_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['FLAT'::"text", 'PERCENTAGE'::"text"])))
);


ALTER TABLE "public"."cart_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."carts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "customer_whatsapp" "text",
    "buyer_hash" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "carts_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'ABANDONED'::"text", 'CONVERTED'::"text"])))
);


ALTER TABLE "public"."carts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_registers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_opening_float" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "machine_id" "text",
    CONSTRAINT "cash_registers_default_opening_float_check" CHECK (("default_opening_float" >= (0)::numeric))
);


ALTER TABLE "public"."cash_registers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "distributor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_properties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid",
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "data_type" "text" NOT NULL,
    "is_required" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0,
    "validation_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hsn_chapter" "text",
    "hsn_heading" "text",
    "hsn_code" "text",
    "applies_to_hsn_pattern" "text",
    CONSTRAINT "category_properties_data_type_check" CHECK (("data_type" = ANY (ARRAY['text_single'::"text", 'text_multi'::"text", 'number'::"text", 'unit'::"text", 'datetime'::"text"])))
);


ALTER TABLE "public"."category_properties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."consumer_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_order_at" timestamp with time zone
);


ALTER TABLE "public"."consumer_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_purchase_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "draft_purchase_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "raw_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "match_confidence" numeric(3,2),
    "match_status" "text" DEFAULT 'UNMATCHED'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "mrp" numeric(12,2),
    "selling_price" numeric(12,2),
    "batch_number" "text",
    "batch_barcode" "text",
    "expires_at" "date",
    "manufactured_at" "date",
    CONSTRAINT "draft_purchase_items_match_status_check" CHECK (("match_status" = ANY (ARRAY['MATCHED'::"text", 'PARTIAL'::"text", 'UNMATCHED'::"text"])))
);


ALTER TABLE "public"."draft_purchase_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."draft_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "supplier_name" "text",
    "bill_date" "date",
    "bill_photo_url" "text",
    "bill_photo_hash" "text",
    "total_amount" numeric(12,2) DEFAULT 0,
    "ocr_raw" "jsonb",
    "notes" "text",
    "created_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "draft_purchases_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'REVIEWED'::"text", 'CONFIRMED'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."draft_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "tpn_gstin" "text",
    "whatsapp_no" "text",
    "credit_limit" numeric(12,2) DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "shop_slug" "text",
    "marketplace_bio" "text",
    "marketplace_logo_url" "text",
    "address" "text",
    CONSTRAINT "entities_role_check" CHECK (("role" = ANY (ARRAY['SUPER_ADMIN'::"text", 'DISTRIBUTOR'::"text", 'WHOLESALER'::"text", 'RETAILER'::"text", 'CUSTOMER'::"text"])))
);


ALTER TABLE "public"."entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_categories" (
    "entity_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."entity_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_packages" (
    "entity_id" "uuid" NOT NULL,
    "package_id" "uuid" NOT NULL,
    "is_default" boolean DEFAULT false,
    "sort_order" integer DEFAULT 0
);


ALTER TABLE "public"."entity_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_product_specifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_product_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "value_text" "text",
    "value_number" numeric(12,2),
    "value_unit" "text",
    "value_datetime" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."entity_product_specifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "master_product_id" "uuid" NOT NULL,
    "sku" "text" NOT NULL,
    "display_name" "text",
    "barcode" "text",
    "qr_code" "text",
    "wholesale_price" numeric(12,2),
    "mrp" numeric(12,2),
    "gst_percent" numeric(5,2) DEFAULT 5.00,
    "current_stock" integer DEFAULT 0,
    "reorder_point" integer DEFAULT 10,
    "is_active" boolean DEFAULT true,
    "manufacturer_name" "text",
    "manufacturer_brand" "text",
    "country_of_origin" "text",
    "batch_number" "text",
    "manufactured_on" "date",
    "expiry_date" "date",
    "best_before" "date",
    "vendor_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "hsn_code" "text",
    "hsn_master_id" "uuid",
    "category" "text",
    "subcategory" "text",
    "hsn_chapter" "text",
    "hsn_heading" "text",
    "hsn_subheading" "text"
);


ALTER TABLE "public"."entity_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hsn_master" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "code_8digit" "text",
    "chapter" "text" NOT NULL,
    "heading" "text" NOT NULL,
    "subheading" "text",
    "tariff_item" "text",
    "description" "text" NOT NULL,
    "short_description" "text",
    "category" "text",
    "customs_duty" numeric(5,2) DEFAULT 0,
    "sales_tax" numeric(5,2) DEFAULT 0,
    "green_tax" numeric(5,2) DEFAULT 0,
    "tax_type" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hsn_master" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."entity_products_with_hsn" AS
 SELECT "ep"."id",
    "ep"."entity_id",
    "ep"."master_product_id",
    "ep"."hsn_code",
    "ep"."hsn_master_id",
    "ep"."hsn_chapter",
    "ep"."hsn_heading",
    "ep"."hsn_subheading",
    "ep"."category",
    "ep"."subcategory",
    "ep"."sku",
    "ep"."display_name",
    "ep"."barcode",
    "ep"."qr_code",
    "ep"."wholesale_price",
    "ep"."mrp",
    "ep"."gst_percent",
    "ep"."current_stock",
    "ep"."reorder_point",
    "ep"."is_active",
    "ep"."manufacturer_name",
    "ep"."manufacturer_brand",
    "ep"."country_of_origin",
    "ep"."batch_number",
    "ep"."manufactured_on",
    "ep"."expiry_date",
    "ep"."best_before",
    "ep"."vendor_notes",
    "ep"."created_at",
    "ep"."updated_at",
    "hsn"."customs_duty",
    "hsn"."sales_tax",
    "hsn"."green_tax",
    "hsn"."tax_type",
        CASE
            WHEN ("ep"."category" IS NOT NULL) THEN "ep"."category"
            ELSE "hsn"."category"
        END AS "display_category",
        CASE
            WHEN ("ep"."subcategory" IS NOT NULL) THEN "ep"."subcategory"
            ELSE "hsn"."short_description"
        END AS "display_subcategory",
    "e"."name" AS "entity_name",
    "e"."role" AS "entity_role"
   FROM (("public"."entity_products" "ep"
     LEFT JOIN "public"."hsn_master" "hsn" ON (("ep"."hsn_master_id" = "hsn"."id")))
     LEFT JOIN "public"."entities" "e" ON (("ep"."entity_id" = "e"."id")));


ALTER VIEW "public"."entity_products_with_hsn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."face_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "whatsapp_no" "text" NOT NULL,
    "name" "text",
    "embedding" "public"."vector"(512),
    "consent_at" timestamp with time zone NOT NULL,
    "consent_token" "text" NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."face_profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."hsn_code_properties" AS
 SELECT "hsn"."code",
    "hsn"."chapter",
    "hsn"."heading",
    "hsn"."subheading",
    "hsn"."category",
    "cp"."property_id",
    "cp"."property_name",
    "cp"."slug",
    "cp"."data_type",
    "cp"."is_required",
    "cp"."validation_rules",
    "cp"."sort_order",
    "cp"."applies_to_hsn_pattern"
   FROM ("public"."hsn_master" "hsn"
     LEFT JOIN LATERAL "public"."get_hsn_properties"("hsn"."code") "cp"("property_id", "property_name", "slug", "data_type", "is_required", "validation_rules", "sort_order", "applies_to_hsn_pattern") ON (true))
  WHERE ("hsn"."is_active" = true);


ALTER VIEW "public"."hsn_code_properties" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "movement_type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "reference_id" "uuid",
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "batch_id" "uuid",
    "package_id" "uuid",
    "package_qty" integer,
    "external_id" "text",
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['SALE'::"text", 'RESTOCK'::"text", 'TRANSFER'::"text", 'LOSS'::"text", 'DAMAGED'::"text", 'RETURN'::"text"])))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."khata_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "creditor_entity_id" "uuid" NOT NULL,
    "party_type" "text" NOT NULL,
    "debtor_entity_id" "uuid",
    "debtor_phone" "text",
    "debtor_name" "text",
    "debtor_face_id_hash" "text",
    "credit_limit" numeric(12,2) DEFAULT 0 NOT NULL,
    "outstanding_balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "credit_term_days" integer DEFAULT 30 NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "last_payment_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "khata_accounts_party_type_check" CHECK (("party_type" = ANY (ARRAY['CONSUMER'::"text", 'RETAILER'::"text", 'WHOLESALER'::"text", 'SUPPLIER'::"text"]))),
    CONSTRAINT "khata_accounts_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'FROZEN'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."khata_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."khata_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "khata_account_id" "uuid" NOT NULL,
    "repayment_id" "uuid",
    "alert_type" "text" NOT NULL,
    "sent_to" "text" NOT NULL,
    "whatsapp_status" "text" DEFAULT 'PENDING'::"text",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "khata_alerts_alert_type_check" CHECK (("alert_type" = ANY (ARRAY['PRE_DUE_3D'::"text", 'DUE_TODAY'::"text", 'OVERDUE_3D'::"text", 'OVERDUE_30D'::"text", 'MONTHLY_REMINDER'::"text"]))),
    CONSTRAINT "khata_alerts_sent_to_check" CHECK (("sent_to" = ANY (ARRAY['CREDITOR'::"text", 'DEBTOR'::"text", 'BOTH'::"text"]))),
    CONSTRAINT "khata_alerts_whatsapp_status_check" CHECK (("whatsapp_status" = ANY (ARRAY['PENDING'::"text", 'SENT'::"text", 'DELIVERED'::"text", 'READ'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."khata_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."khata_repayments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "khata_account_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "text" NOT NULL,
    "status" "text" DEFAULT 'CREATED'::"text" NOT NULL,
    "due_date" "date",
    "reference_no" "text",
    "notes" "text",
    "created_by" "uuid",
    "confirmed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "khata_repayments_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'MBOB'::"text", 'MPAY'::"text", 'RTGS'::"text", 'BANK_TRANSFER'::"text"]))),
    CONSTRAINT "khata_repayments_status_check" CHECK (("status" = ANY (ARRAY['CREATED'::"text", 'PAYMENT_MADE'::"text"])))
);


ALTER TABLE "public"."khata_repayments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."khata_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "khata_account_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "balance_after" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "external_id" "text",
    CONSTRAINT "khata_transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'MBOB'::"text", 'MPAY'::"text", 'RTGS'::"text", 'BANK_TRANSFER'::"text"]))),
    CONSTRAINT "khata_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['DEBIT'::"text", 'CREDIT'::"text", 'ADJUSTMENT'::"text"])))
);


ALTER TABLE "public"."khata_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_cancellation_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "order_item_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "reason" "text",
    "cancelled_by" "uuid",
    "cancelled_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_cancellation_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "sku" "text",
    "name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "discount" numeric(12,2) DEFAULT 0,
    "gst_5" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "package_id" "uuid",
    "package_name" "text",
    "package_type" "text",
    "matched" boolean DEFAULT true NOT NULL,
    "raw_request_text" "text",
    "match_confidence" numeric(3,2),
    "batch_id" "uuid",
    "unit_cost" numeric(12,2),
    "batch_number" "text",
    "batch_barcode" "text",
    "expires_at" "date",
    "manufactured_at" "date",
    "discount_type" "text" DEFAULT 'FLAT'::"text" NOT NULL,
    "discount_value" numeric(12,2) DEFAULT 0 NOT NULL,
    "external_id" "text",
    CONSTRAINT "order_items_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['FLAT'::"text", 'PERCENTAGE'::"text"]))),
    CONSTRAINT "order_items_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'CANCELLED'::"text", 'REFUNDED'::"text", 'REPLACED'::"text"])))
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "from_status" "text",
    "to_status" "text" NOT NULL,
    "actor_id" "uuid",
    "actor_role" "text",
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."order_status_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_type" "text" NOT NULL,
    "order_no" "text" NOT NULL,
    "status" "text" DEFAULT 'DRAFT'::"text" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "buyer_id" "uuid",
    "buyer_whatsapp" "text",
    "buyer_hash" "text",
    "items" "jsonb" NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "gst_total" numeric(12,2) NOT NULL,
    "grand_total" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "payment_ref" "text",
    "payment_verified_at" timestamp with time zone,
    "ocr_verify_id" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "whatsapp_status" "text" DEFAULT 'PENDING'::"text",
    "digital_signature" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "cart_id" "uuid",
    "order_source" "text" DEFAULT 'POS'::"text" NOT NULL,
    "whatsapp_message_id" "text",
    "buyer_phone" "text",
    "payment_token" "text",
    "payment_token_expires_at" timestamp with time zone,
    "delivery_address" "text",
    "delivery_lat" numeric(10,7),
    "delivery_lng" numeric(10,7),
    "pickup_otp" "text",
    "pickup_otp_expires_at" timestamp with time zone,
    "delivery_otp" "text",
    "delivery_otp_expires_at" timestamp with time zone,
    "rider_id" "uuid",
    "rider_accepted_at" timestamp with time zone,
    "purchase_order_id" "uuid",
    "supplier_name" "text",
    "supplier_ref" "text",
    "expected_delivery" "date",
    "received_at" timestamp with time zone,
    "sales_order_id" "uuid",
    "invoice_ref" "text",
    "delivery_fee" numeric(10,2),
    "delivery_fee_paid" boolean DEFAULT false NOT NULL,
    "delivery_fee_receipt_url" "text",
    "delivery_fee_confirmed_at" timestamp with time zone,
    "payment_channel" "text",
    "register_id" "uuid",
    "origin" "text" DEFAULT 'CLOUD'::"text" NOT NULL,
    CONSTRAINT "orders_order_source_check" CHECK (("order_source" = ANY (ARRAY['POS'::"text", 'WHATSAPP'::"text", 'MARKETPLACE_WEB'::"text"]))),
    CONSTRAINT "orders_order_type_check" CHECK (("order_type" = ANY (ARRAY['POS_SALE'::"text", 'WHOLESALE'::"text", 'MARKETPLACE'::"text", 'PURCHASE_ORDER'::"text", 'PURCHASE_INVOICE'::"text", 'SALES_ORDER'::"text", 'SALES_INVOICE'::"text"]))),
    CONSTRAINT "orders_origin_check" CHECK (("origin" = ANY (ARRAY['CLOUD'::"text", 'TERMINAL_SYNC'::"text"]))),
    CONSTRAINT "orders_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'CREDIT'::"text", 'ONLINE'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['DRAFT'::"text", 'PENDING_PAYMENT'::"text", 'PAYMENT_VERIFYING'::"text", 'CONFIRMED'::"text", 'PROCESSING'::"text", 'DISPATCHED'::"text", 'DELIVERED'::"text", 'COMPLETED'::"text", 'PAYMENT_FAILED'::"text", 'CANCELLATION_REQUESTED'::"text", 'CANCELLED'::"text", 'REFUND_REQUESTED'::"text", 'REFUND_APPROVED'::"text", 'REFUND_REJECTED'::"text", 'REFUND_PROCESSING'::"text", 'REFUNDED'::"text", 'REPLACEMENT_REQUESTED'::"text", 'REPLACEMENT_DISPATCHED'::"text", 'REPLACEMENT_DELIVERED'::"text", 'SENT'::"text", 'PARTIALLY_RECEIVED'::"text", 'PAID'::"text", 'PARTIALLY_FULFILLED'::"text"]))),
    CONSTRAINT "orders_whatsapp_status_check" CHECK (("whatsapp_status" = ANY (ARRAY['PENDING'::"text", 'SENT'::"text", 'DELIVERED'::"text", 'READ'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."owner_stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."owner_stores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."package_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "package_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."package_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_packages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "package_type" "text" DEFAULT 'BULK'::"text" NOT NULL,
    "barcode" "text",
    "qr_code" "text",
    "wholesale_price" numeric(12,2),
    "mrp" numeric(12,2),
    "hsn_code" "text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "product_id" "uuid",
    CONSTRAINT "product_packages_package_type_check" CHECK (("package_type" = ANY (ARRAY['BULK'::"text", 'BUNDLE'::"text", 'MIXED'::"text", 'PALLET'::"text"])))
);


ALTER TABLE "public"."product_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "sku" "text",
    "hsn_code" "text" NOT NULL,
    "image_url" "text",
    "image_embedding" "public"."vector"(1536),
    "current_stock" integer DEFAULT 0,
    "wholesale_price" numeric(12,2),
    "mrp" numeric(12,2),
    "unit" "text" DEFAULT 'pcs'::"text",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "barcode" "text",
    "qr_code" "text",
    "reorder_point" integer DEFAULT 10,
    "product_type" "text" DEFAULT 'SINGLE'::"text" NOT NULL,
    "sold_as_package_only" boolean DEFAULT false NOT NULL,
    "visible_on_web" boolean DEFAULT false NOT NULL,
    "hsn_master_id" "uuid",
    "category" "text",
    "subcategory" "text",
    "hsn_chapter" "text",
    "hsn_heading" "text",
    "hsn_subheading" "text",
    "selling_price" numeric(12,2),
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['SINGLE'::"text", 'PACKAGE'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."package_contents" AS
 SELECT "pp"."id" AS "package_id",
    "pp"."product_id" AS "package_product_id",
    "pp"."package_type",
    "pi"."product_id" AS "component_product_id",
    "comp"."name" AS "component_name",
    "comp"."image_url" AS "component_image",
    "comp"."unit" AS "component_unit",
    "pi"."quantity" AS "component_quantity",
    "comp"."current_stock" AS "component_stock",
    "floor"((("comp"."current_stock")::double precision / ("pi"."quantity")::double precision)) AS "component_supports_qty"
   FROM (("public"."product_packages" "pp"
     JOIN "public"."package_items" "pi" ON (("pi"."package_id" = "pp"."id")))
     JOIN "public"."products" "comp" ON (("comp"."id" = "pi"."product_id")));


ALTER VIEW "public"."package_contents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "attempt_number" integer NOT NULL,
    "payment_method" "text" NOT NULL,
    "gateway" "text",
    "amount" numeric(12,2) NOT NULL,
    "status" "text" NOT NULL,
    "gateway_ref" "text",
    "gateway_response" "jsonb",
    "failure_code" "text",
    "failure_reason" "text",
    "initiated_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "payment_attempts_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'SUCCESS'::"text", 'FAILED'::"text", 'TIMEOUT'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pos_order_counters" (
    "seller_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "last_serial" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."pos_order_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "batch_number" "text" NOT NULL,
    "barcode" "text",
    "qr_code" "text",
    "manufactured_at" "date",
    "expires_at" "date",
    "quantity" integer DEFAULT 0 NOT NULL,
    "unit_cost" numeric(12,2),
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "mrp" numeric(12,2),
    "selling_price" numeric(12,2),
    CONSTRAINT "product_batches_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'EXPIRED'::"text", 'RECALLED'::"text", 'DEPLETED'::"text"])))
);


ALTER TABLE "public"."product_batches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "product_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "entity_id" "uuid",
    "price_type" "text" NOT NULL,
    "old_price" numeric(12,2),
    "new_price" numeric(12,2) NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "reason" "text",
    CONSTRAINT "product_price_history_price_type_check" CHECK (("price_type" = ANY (ARRAY['MRP'::"text", 'WHOLESALE'::"text", 'SELLING'::"text"])))
);


ALTER TABLE "public"."product_price_history" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."products_with_hsn" AS
 SELECT "p"."id",
    "p"."name",
    "p"."sku",
    "p"."hsn_code",
    "p"."hsn_master_id",
    "p"."hsn_chapter",
    "p"."hsn_heading",
    "p"."hsn_subheading",
    "p"."category",
    "p"."subcategory",
    "p"."image_url",
    "p"."current_stock",
    "p"."wholesale_price",
    "p"."mrp",
    "p"."unit",
    "p"."is_active",
    "p"."created_by",
    "p"."created_at",
    "p"."updated_at",
    "hsn"."customs_duty",
    "hsn"."sales_tax",
    "hsn"."green_tax",
    "hsn"."tax_type",
        CASE
            WHEN ("p"."category" IS NOT NULL) THEN "p"."category"
            ELSE "hsn"."category"
        END AS "display_category",
        CASE
            WHEN ("p"."subcategory" IS NOT NULL) THEN "p"."subcategory"
            ELSE "hsn"."short_description"
        END AS "display_subcategory"
   FROM ("public"."products" "p"
     LEFT JOIN "public"."hsn_master" "hsn" ON (("p"."hsn_master_id" = "hsn"."id")));


ALTER VIEW "public"."products_with_hsn" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "refund_type" "text" NOT NULL,
    "refund_method" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "gst_reversal" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "status" "text" DEFAULT 'REQUESTED'::"text" NOT NULL,
    "gateway_ref" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "order_item_id" "uuid",
    "quantity" integer,
    CONSTRAINT "refunds_refund_type_check" CHECK (("refund_type" = ANY (ARRAY['FULL'::"text", 'PARTIAL'::"text"]))),
    CONSTRAINT "refunds_status_check" CHECK (("status" = ANY (ARRAY['REQUESTED'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'PROCESSING'::"text", 'COMPLETED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."replacements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "original_order_id" "uuid" NOT NULL,
    "replacement_order_id" "uuid",
    "reason" "text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "status" "text" DEFAULT 'REQUESTED'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "order_item_id" "uuid",
    "quantity" integer,
    CONSTRAINT "replacements_status_check" CHECK (("status" = ANY (ARRAY['REQUESTED'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'DISPATCHED'::"text", 'DELIVERED'::"text"])))
);


ALTER TABLE "public"."replacements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."retailer_wholesalers" (
    "retailer_id" "uuid" NOT NULL,
    "wholesaler_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."retailer_wholesalers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."riders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "whatsapp_no" "text" NOT NULL,
    "pin_hash" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "current_order_id" "uuid",
    "auth_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_email" "text",
    "auth_password" "text"
);


ALTER TABLE "public"."riders" OWNER TO "postgres";


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


ALTER VIEW "public"."sellable_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_reconciliations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "expected_total" numeric(12,2) NOT NULL,
    "actual_count" numeric(12,2) NOT NULL,
    "discrepancy" numeric(12,2) NOT NULL,
    "classification" "text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "shift_reconciliations_classification_check" CHECK (("classification" = ANY (ARRAY['OVERAGE'::"text", 'SHORTAGE'::"text", 'BALANCED'::"text"])))
);


ALTER TABLE "public"."shift_reconciliations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shift_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shift_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "transaction_type" "text" NOT NULL,
    "payment_method" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shift_transactions_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['MBOB'::"text", 'MPAY'::"text", 'RTGS'::"text", 'CASH'::"text", 'CREDIT'::"text", 'UPI'::"text", 'ONLINE'::"text"]))),
    CONSTRAINT "shift_transactions_transaction_type_check" CHECK (("transaction_type" = ANY (ARRAY['SALE'::"text", 'REFUND'::"text", 'VOID'::"text"])))
);


ALTER TABLE "public"."shift_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "register_id" "uuid" NOT NULL,
    "opened_by" "uuid" NOT NULL,
    "closed_by" "uuid",
    "opening_float" numeric(12,2) NOT NULL,
    "closing_count" numeric(12,2),
    "expected_total" numeric(12,2),
    "discrepancy" numeric(12,2),
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "opened_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "shifts_opening_float_check" CHECK (("opening_float" >= (0)::numeric)),
    CONSTRAINT "shifts_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'CLOSING'::"text", 'CLOSED'::"text"])))
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "avg_daily_sales" numeric(10,2) DEFAULT 0 NOT NULL,
    "weighted_ads" numeric(10,2) DEFAULT 0 NOT NULL,
    "days_until_stockout" numeric(10,2),
    "suggested_reorder_qty" numeric(10,2),
    "status" "text" NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stock_predictions_status_check" CHECK (("status" = ANY (ARRAY['HEALTHY'::"text", 'AT_RISK'::"text", 'CRITICAL'::"text", 'INSUFFICIENT_DATA'::"text", 'DEAD_STOCK'::"text", 'ERROR'::"text"])))
);


ALTER TABLE "public"."stock_predictions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."supplier_lead_times" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid",
    "category_id" "uuid",
    "supplier_id" "uuid",
    "entity_id" "uuid" NOT NULL,
    "lead_time_days" integer DEFAULT 7 NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    CONSTRAINT "supplier_lead_times_lead_time_days_check" CHECK (("lead_time_days" > 0))
);


ALTER TABLE "public"."supplier_lead_times" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."terminal_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "register_id" "uuid",
    "token_hash" "text" NOT NULL,
    "label" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."terminal_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "abbreviation" "text" NOT NULL,
    "category" "text",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "sub_role" "text" NOT NULL,
    "permissions" "text"[] DEFAULT '{}'::"text"[],
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['SUPER_ADMIN'::"text", 'DISTRIBUTOR'::"text", 'WHOLESALER'::"text", 'RETAILER'::"text", 'CUSTOMER'::"text"]))),
    CONSTRAINT "user_profiles_sub_role_check" CHECK (("sub_role" = ANY (ARRAY['OWNER'::"text", 'MANAGER'::"text", 'CASHIER'::"text", 'STAFF'::"text", 'ADMIN'::"text", 'CUSTOMER'::"text"])))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."whatsapp_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone" "text" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used" boolean DEFAULT false,
    "attempt_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."whatsapp_otps" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_properties"
    ADD CONSTRAINT "category_properties_hsn_heading_slug_key" UNIQUE ("hsn_chapter", "hsn_heading", "slug");



ALTER TABLE ONLY "public"."category_properties"
    ADD CONSTRAINT "category_properties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consumer_accounts"
    ADD CONSTRAINT "consumer_accounts_phone_key" UNIQUE ("phone");



ALTER TABLE ONLY "public"."consumer_accounts"
    ADD CONSTRAINT "consumer_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_purchase_items"
    ADD CONSTRAINT "draft_purchase_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."draft_purchases"
    ADD CONSTRAINT "draft_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_shop_slug_key" UNIQUE ("shop_slug");



ALTER TABLE ONLY "public"."entities"
    ADD CONSTRAINT "entities_tpn_gstin_key" UNIQUE ("tpn_gstin");



ALTER TABLE ONLY "public"."entity_categories"
    ADD CONSTRAINT "entity_categories_pkey" PRIMARY KEY ("entity_id", "category_id");



ALTER TABLE ONLY "public"."entity_packages"
    ADD CONSTRAINT "entity_packages_pkey" PRIMARY KEY ("entity_id", "package_id");



ALTER TABLE ONLY "public"."entity_product_specifications"
    ADD CONSTRAINT "entity_product_specifications_entity_product_id_property_id_key" UNIQUE ("entity_product_id", "property_id");



ALTER TABLE ONLY "public"."entity_product_specifications"
    ADD CONSTRAINT "entity_product_specifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_products"
    ADD CONSTRAINT "entity_products_entity_id_sku_key" UNIQUE ("entity_id", "sku");



ALTER TABLE ONLY "public"."entity_products"
    ADD CONSTRAINT "entity_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."face_profiles"
    ADD CONSTRAINT "face_profiles_consent_token_key" UNIQUE ("consent_token");



ALTER TABLE ONLY "public"."face_profiles"
    ADD CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hsn_master"
    ADD CONSTRAINT "hsn_master_code_8digit_key" UNIQUE ("code_8digit");



ALTER TABLE ONLY "public"."hsn_master"
    ADD CONSTRAINT "hsn_master_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."hsn_master"
    ADD CONSTRAINT "hsn_master_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."khata_accounts"
    ADD CONSTRAINT "khata_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."khata_alerts"
    ADD CONSTRAINT "khata_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."khata_repayments"
    ADD CONSTRAINT "khata_repayments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."khata_transactions"
    ADD CONSTRAINT "khata_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_cancellation_items"
    ADD CONSTRAINT "order_cancellation_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_log"
    ADD CONSTRAINT "order_status_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_order_no_key" UNIQUE ("order_no");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owner_stores"
    ADD CONSTRAINT "owner_stores_owner_id_entity_id_key" UNIQUE ("owner_id", "entity_id");



ALTER TABLE ONLY "public"."owner_stores"
    ADD CONSTRAINT "owner_stores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_package_id_product_id_key" UNIQUE ("package_id", "product_id");



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_order_id_attempt_number_key" UNIQUE ("order_id", "attempt_number");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pos_order_counters"
    ADD CONSTRAINT "pos_order_counters_pkey" PRIMARY KEY ("seller_id", "year");



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_product_id_entity_id_batch_number_key" UNIQUE ("product_id", "entity_id", "batch_number");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("product_id", "category_id");



ALTER TABLE ONLY "public"."product_packages"
    ADD CONSTRAINT "product_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_packages"
    ADD CONSTRAINT "product_packages_product_id_key" UNIQUE ("product_id");



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."retailer_wholesalers"
    ADD CONSTRAINT "retailer_wholesalers_pkey" PRIMARY KEY ("retailer_id", "wholesaler_id", "category_id");



ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_whatsapp_no_key" UNIQUE ("whatsapp_no");



ALTER TABLE ONLY "public"."shift_reconciliations"
    ADD CONSTRAINT "shift_reconciliations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_reconciliations"
    ADD CONSTRAINT "shift_reconciliations_shift_id_key" UNIQUE ("shift_id");



ALTER TABLE ONLY "public"."shift_transactions"
    ADD CONSTRAINT "shift_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_predictions"
    ADD CONSTRAINT "stock_predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_predictions"
    ADD CONSTRAINT "stock_predictions_product_id_entity_id_calculated_at_key" UNIQUE ("product_id", "entity_id", "calculated_at");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "supplier_lead_times_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terminal_tokens"
    ADD CONSTRAINT "terminal_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."terminal_tokens"
    ADD CONSTRAINT "terminal_tokens_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_abbreviation_key" UNIQUE ("abbreviation");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."khata_accounts"
    ADD CONSTRAINT "uq_khata_creditor_debtor" UNIQUE ("creditor_entity_id", "debtor_entity_id", "debtor_phone");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "uq_slt_category_supplier" UNIQUE ("category_id", "supplier_id");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "uq_slt_product_supplier" UNIQUE ("product_id", "supplier_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."whatsapp_otps"
    ADD CONSTRAINT "whatsapp_otps_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audit_logs_actor" ON "public"."audit_logs" USING "btree" ("actor_id");



CREATE INDEX "idx_audit_logs_record" ON "public"."audit_logs" USING "btree" ("record_id");



CREATE INDEX "idx_audit_logs_table" ON "public"."audit_logs" USING "btree" ("table_name");



CREATE INDEX "idx_audit_logs_timestamp" ON "public"."audit_logs" USING "btree" ("timestamp" DESC);



CREATE UNIQUE INDEX "idx_batches_barcode_entity" ON "public"."product_batches" USING "btree" ("entity_id", "barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_batches_entity" ON "public"."product_batches" USING "btree" ("entity_id");



CREATE INDEX "idx_batches_expires" ON "public"."product_batches" USING "btree" ("expires_at");



CREATE INDEX "idx_batches_product" ON "public"."product_batches" USING "btree" ("product_id");



CREATE INDEX "idx_batches_status" ON "public"."product_batches" USING "btree" ("status");



CREATE INDEX "idx_cancel_items_order" ON "public"."order_cancellation_items" USING "btree" ("order_id");



CREATE INDEX "idx_cart_items_cart" ON "public"."cart_items" USING "btree" ("cart_id");



CREATE INDEX "idx_cart_items_product" ON "public"."cart_items" USING "btree" ("product_id");



CREATE INDEX "idx_carts_entity" ON "public"."carts" USING "btree" ("entity_id");



CREATE INDEX "idx_carts_status" ON "public"."carts" USING "btree" ("status");



CREATE INDEX "idx_cash_registers_entity" ON "public"."cash_registers" USING "btree" ("entity_id", "is_active");



CREATE UNIQUE INDEX "idx_cash_registers_entity_machine" ON "public"."cash_registers" USING "btree" ("entity_id", "machine_id");



CREATE INDEX "idx_category_properties_hsn_chapter" ON "public"."category_properties" USING "btree" ("hsn_chapter");



CREATE INDEX "idx_category_properties_hsn_code" ON "public"."category_properties" USING "btree" ("hsn_code");



CREATE INDEX "idx_category_properties_hsn_heading" ON "public"."category_properties" USING "btree" ("hsn_heading");



CREATE INDEX "idx_consumer_accounts_phone" ON "public"."consumer_accounts" USING "btree" ("phone");



CREATE INDEX "idx_draft_purchase_items_draft" ON "public"."draft_purchase_items" USING "btree" ("draft_purchase_id");



CREATE INDEX "idx_draft_purchases_entity" ON "public"."draft_purchases" USING "btree" ("entity_id", "status");



CREATE INDEX "idx_draft_purchases_hash" ON "public"."draft_purchases" USING "btree" ("bill_photo_hash") WHERE ("bill_photo_hash" IS NOT NULL);



CREATE UNIQUE INDEX "idx_entities_shop_slug" ON "public"."entities" USING "btree" ("shop_slug") WHERE ("shop_slug" IS NOT NULL);



CREATE INDEX "idx_entity_categories_category" ON "public"."entity_categories" USING "btree" ("category_id");



CREATE INDEX "idx_entity_categories_entity" ON "public"."entity_categories" USING "btree" ("entity_id");



CREATE INDEX "idx_entity_packages_entity" ON "public"."entity_packages" USING "btree" ("entity_id");



CREATE INDEX "idx_entity_product_specs_entity_product" ON "public"."entity_product_specifications" USING "btree" ("entity_product_id");



CREATE INDEX "idx_entity_product_specs_property" ON "public"."entity_product_specifications" USING "btree" ("property_id");



CREATE INDEX "idx_entity_products_active" ON "public"."entity_products" USING "btree" ("entity_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_entity_products_category" ON "public"."entity_products" USING "btree" ("category");



CREATE INDEX "idx_entity_products_entity" ON "public"."entity_products" USING "btree" ("entity_id");



CREATE INDEX "idx_entity_products_expiry" ON "public"."entity_products" USING "btree" ("expiry_date") WHERE ("expiry_date" IS NOT NULL);



CREATE INDEX "idx_entity_products_hsn_master" ON "public"."entity_products" USING "btree" ("hsn_master_id");



CREATE INDEX "idx_entity_products_master" ON "public"."entity_products" USING "btree" ("master_product_id");



CREATE INDEX "idx_entity_products_sku" ON "public"."entity_products" USING "btree" ("sku");



CREATE INDEX "idx_entity_products_subcategory" ON "public"."entity_products" USING "btree" ("subcategory");



CREATE INDEX "idx_face_profiles_embedding" ON "public"."face_profiles" USING "ivfflat" ("embedding" "public"."vector_cosine_ops") WITH ("lists"='50') WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_face_profiles_entity" ON "public"."face_profiles" USING "btree" ("entity_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_face_profiles_whatsapp" ON "public"."face_profiles" USING "btree" ("whatsapp_no") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_hsn_master_active" ON "public"."hsn_master" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_hsn_master_category" ON "public"."hsn_master" USING "btree" ("category");



CREATE INDEX "idx_hsn_master_chapter" ON "public"."hsn_master" USING "btree" ("chapter");



CREATE INDEX "idx_hsn_master_code" ON "public"."hsn_master" USING "btree" ("code");



CREATE INDEX "idx_inventory_movements_created" ON "public"."inventory_movements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inventory_movements_entity" ON "public"."inventory_movements" USING "btree" ("entity_id");



CREATE UNIQUE INDEX "idx_inventory_movements_external" ON "public"."inventory_movements" USING "btree" ("external_id");



CREATE INDEX "idx_inventory_movements_product" ON "public"."inventory_movements" USING "btree" ("product_id");



CREATE INDEX "idx_khata_accounts_creditor" ON "public"."khata_accounts" USING "btree" ("creditor_entity_id");



CREATE INDEX "idx_khata_accounts_debtor_entity" ON "public"."khata_accounts" USING "btree" ("debtor_entity_id") WHERE ("debtor_entity_id" IS NOT NULL);



CREATE INDEX "idx_khata_accounts_debtor_phone" ON "public"."khata_accounts" USING "btree" ("debtor_phone") WHERE ("debtor_phone" IS NOT NULL);



CREATE INDEX "idx_khata_accounts_status" ON "public"."khata_accounts" USING "btree" ("status") WHERE ("status" = 'ACTIVE'::"text");



CREATE INDEX "idx_khata_alerts_account" ON "public"."khata_alerts" USING "btree" ("khata_account_id");



CREATE INDEX "idx_khata_repayments_account" ON "public"."khata_repayments" USING "btree" ("khata_account_id");



CREATE INDEX "idx_khata_repayments_due" ON "public"."khata_repayments" USING "btree" ("due_date") WHERE (("due_date" IS NOT NULL) AND ("status" = 'CREATED'::"text"));



CREATE INDEX "idx_khata_txn_account" ON "public"."khata_transactions" USING "btree" ("khata_account_id");



CREATE INDEX "idx_khata_txn_date" ON "public"."khata_transactions" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_khata_txn_external" ON "public"."khata_transactions" USING "btree" ("external_id");



CREATE INDEX "idx_khata_txn_order" ON "public"."khata_transactions" USING "btree" ("order_id") WHERE ("order_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_order_items_external" ON "public"."order_items" USING "btree" ("external_id");



CREATE INDEX "idx_order_items_order" ON "public"."order_items" USING "btree" ("order_id");



CREATE INDEX "idx_order_items_product" ON "public"."order_items" USING "btree" ("product_id");



CREATE INDEX "idx_order_items_status" ON "public"."order_items" USING "btree" ("status");



CREATE INDEX "idx_order_status_log_order" ON "public"."order_status_log" USING "btree" ("order_id");



CREATE INDEX "idx_orders_buyer" ON "public"."orders" USING "btree" ("buyer_id");



CREATE INDEX "idx_orders_buyer_phone_date" ON "public"."orders" USING "btree" ("buyer_phone", "created_at") WHERE ("order_source" = 'WHATSAPP'::"text");



CREATE INDEX "idx_orders_buyer_type" ON "public"."orders" USING "btree" ("buyer_id", "order_type");



CREATE INDEX "idx_orders_created" ON "public"."orders" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_orders_payment_token" ON "public"."orders" USING "btree" ("payment_token") WHERE ("payment_token" IS NOT NULL);



CREATE INDEX "idx_orders_purchase_order_id" ON "public"."orders" USING "btree" ("purchase_order_id") WHERE ("purchase_order_id" IS NOT NULL);



CREATE INDEX "idx_orders_purchase_type" ON "public"."orders" USING "btree" ("order_type", "buyer_id") WHERE ("order_type" = ANY (ARRAY['PURCHASE_ORDER'::"text", 'PURCHASE_INVOICE'::"text"]));



CREATE INDEX "idx_orders_register" ON "public"."orders" USING "btree" ("register_id");



CREATE INDEX "idx_orders_rider_id" ON "public"."orders" USING "btree" ("rider_id") WHERE ("rider_id" IS NOT NULL);



CREATE INDEX "idx_orders_sales_order_id" ON "public"."orders" USING "btree" ("sales_order_id") WHERE ("sales_order_id" IS NOT NULL);



CREATE INDEX "idx_orders_sales_type" ON "public"."orders" USING "btree" ("order_type", "seller_id") WHERE ("order_type" = ANY (ARRAY['SALES_ORDER'::"text", 'SALES_INVOICE'::"text"]));



CREATE INDEX "idx_orders_seller" ON "public"."orders" USING "btree" ("seller_id");



CREATE INDEX "idx_orders_status" ON "public"."orders" USING "btree" ("status");



CREATE INDEX "idx_owner_stores_entity" ON "public"."owner_stores" USING "btree" ("entity_id");



CREATE INDEX "idx_owner_stores_owner" ON "public"."owner_stores" USING "btree" ("owner_id");



CREATE INDEX "idx_package_items_package" ON "public"."package_items" USING "btree" ("package_id");



CREATE INDEX "idx_package_items_product" ON "public"."package_items" USING "btree" ("product_id");



CREATE UNIQUE INDEX "idx_packages_barcode" ON "public"."product_packages" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_payment_attempts_order" ON "public"."payment_attempts" USING "btree" ("order_id");



CREATE INDEX "idx_price_history_changed" ON "public"."product_price_history" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_price_history_product" ON "public"."product_price_history" USING "btree" ("product_id");



CREATE INDEX "idx_product_categories_category" ON "public"."product_categories" USING "btree" ("category_id");



CREATE INDEX "idx_product_categories_product" ON "public"."product_categories" USING "btree" ("product_id");



CREATE INDEX "idx_product_packages_product_id" ON "public"."product_packages" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_products_barcode" ON "public"."products" USING "btree" ("barcode") WHERE ("barcode" IS NOT NULL);



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category");



CREATE INDEX "idx_products_embedding" ON "public"."products" USING "ivfflat" ("image_embedding" "public"."vector_cosine_ops") WITH ("lists"='100');



CREATE INDEX "idx_products_hsn_master" ON "public"."products" USING "btree" ("hsn_master_id");



CREATE INDEX "idx_products_marketplace" ON "public"."products" USING "btree" ("created_by", "visible_on_web", "current_stock") WHERE (("visible_on_web" = true) AND ("current_stock" > 0));



CREATE INDEX "idx_products_name_trgm" ON "public"."products" USING "gin" ("name" "public"."gin_trgm_ops");



CREATE INDEX "idx_products_package_only" ON "public"."products" USING "btree" ("sold_as_package_only") WHERE ("sold_as_package_only" = true);



CREATE INDEX "idx_products_subcategory" ON "public"."products" USING "btree" ("subcategory");



CREATE INDEX "idx_products_type" ON "public"."products" USING "btree" ("product_type") WHERE ("is_active" = true);



CREATE INDEX "idx_refunds_order" ON "public"."refunds" USING "btree" ("order_id");



CREATE INDEX "idx_riders_available" ON "public"."riders" USING "btree" ("is_active", "is_available") WHERE ("is_active" = true);



CREATE INDEX "idx_riders_whatsapp" ON "public"."riders" USING "btree" ("whatsapp_no");



CREATE INDEX "idx_rw_category" ON "public"."retailer_wholesalers" USING "btree" ("category_id");



CREATE INDEX "idx_rw_retailer" ON "public"."retailer_wholesalers" USING "btree" ("retailer_id");



CREATE INDEX "idx_rw_wholesaler" ON "public"."retailer_wholesalers" USING "btree" ("wholesaler_id");



CREATE INDEX "idx_shift_transactions_shift" ON "public"."shift_transactions" USING "btree" ("shift_id", "created_at");



CREATE INDEX "idx_shifts_entity" ON "public"."shifts" USING "btree" ("entity_id", "opened_at" DESC);



CREATE UNIQUE INDEX "idx_shifts_one_active_per_register" ON "public"."shifts" USING "btree" ("register_id") WHERE ("status" = ANY (ARRAY['ACTIVE'::"text", 'CLOSING'::"text"]));



CREATE INDEX "idx_slt_category" ON "public"."supplier_lead_times" USING "btree" ("category_id") WHERE ("category_id" IS NOT NULL);



CREATE INDEX "idx_slt_entity" ON "public"."supplier_lead_times" USING "btree" ("entity_id");



CREATE INDEX "idx_slt_product" ON "public"."supplier_lead_times" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_stock_pred_days" ON "public"."stock_predictions" USING "btree" ("entity_id", "days_until_stockout");



CREATE INDEX "idx_stock_pred_latest" ON "public"."stock_predictions" USING "btree" ("entity_id", "calculated_at" DESC);



CREATE INDEX "idx_stock_pred_status" ON "public"."stock_predictions" USING "btree" ("entity_id", "status");



CREATE INDEX "idx_terminal_tokens_entity" ON "public"."terminal_tokens" USING "btree" ("entity_id", "is_active");



CREATE INDEX "idx_user_profiles_entity" ON "public"."user_profiles" USING "btree" ("entity_id");



CREATE INDEX "idx_whatsapp_otps_cleanup" ON "public"."whatsapp_otps" USING "btree" ("created_at") WHERE ("used" = true);



CREATE INDEX "idx_whatsapp_otps_lookup" ON "public"."whatsapp_otps" USING "btree" ("phone", "used", "expires_at" DESC);



CREATE OR REPLACE TRIGGER "batch_auto_deplete" BEFORE UPDATE OF "quantity" ON "public"."product_batches" FOR EACH ROW EXECUTE FUNCTION "public"."auto_deplete_batch"();



CREATE OR REPLACE TRIGGER "cart_items_updated_at" BEFORE UPDATE ON "public"."cart_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "carts_updated_at" BEFORE UPDATE ON "public"."carts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "entities_updated_at" BEFORE UPDATE ON "public"."entities" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "face_profiles_updated_at" BEFORE UPDATE ON "public"."face_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "inventory_movement_apply" AFTER INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."apply_inventory_movement"();



CREATE OR REPLACE TRIGGER "inventory_sync_batch" AFTER INSERT ON "public"."inventory_movements" FOR EACH ROW EXECUTE FUNCTION "public"."sync_batch_quantity"();



CREATE OR REPLACE TRIGGER "khata_repayment_apply" AFTER UPDATE ON "public"."khata_repayments" FOR EACH ROW EXECUTE FUNCTION "public"."khata_apply_repayment"();



CREATE OR REPLACE TRIGGER "order_items_restore_on_cancel" AFTER UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."restore_stock_on_item_cancel"();



CREATE OR REPLACE TRIGGER "order_items_restore_on_refund" AFTER UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."restore_stock_on_item_refund"();



CREATE OR REPLACE TRIGGER "orders_convert_cart" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."convert_cart_on_confirm"();



CREATE OR REPLACE TRIGGER "orders_deduct_on_sales_invoice" AFTER INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."deduct_stock_on_sales_invoice"();



CREATE OR REPLACE TRIGGER "orders_deduct_stock" AFTER INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text")) EXECUTE FUNCTION "public"."deduct_stock_on_confirm"();



CREATE OR REPLACE TRIGGER "orders_guard_stock" BEFORE INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text")) EXECUTE FUNCTION "public"."guard_stock_on_confirm"();



CREATE OR REPLACE TRIGGER "orders_khata_cancel" AFTER UPDATE ON "public"."orders" FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text")) EXECUTE FUNCTION "public"."khata_credit_on_cancel"();



CREATE OR REPLACE TRIGGER "orders_khata_debit" AFTER UPDATE ON "public"."orders" FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text")) EXECUTE FUNCTION "public"."khata_debit_on_confirm"();



CREATE OR REPLACE TRIGGER "orders_restock_buyer" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."restock_buyer_on_delivery"();



CREATE OR REPLACE TRIGGER "orders_restock_on_invoice_confirm" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."restock_on_invoice_confirm"();



CREATE OR REPLACE TRIGGER "orders_restore_stock_cancel" AFTER UPDATE ON "public"."orders" FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text")) EXECUTE FUNCTION "public"."restore_stock_on_cancel"();



CREATE OR REPLACE TRIGGER "orders_status_log" AFTER UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_order_status_change"();



CREATE OR REPLACE TRIGGER "orders_updated_at" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "products_price_history" AFTER UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."log_product_price_change"();



CREATE OR REPLACE TRIGGER "products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_order_item_discount_audit" AFTER UPDATE ON "public"."order_items" FOR EACH ROW EXECUTE FUNCTION "public"."audit_order_item_discount"();



CREATE OR REPLACE TRIGGER "trigger_sync_entity_product_category_from_hsn" BEFORE INSERT OR UPDATE ON "public"."entity_products" FOR EACH ROW WHEN (("new"."hsn_master_id" IS NOT NULL)) EXECUTE FUNCTION "public"."sync_entity_product_category_from_hsn"();



CREATE OR REPLACE TRIGGER "trigger_sync_hsn_master_id_from_code_entity_products" BEFORE INSERT OR UPDATE OF "hsn_code" ON "public"."entity_products" FOR EACH ROW EXECUTE FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"();



CREATE OR REPLACE TRIGGER "trigger_sync_hsn_master_id_from_code_products" BEFORE INSERT OR UPDATE OF "hsn_code" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."sync_hsn_master_id_from_code_products"();



CREATE OR REPLACE TRIGGER "trigger_sync_product_category_from_hsn" BEFORE INSERT OR UPDATE ON "public"."products" FOR EACH ROW WHEN (("new"."hsn_master_id" IS NOT NULL)) EXECUTE FUNCTION "public"."sync_product_category_from_hsn"();



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."product_packages"("id");



ALTER TABLE ONLY "public"."cart_items"
    ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."cash_registers"
    ADD CONSTRAINT "cash_registers_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."category_properties"
    ADD CONSTRAINT "category_properties_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_purchase_items"
    ADD CONSTRAINT "draft_purchase_items_draft_purchase_id_fkey" FOREIGN KEY ("draft_purchase_id") REFERENCES "public"."draft_purchases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."draft_purchase_items"
    ADD CONSTRAINT "draft_purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."draft_purchases"
    ADD CONSTRAINT "draft_purchases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."draft_purchases"
    ADD CONSTRAINT "draft_purchases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."entity_categories"
    ADD CONSTRAINT "entity_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_categories"
    ADD CONSTRAINT "entity_categories_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_packages"
    ADD CONSTRAINT "entity_packages_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_packages"
    ADD CONSTRAINT "entity_packages_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."product_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_product_specifications"
    ADD CONSTRAINT "entity_product_specifications_entity_product_id_fkey" FOREIGN KEY ("entity_product_id") REFERENCES "public"."entity_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_product_specifications"
    ADD CONSTRAINT "entity_product_specifications_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."category_properties"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_products"
    ADD CONSTRAINT "entity_products_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_products"
    ADD CONSTRAINT "entity_products_hsn_master_id_fkey" FOREIGN KEY ("hsn_master_id") REFERENCES "public"."hsn_master"("id");



ALTER TABLE ONLY "public"."entity_products"
    ADD CONSTRAINT "entity_products_master_product_id_fkey" FOREIGN KEY ("master_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."face_profiles"
    ADD CONSTRAINT "face_profiles_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "fk_categories_distributor" FOREIGN KEY ("distributor_id") REFERENCES "public"."entities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."product_packages"("id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."khata_accounts"
    ADD CONSTRAINT "khata_accounts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."khata_accounts"
    ADD CONSTRAINT "khata_accounts_creditor_entity_id_fkey" FOREIGN KEY ("creditor_entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."khata_accounts"
    ADD CONSTRAINT "khata_accounts_debtor_entity_id_fkey" FOREIGN KEY ("debtor_entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."khata_alerts"
    ADD CONSTRAINT "khata_alerts_khata_account_id_fkey" FOREIGN KEY ("khata_account_id") REFERENCES "public"."khata_accounts"("id");



ALTER TABLE ONLY "public"."khata_alerts"
    ADD CONSTRAINT "khata_alerts_repayment_id_fkey" FOREIGN KEY ("repayment_id") REFERENCES "public"."khata_repayments"("id");



ALTER TABLE ONLY "public"."khata_repayments"
    ADD CONSTRAINT "khata_repayments_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."khata_repayments"
    ADD CONSTRAINT "khata_repayments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."khata_repayments"
    ADD CONSTRAINT "khata_repayments_khata_account_id_fkey" FOREIGN KEY ("khata_account_id") REFERENCES "public"."khata_accounts"("id");



ALTER TABLE ONLY "public"."khata_transactions"
    ADD CONSTRAINT "khata_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."khata_transactions"
    ADD CONSTRAINT "khata_transactions_khata_account_id_fkey" FOREIGN KEY ("khata_account_id") REFERENCES "public"."khata_accounts"("id");



ALTER TABLE ONLY "public"."order_cancellation_items"
    ADD CONSTRAINT "order_cancellation_items_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."order_cancellation_items"
    ADD CONSTRAINT "order_cancellation_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_cancellation_items"
    ADD CONSTRAINT "order_cancellation_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."product_packages"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."order_status_log"
    ADD CONSTRAINT "order_status_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."order_status_log"
    ADD CONSTRAINT "order_status_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."owner_stores"
    ADD CONSTRAINT "owner_stores_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_stores"
    ADD CONSTRAINT "owner_stores_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."product_packages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."package_items"
    ADD CONSTRAINT "package_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."pos_order_counters"
    ADD CONSTRAINT "pos_order_counters_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_batches"
    ADD CONSTRAINT "product_batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_packages"
    ADD CONSTRAINT "product_packages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."product_packages"
    ADD CONSTRAINT "product_packages_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."product_price_history"
    ADD CONSTRAINT "product_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_hsn_master_id_fkey" FOREIGN KEY ("hsn_master_id") REFERENCES "public"."hsn_master"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_original_order_id_fkey" FOREIGN KEY ("original_order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_replacement_order_id_fkey" FOREIGN KEY ("replacement_order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."replacements"
    ADD CONSTRAINT "replacements_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."retailer_wholesalers"
    ADD CONSTRAINT "retailer_wholesalers_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retailer_wholesalers"
    ADD CONSTRAINT "retailer_wholesalers_retailer_id_fkey" FOREIGN KEY ("retailer_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."retailer_wholesalers"
    ADD CONSTRAINT "retailer_wholesalers_wholesaler_id_fkey" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."entities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."riders"
    ADD CONSTRAINT "riders_current_order_id_fkey" FOREIGN KEY ("current_order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_reconciliations"
    ADD CONSTRAINT "shift_reconciliations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."shift_reconciliations"
    ADD CONSTRAINT "shift_reconciliations_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id");



ALTER TABLE ONLY "public"."shift_transactions"
    ADD CONSTRAINT "shift_transactions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id");



ALTER TABLE ONLY "public"."stock_predictions"
    ADD CONSTRAINT "stock_predictions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."stock_predictions"
    ADD CONSTRAINT "stock_predictions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "supplier_lead_times_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "supplier_lead_times_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "supplier_lead_times_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."supplier_lead_times"
    ADD CONSTRAINT "supplier_lead_times_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."terminal_tokens"
    ADD CONSTRAINT "terminal_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."terminal_tokens"
    ADD CONSTRAINT "terminal_tokens_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."terminal_tokens"
    ADD CONSTRAINT "terminal_tokens_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admins_manage_category_properties_hsn" ON "public"."category_properties" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = ANY (ARRAY['SUPER_ADMIN'::"text", 'DISTRIBUTOR'::"text"]))))));



CREATE POLICY "all_read_hsn_master" ON "public"."hsn_master" FOR SELECT USING (true);



CREATE POLICY "audit_logs_admin_read" ON "public"."audit_logs" FOR SELECT USING (("public"."is_super_admin"() OR ("public"."auth_sub_role"() = ANY (ARRAY['OWNER'::"text", 'ADMIN'::"text"]))));



CREATE POLICY "buyer_own_order_status_logs" ON "public"."order_status_log" USING (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."buyer_id" = "public"."auth_entity_id"()))))) WITH CHECK (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."buyer_id" = "public"."auth_entity_id"())))));



CREATE POLICY "buyer_own_wholesale_orders" ON "public"."orders" FOR SELECT USING (("buyer_id" = "public"."auth_entity_id"()));



CREATE POLICY "buyer_update_wholesale_orders" ON "public"."orders" FOR UPDATE USING ((("buyer_id" = "public"."auth_entity_id"()) AND ("order_type" = 'WHOLESALE'::"text")));



CREATE POLICY "cart_items_own_entity" ON "public"."cart_items" USING (("public"."is_super_admin"() OR ("cart_id" IN ( SELECT "carts"."id"
   FROM "public"."carts"
  WHERE ("carts"."entity_id" = "public"."auth_entity_id"()))))) WITH CHECK (("public"."is_super_admin"() OR ("cart_id" IN ( SELECT "carts"."id"
   FROM "public"."carts"
  WHERE ("carts"."entity_id" = "public"."auth_entity_id"())))));



CREATE POLICY "carts_own_entity" ON "public"."carts" USING (("public"."is_super_admin"() OR ("entity_id" = "public"."auth_entity_id"()))) WITH CHECK (("public"."is_super_admin"() OR ("entity_id" = "public"."auth_entity_id"())));



CREATE POLICY "categories_distributor_manage" ON "public"."categories" USING (("public"."is_super_admin"() OR (("public"."auth_role"() = 'DISTRIBUTOR'::"text") AND ("distributor_id" = "public"."auth_entity_id"()))));



CREATE POLICY "categories_read_all" ON "public"."categories" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "distributor_category_entities" ON "public"."entities" FOR SELECT USING ((("public"."auth_role"() = 'DISTRIBUTOR'::"text") AND (("id" = "public"."auth_entity_id"()) OR ("id" IN ( SELECT "ec"."entity_id"
   FROM ("public"."entity_categories" "ec"
     JOIN "public"."categories" "c" ON (("c"."id" = "ec"."category_id")))
  WHERE ("c"."distributor_id" = "public"."auth_entity_id"()))))));



CREATE POLICY "distributor_category_orders" ON "public"."orders" FOR SELECT USING ((("public"."auth_role"() = 'DISTRIBUTOR'::"text") AND ("seller_id" IN ( SELECT "ec"."entity_id"
   FROM ("public"."entity_categories" "ec"
     JOIN "public"."categories" "c" ON (("c"."id" = "ec"."category_id")))
  WHERE ("c"."distributor_id" = "public"."auth_entity_id"())))));



CREATE POLICY "entity_owners_delete_team" ON "public"."user_profiles" FOR DELETE USING ((("entity_id" = "public"."auth_entity_id"()) AND ("public"."auth_sub_role"() = 'OWNER'::"text")));



CREATE POLICY "entity_owners_manage_team" ON "public"."user_profiles" FOR INSERT WITH CHECK ((("entity_id" = "public"."auth_entity_id"()) AND ("public"."auth_sub_role"() = 'OWNER'::"text")));



CREATE POLICY "entity_owners_read_team" ON "public"."user_profiles" FOR SELECT USING ((("entity_id" = "public"."auth_entity_id"()) AND ("public"."auth_sub_role"() = ANY (ARRAY['OWNER'::"text", 'MANAGER'::"text"]))));



CREATE POLICY "entity_owners_update_team" ON "public"."user_profiles" FOR UPDATE USING ((("entity_id" = "public"."auth_entity_id"()) AND ("public"."auth_sub_role"() = 'OWNER'::"text")));



ALTER TABLE "public"."hsn_master" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_own_entity" ON "public"."inventory_movements" USING (("public"."is_super_admin"() OR ("entity_id" = "public"."auth_entity_id"())));



CREATE POLICY "order_items_buyer_insert" ON "public"."order_items" FOR INSERT WITH CHECK (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."buyer_id" = "public"."auth_entity_id"()))));



CREATE POLICY "order_items_buyer_read" ON "public"."order_items" FOR SELECT USING (("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."buyer_id" = "public"."auth_entity_id"()))));



CREATE POLICY "payment_attempts_manager_plus" ON "public"."payment_attempts" FOR SELECT USING (("public"."is_super_admin"() OR (("public"."auth_sub_role"() = ANY (ARRAY['MANAGER'::"text", 'OWNER'::"text", 'ADMIN'::"text"])) AND ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."seller_id" = "public"."auth_entity_id"()))))));



ALTER TABLE "public"."pos_order_counters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_entity_update" ON "public"."products" FOR UPDATE USING ((("created_by" = "public"."auth_entity_id"()) OR "public"."is_super_admin"()));



CREATE POLICY "products_entity_write" ON "public"."products" FOR INSERT WITH CHECK (("created_by" = "public"."auth_entity_id"()));



CREATE POLICY "products_public_read" ON "public"."products" FOR SELECT USING (true);



CREATE POLICY "refunds_own_entity" ON "public"."refunds" USING (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."seller_id" = "public"."auth_entity_id"())))));



CREATE POLICY "retailer_create_wholesale_order" ON "public"."orders" FOR INSERT WITH CHECK ((("buyer_id" = "public"."auth_entity_id"()) AND ("order_type" = 'WHOLESALE'::"text")));



CREATE POLICY "retailer_own_connections" ON "public"."retailer_wholesalers" FOR SELECT USING (("retailer_id" = "public"."auth_entity_id"()));



CREATE POLICY "retailer_own_entity" ON "public"."entities" FOR SELECT USING ((("public"."auth_role"() = 'RETAILER'::"text") AND ("id" = "public"."auth_entity_id"())));



CREATE POLICY "retailer_read_connected_wholesalers" ON "public"."entities" FOR SELECT USING ((("public"."auth_role"() = 'RETAILER'::"text") AND ("id" IN ( SELECT "retailer_wholesalers"."wholesaler_id"
   FROM "public"."retailer_wholesalers"
  WHERE (("retailer_wholesalers"."retailer_id" = "public"."auth_entity_id"()) AND ("retailer_wholesalers"."active" = true))))));



CREATE POLICY "seller_own_order_status_logs" ON "public"."order_status_log" USING (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."seller_id" = "public"."auth_entity_id"()))))) WITH CHECK (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."seller_id" = "public"."auth_entity_id"())))));



CREATE POLICY "seller_own_orders" ON "public"."orders" USING (("seller_id" = "public"."auth_entity_id"())) WITH CHECK (("seller_id" = "public"."auth_entity_id"()));



CREATE POLICY "service_role_all_entities" ON "public"."entities" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "service_role_all_user_profiles" ON "public"."user_profiles" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "service_role_insert_entities" ON "public"."entities" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "service_role_insert_user_profiles" ON "public"."user_profiles" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "super_admin_all_entities" ON "public"."entities" USING ("public"."is_super_admin"());



CREATE POLICY "super_admin_all_orders" ON "public"."orders" USING ("public"."is_super_admin"());



CREATE POLICY "super_admins_manage_hsn_master" ON "public"."hsn_master" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."role" = 'SUPER_ADMIN'::"text")))));



CREATE POLICY "system_order_status_logs" ON "public"."order_status_log" USING (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."seller_id" = "public"."auth_entity_id"()))) OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE ("orders"."buyer_id" = "public"."auth_entity_id"()))))) WITH CHECK (("public"."is_super_admin"() OR ("order_id" IN ( SELECT "orders"."id"
   FROM "public"."orders"
  WHERE (("orders"."seller_id" = "public"."auth_entity_id"()) OR ("orders"."buyer_id" = "public"."auth_entity_id"()))))));



ALTER TABLE "public"."terminal_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_read_own_profile" ON "public"."user_profiles" FOR SELECT USING ((("auth"."uid"() = "id") OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



CREATE POLICY "users_update_own_profile" ON "public"."user_profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "wholesaler_own_connections" ON "public"."retailer_wholesalers" FOR SELECT USING (("wholesaler_id" = "public"."auth_entity_id"()));



CREATE POLICY "wholesaler_retailer_orders" ON "public"."orders" FOR SELECT USING ((("public"."auth_role"() = 'WHOLESALER'::"text") AND ("seller_id" IN ( SELECT "retailer_wholesalers"."retailer_id"
   FROM "public"."retailer_wholesalers"
  WHERE (("retailer_wholesalers"."wholesaler_id" = "public"."auth_entity_id"()) AND ("retailer_wholesalers"."active" = true))))));



CREATE POLICY "wholesaler_sees_retailers" ON "public"."entities" FOR SELECT USING ((("public"."auth_role"() = 'WHOLESALER'::"text") AND (("id" = "public"."auth_entity_id"()) OR ("id" IN ( SELECT "retailer_wholesalers"."retailer_id"
   FROM "public"."retailer_wholesalers"
  WHERE (("retailer_wholesalers"."wholesaler_id" = "public"."auth_entity_id"()) AND ("retailer_wholesalers"."active" = true)))))));



CREATE POLICY "wholesaler_update_own_entity" ON "public"."entities" FOR UPDATE USING ((("id" = "public"."auth_entity_id"()) AND ("public"."auth_role"() = ANY (ARRAY['WHOLESALER'::"text", 'DISTRIBUTOR'::"text"]))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_inventory_movement"() TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_synced_khata_txn"("p_account_id" "uuid", "p_external_id" "text", "p_type" "text", "p_amount" numeric, "p_order_id" "uuid", "p_notes" "text", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_synced_khata_txn"("p_account_id" "uuid", "p_external_id" "text", "p_type" "text", "p_amount" numeric, "p_order_id" "uuid", "p_notes" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_synced_khata_txn"("p_account_id" "uuid", "p_external_id" "text", "p_type" "text", "p_amount" numeric, "p_order_id" "uuid", "p_notes" "text", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_order_item_discount"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_order_item_discount"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_order_item_discount"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_entity_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_entity_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_entity_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_sub_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_sub_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_sub_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_deplete_batch"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_deplete_batch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_deplete_batch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_product_categories_from_hsn"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_product_categories_from_hsn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_product_categories_from_hsn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_stock_predictions"("p_entity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_stock_predictions"("p_entity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_stock_predictions"("p_entity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_cart_on_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."convert_cart_on_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_cart_on_confirm"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "supabase_auth_admin";



GRANT ALL ON FUNCTION "public"."deduct_stock_on_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_stock_on_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_stock_on_confirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_stock_on_sales_invoice"() TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_stock_on_sales_invoice"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_stock_on_sales_invoice"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_face_profile"("p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_face_profile"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_face_profile"("p_profile_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."expire_stale_batches"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_stale_batches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_stale_batches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fuzzy_match_product"("p_name" "text", "p_entity_id" "uuid", "p_threshold" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."fuzzy_match_product"("p_name" "text", "p_entity_id" "uuid", "p_threshold" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuzzy_match_product"("p_name" "text", "p_entity_id" "uuid", "p_threshold" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hsn_category_tree"("p_hsn_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hsn_category_tree"("p_hsn_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hsn_category_tree"("p_hsn_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_hsn_properties"("p_hsn_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_hsn_properties"("p_hsn_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_hsn_properties"("p_hsn_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_stock_on_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_stock_on_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_stock_on_confirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."khata_apply_repayment"() TO "anon";
GRANT ALL ON FUNCTION "public"."khata_apply_repayment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."khata_apply_repayment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."khata_credit_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."khata_credit_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."khata_credit_on_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."khata_debit_on_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."khata_debit_on_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."khata_debit_on_confirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_product_price_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_product_price_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_product_price_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_pos_order_no"("p_seller_id" "uuid", "p_prefix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."next_pos_order_no"("p_seller_id" "uuid", "p_prefix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_pos_order_no"("p_seller_id" "uuid", "p_prefix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."package_available_qty"("p_package_id" "uuid", "p_depth" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."package_available_qty"("p_package_id" "uuid", "p_depth" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."package_available_qty"("p_package_id" "uuid", "p_depth" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_package_to_leaves"("p_package_id" "uuid", "p_multiplier" integer, "p_depth" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_package_to_leaves"("p_package_id" "uuid", "p_multiplier" integer, "p_depth" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_package_to_leaves"("p_package_id" "uuid", "p_multiplier" integer, "p_depth" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_buyer_on_delivery"() TO "anon";
GRANT ALL ON FUNCTION "public"."restock_buyer_on_delivery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_buyer_on_delivery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restock_on_invoice_confirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."restock_on_invoice_confirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_on_invoice_confirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_stock_on_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_stock_on_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_stock_on_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_stock_on_item_cancel"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_stock_on_item_cancel"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_stock_on_item_cancel"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_stock_on_item_refund"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_stock_on_item_refund"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_stock_on_item_refund"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reverse_khata_on_refund"("p_order_id" "uuid", "p_amount" numeric, "p_created_by" "uuid", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_khata_on_refund"("p_order_id" "uuid", "p_amount" numeric, "p_created_by" "uuid", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_khata_on_refund"("p_order_id" "uuid", "p_amount" numeric, "p_created_by" "uuid", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_batch_quantity"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_batch_quantity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_batch_quantity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_entity_product_category_from_hsn"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_entity_product_category_from_hsn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_entity_product_category_from_hsn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_entity_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_hsn_master_id_from_code_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_product_category_from_hsn"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_product_category_from_hsn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_product_category_from_hsn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."cart_items" TO "anon";
GRANT ALL ON TABLE "public"."cart_items" TO "authenticated";
GRANT ALL ON TABLE "public"."cart_items" TO "service_role";



GRANT ALL ON TABLE "public"."carts" TO "anon";
GRANT ALL ON TABLE "public"."carts" TO "authenticated";
GRANT ALL ON TABLE "public"."carts" TO "service_role";



GRANT ALL ON TABLE "public"."cash_registers" TO "anon";
GRANT ALL ON TABLE "public"."cash_registers" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_registers" TO "service_role";



GRANT ALL ON TABLE "public"."categories" TO "anon";
GRANT ALL ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT ALL ON TABLE "public"."category_properties" TO "anon";
GRANT ALL ON TABLE "public"."category_properties" TO "authenticated";
GRANT ALL ON TABLE "public"."category_properties" TO "service_role";



GRANT ALL ON TABLE "public"."consumer_accounts" TO "anon";
GRANT ALL ON TABLE "public"."consumer_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."consumer_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."draft_purchase_items" TO "anon";
GRANT ALL ON TABLE "public"."draft_purchase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_purchase_items" TO "service_role";



GRANT ALL ON TABLE "public"."draft_purchases" TO "anon";
GRANT ALL ON TABLE "public"."draft_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."draft_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."entities" TO "anon";
GRANT ALL ON TABLE "public"."entities" TO "authenticated";
GRANT ALL ON TABLE "public"."entities" TO "service_role";



GRANT ALL ON TABLE "public"."entity_categories" TO "anon";
GRANT ALL ON TABLE "public"."entity_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_categories" TO "service_role";



GRANT ALL ON TABLE "public"."entity_packages" TO "anon";
GRANT ALL ON TABLE "public"."entity_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_packages" TO "service_role";



GRANT ALL ON TABLE "public"."entity_product_specifications" TO "anon";
GRANT ALL ON TABLE "public"."entity_product_specifications" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_product_specifications" TO "service_role";



GRANT ALL ON TABLE "public"."entity_products" TO "anon";
GRANT ALL ON TABLE "public"."entity_products" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_products" TO "service_role";



GRANT ALL ON TABLE "public"."hsn_master" TO "anon";
GRANT ALL ON TABLE "public"."hsn_master" TO "authenticated";
GRANT ALL ON TABLE "public"."hsn_master" TO "service_role";



GRANT ALL ON TABLE "public"."entity_products_with_hsn" TO "anon";
GRANT ALL ON TABLE "public"."entity_products_with_hsn" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_products_with_hsn" TO "service_role";



GRANT ALL ON TABLE "public"."face_profiles" TO "anon";
GRANT ALL ON TABLE "public"."face_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."face_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."hsn_code_properties" TO "anon";
GRANT ALL ON TABLE "public"."hsn_code_properties" TO "authenticated";
GRANT ALL ON TABLE "public"."hsn_code_properties" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_movements" TO "anon";
GRANT ALL ON TABLE "public"."inventory_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";



GRANT ALL ON TABLE "public"."khata_accounts" TO "anon";
GRANT ALL ON TABLE "public"."khata_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."khata_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."khata_alerts" TO "anon";
GRANT ALL ON TABLE "public"."khata_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."khata_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."khata_repayments" TO "anon";
GRANT ALL ON TABLE "public"."khata_repayments" TO "authenticated";
GRANT ALL ON TABLE "public"."khata_repayments" TO "service_role";



GRANT ALL ON TABLE "public"."khata_transactions" TO "anon";
GRANT ALL ON TABLE "public"."khata_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."khata_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."order_cancellation_items" TO "anon";
GRANT ALL ON TABLE "public"."order_cancellation_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_cancellation_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_status_log" TO "anon";
GRANT ALL ON TABLE "public"."order_status_log" TO "authenticated";
GRANT ALL ON TABLE "public"."order_status_log" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."owner_stores" TO "anon";
GRANT ALL ON TABLE "public"."owner_stores" TO "authenticated";
GRANT ALL ON TABLE "public"."owner_stores" TO "service_role";



GRANT ALL ON TABLE "public"."package_items" TO "anon";
GRANT ALL ON TABLE "public"."package_items" TO "authenticated";
GRANT ALL ON TABLE "public"."package_items" TO "service_role";



GRANT ALL ON TABLE "public"."product_packages" TO "anon";
GRANT ALL ON TABLE "public"."product_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."product_packages" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."package_contents" TO "anon";
GRANT ALL ON TABLE "public"."package_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."package_contents" TO "service_role";



GRANT ALL ON TABLE "public"."payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."pos_order_counters" TO "anon";
GRANT ALL ON TABLE "public"."pos_order_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."pos_order_counters" TO "service_role";



GRANT ALL ON TABLE "public"."product_batches" TO "anon";
GRANT ALL ON TABLE "public"."product_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."product_batches" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."product_price_history" TO "anon";
GRANT ALL ON TABLE "public"."product_price_history" TO "authenticated";
GRANT ALL ON TABLE "public"."product_price_history" TO "service_role";



GRANT ALL ON TABLE "public"."products_with_hsn" TO "anon";
GRANT ALL ON TABLE "public"."products_with_hsn" TO "authenticated";
GRANT ALL ON TABLE "public"."products_with_hsn" TO "service_role";



GRANT ALL ON TABLE "public"."refunds" TO "anon";
GRANT ALL ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON TABLE "public"."replacements" TO "anon";
GRANT ALL ON TABLE "public"."replacements" TO "authenticated";
GRANT ALL ON TABLE "public"."replacements" TO "service_role";



GRANT ALL ON TABLE "public"."retailer_wholesalers" TO "anon";
GRANT ALL ON TABLE "public"."retailer_wholesalers" TO "authenticated";
GRANT ALL ON TABLE "public"."retailer_wholesalers" TO "service_role";



GRANT ALL ON TABLE "public"."riders" TO "anon";
GRANT ALL ON TABLE "public"."riders" TO "authenticated";
GRANT ALL ON TABLE "public"."riders" TO "service_role";



GRANT ALL ON TABLE "public"."sellable_products" TO "anon";
GRANT ALL ON TABLE "public"."sellable_products" TO "authenticated";
GRANT ALL ON TABLE "public"."sellable_products" TO "service_role";



GRANT ALL ON TABLE "public"."shift_reconciliations" TO "anon";
GRANT ALL ON TABLE "public"."shift_reconciliations" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_reconciliations" TO "service_role";



GRANT ALL ON TABLE "public"."shift_transactions" TO "anon";
GRANT ALL ON TABLE "public"."shift_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."stock_predictions" TO "anon";
GRANT ALL ON TABLE "public"."stock_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_predictions" TO "service_role";



GRANT ALL ON TABLE "public"."supplier_lead_times" TO "anon";
GRANT ALL ON TABLE "public"."supplier_lead_times" TO "authenticated";
GRANT ALL ON TABLE "public"."supplier_lead_times" TO "service_role";



GRANT ALL ON TABLE "public"."terminal_tokens" TO "anon";
GRANT ALL ON TABLE "public"."terminal_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."terminal_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."whatsapp_otps" TO "anon";
GRANT ALL ON TABLE "public"."whatsapp_otps" TO "authenticated";
GRANT ALL ON TABLE "public"."whatsapp_otps" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- ── Licenses — desktop .lic issuance / revocation (super-admin issued) ──────────
-- A signed .lic activates + provisions a terminal (it carries entity + sync token +
-- ingest URL). This row records each issued license for revocation + audit; the
-- plaintext sync token lives only inside the .lic and as sha256 in terminal_tokens.
-- Service-role only (RLS on, no policy — the issuer route gates super-admin in code
-- and uses the service client), mirroring terminal_tokens / pos_order_counters.
CREATE TABLE IF NOT EXISTS "public"."licenses" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lic_id"      uuid NOT NULL UNIQUE,
  "entity_id"   uuid NOT NULL REFERENCES "public"."entities"("id") ON DELETE CASCADE,
  "machine_id"  text NOT NULL,
  "token_id"    uuid REFERENCES "public"."terminal_tokens"("id") ON DELETE SET NULL,
  "tier"        text NOT NULL DEFAULT 'STANDARD',
  "label"       text,
  "issued_at"   timestamptz NOT NULL DEFAULT now(),
  "expires_at"  timestamptz NOT NULL,
  "is_active"   boolean NOT NULL DEFAULT true,
  "created_by"  uuid REFERENCES "public"."user_profiles"("id"),
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_licenses_entity" ON "public"."licenses" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_licenses_lic_id" ON "public"."licenses" ("lic_id");
ALTER TABLE "public"."licenses" ENABLE ROW LEVEL SECURITY;

-- ── License requests — a new POS terminal self-registers its machine_id on first start
-- (before it has a .lic), so the super-admin issues the license with the machine_id
-- PRE-FILLED (no manual typing → no typos). One row per machine (unique). Service-role
-- only (the public terminal endpoint + the issuer route use the service client).
CREATE TABLE IF NOT EXISTS "public"."license_requests" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "machine_id"   text NOT NULL UNIQUE,
  "hostname"     text,
  "app_version"  text,
  "status"       text NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ISSUED', 'REJECTED')),
  "license_id"   uuid REFERENCES "public"."licenses"("id") ON DELETE SET NULL,
  "requested_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "public"."license_requests" ENABLE ROW LEVEL SECURITY;







