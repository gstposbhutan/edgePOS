-- Fix: confirming a CREDIT Purchase Invoice failed with "No active khata account found".
-- khata_debit_on_confirm is a SELL-SIDE / wholesale-buy debit (creditor = seller). For a
-- PURCHASE_INVOICE the roles are inverted (the vendor owes the supplier) and the supplier
-- khata is handled by the purchases confirm route — so this trigger must skip purchase docs.
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
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type NOT IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE') THEN

    IF NEW.order_type = 'POS_SALE' THEN
      v_debtor_phone  := NEW.buyer_whatsapp;
      v_debtor_entity := NULL;
      v_party_type    := 'CONSUMER';
    ELSE
      v_debtor_phone  := NULL;
      v_debtor_entity := NEW.buyer_id;
      v_party_type    := 'RETAILER';
    END IF;

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

    IF (SELECT outstanding_balance + NEW.grand_total > credit_limit
        FROM khata_accounts WHERE id = v_account_id) THEN
      RAISE EXCEPTION 'Credit limit exceeded for khata account %', v_account_id;
    END IF;

    UPDATE khata_accounts
    SET outstanding_balance = outstanding_balance + NEW.grand_total,
        updated_at = NOW()
    WHERE id = v_account_id
    RETURNING outstanding_balance INTO v_new_balance;

    SELECT id INTO v_profile_id FROM user_profiles WHERE id = NEW.created_by LIMIT 1;
    IF NOT FOUND THEN v_profile_id := NEW.created_by; END IF;

    INSERT INTO khata_transactions
      (khata_account_id, order_id, transaction_type, amount, balance_after, notes, created_by)
    VALUES
      (v_account_id, NEW.id, 'DEBIT', NEW.grand_total, v_new_balance,
       'Order ' || NEW.order_no, v_profile_id);

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
