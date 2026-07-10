-- 106: split the monolithic khata debit trigger into one per debtor tier.
--
-- Before: a single trigger (orders_khata_debit → khata_debit_on_confirm) hardcoded
-- party_type='RETAILER' for EVERY entity-to-entity credit order and 'CONSUMER' only for POS_SALE.
-- That shoehorned a wholesaler debtor (distributor→wholesaler credit order) into a RETAILER-typed
-- khata, which is wrong once the tiers diverge (credit terms, ITC later).
--
-- After: three trigger functions, one per debtor tier, that PARTITION every order (exactly one owns
-- a given order) and each look up / debit the khata with its own party_type:
--   khata_debit_consumer()    — order_type = POS_SALE                          → party_type CONSUMER (by phone)
--   khata_debit_wholesaler()  — entity buyer whose role = WHOLESALER           → party_type WHOLESALER
--   khata_debit_retailer()    — any other entity buyer (catch-all, unchanged)  → party_type RETAILER
-- The retailer catch-all preserves the exact prior behaviour for retailer (and any non-wholesaler
-- entity) debtors, so nothing that worked before changes; only wholesaler debtors get correctly typed.
--
-- Purchases (PURCHASE_ORDER / PURCHASE_INVOICE) are still skipped — their supplier khata is handled
-- by the purchases confirm route (see 100_khata_debit_skip_purchases.sql).
--
-- The reverse path (khata_credit_on_cancel) already finds the account via the DEBIT khata_transaction
-- row, not by party_type, so it stays correct across tiers and needs no change here.

-- ── Shared debit body (DRY): resolve the account by its keys, enforce the limit, post the DEBIT
--    txn and (if the account has terms) the repayment. RAISES if no matching active account exists.
CREATE OR REPLACE FUNCTION "public"."_khata_apply_debit"(
  p_seller UUID, p_debtor_entity UUID, p_debtor_phone TEXT, p_party_type TEXT,
  p_order_id UUID, p_order_no TEXT, p_amount DECIMAL, p_created_by UUID
) RETURNS void
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_account_id  UUID;
  v_term_days   INT;
  v_new_balance DECIMAL(12,2);
  v_profile_id  UUID;
BEGIN
  SELECT id, credit_term_days INTO v_account_id, v_term_days
  FROM khata_accounts
  WHERE creditor_entity_id = p_seller
    AND (debtor_entity_id = p_debtor_entity OR (p_debtor_entity IS NULL AND debtor_entity_id IS NULL))
    AND (debtor_phone = p_debtor_phone OR (p_debtor_phone IS NULL AND debtor_phone IS NULL))
    AND party_type = p_party_type
    AND status IN ('ACTIVE', 'FROZEN')
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active khata account found for credit sale';
  END IF;

  IF (SELECT outstanding_balance + p_amount > credit_limit
      FROM khata_accounts WHERE id = v_account_id) THEN
    RAISE EXCEPTION 'Credit limit exceeded for khata account %', v_account_id;
  END IF;

  UPDATE khata_accounts
  SET outstanding_balance = outstanding_balance + p_amount, updated_at = NOW()
  WHERE id = v_account_id
  RETURNING outstanding_balance INTO v_new_balance;

  SELECT id INTO v_profile_id FROM user_profiles WHERE id = p_created_by LIMIT 1;
  IF NOT FOUND THEN v_profile_id := p_created_by; END IF;

  INSERT INTO khata_transactions
    (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
  VALUES
    (v_account_id, p_order_id, 'DEBIT', p_amount, v_new_balance, 'Order ' || p_order_no, v_profile_id);

  IF v_term_days > 0 THEN
    INSERT INTO khata_repayments
      (khata_account_id, amount, payment_method, status, due_date, notes, created_by)
    VALUES
      (v_account_id, p_amount, 'CASH', 'CREATED',
       (NOW() + (v_term_days || ' days')::INTERVAL)::DATE,
       'Auto-created for order ' || p_order_no, v_profile_id);
  END IF;
END;
$$;
ALTER FUNCTION "public"."_khata_apply_debit"(UUID, UUID, TEXT, TEXT, UUID, TEXT, DECIMAL, UUID) OWNER TO "postgres";

-- Common guard shared by all three: a fresh transition into CONFIRMED, on a CREDIT order that isn't
-- a purchase document.
--   (NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED'
--    AND NEW.payment_method = 'CREDIT' AND NEW.order_type NOT IN ('PURCHASE_ORDER','PURCHASE_INVOICE'))

-- ── CONSUMER tier — POS credit sale, debtor identified by phone.
CREATE OR REPLACE FUNCTION "public"."khata_debit_consumer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type NOT IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE')
     AND NEW.order_type = 'POS_SALE' THEN
    PERFORM public._khata_apply_debit(
      NEW.seller_id, NULL, NEW.buyer_whatsapp, 'CONSUMER',
      NEW.id, NEW.order_no, NEW.grand_total, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."khata_debit_consumer"() OWNER TO "postgres";

-- ── WHOLESALER tier — entity buyer whose role is WHOLESALER (distributor → wholesaler credit order).
CREATE OR REPLACE FUNCTION "public"."khata_debit_wholesaler"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type NOT IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE')
     AND NEW.order_type <> 'POS_SALE'
     AND (SELECT role FROM entities WHERE id = NEW.buyer_id) = 'WHOLESALER' THEN
    PERFORM public._khata_apply_debit(
      NEW.seller_id, NEW.buyer_id, NULL, 'WHOLESALER',
      NEW.id, NEW.order_no, NEW.grand_total, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."khata_debit_wholesaler"() OWNER TO "postgres";

-- ── RETAILER tier — catch-all for any other entity buyer (role RETAILER, or anything not WHOLESALER).
--    This preserves the previous single-trigger default (party_type='RETAILER') exactly.
CREATE OR REPLACE FUNCTION "public"."khata_debit_retailer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type NOT IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE')
     AND NEW.order_type <> 'POS_SALE'
     AND (SELECT role FROM entities WHERE id = NEW.buyer_id) IS DISTINCT FROM 'WHOLESALER' THEN
    PERFORM public._khata_apply_debit(
      NEW.seller_id, NEW.buyer_id, NULL, 'RETAILER',
      NEW.id, NEW.order_no, NEW.grand_total, NEW.created_by);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "public"."khata_debit_retailer"() OWNER TO "postgres";

-- Mirror the original function's grants for parity.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    EXECUTE format('GRANT ALL ON FUNCTION public._khata_apply_debit(UUID, UUID, TEXT, TEXT, UUID, TEXT, DECIMAL, UUID) TO %I', r);
    EXECUTE format('GRANT ALL ON FUNCTION public.khata_debit_consumer() TO %I', r);
    EXECUTE format('GRANT ALL ON FUNCTION public.khata_debit_wholesaler() TO %I', r);
    EXECUTE format('GRANT ALL ON FUNCTION public.khata_debit_retailer() TO %I', r);
  END LOOP;
END $$;

-- Swap the single trigger for the three per-tier ones (same event + same TERMINAL_SYNC guard, so
-- synced terminal orders still skip the debit — they carry their own khata state).
DROP TRIGGER IF EXISTS "orders_khata_debit" ON "public"."orders";

CREATE OR REPLACE TRIGGER "orders_khata_debit_consumer" AFTER UPDATE ON "public"."orders"
  FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text"))
  EXECUTE FUNCTION "public"."khata_debit_consumer"();

CREATE OR REPLACE TRIGGER "orders_khata_debit_wholesaler" AFTER UPDATE ON "public"."orders"
  FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text"))
  EXECUTE FUNCTION "public"."khata_debit_wholesaler"();

CREATE OR REPLACE TRIGGER "orders_khata_debit_retailer" AFTER UPDATE ON "public"."orders"
  FOR EACH ROW WHEN (("new"."origin" IS DISTINCT FROM 'TERMINAL_SYNC'::"text"))
  EXECUTE FUNCTION "public"."khata_debit_retailer"();

-- Retire the old function (its trigger is gone; nothing else calls it).
DROP FUNCTION IF EXISTS "public"."khata_debit_on_confirm"();

-- ── Data migration: re-type existing wholesaler-debtor khata accounts from the old hardcoded
--    'RETAILER' to their correct 'WHOLESALER' so the new wholesaler trigger finds them (balances
--    and history are untouched — only party_type changes).
UPDATE khata_accounts ka
SET party_type = 'WHOLESALER', updated_at = NOW()
FROM entities dr
WHERE dr.id = ka.debtor_entity_id
  AND dr.role = 'WHOLESALER'
  AND ka.party_type = 'RETAILER';
