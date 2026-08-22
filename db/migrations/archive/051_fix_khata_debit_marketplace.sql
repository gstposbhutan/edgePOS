-- Migration 051: Fix khata_debit_on_confirm for MARKETPLACE orders
-- MARKETPLACE orders placed by vendors on behalf of consumers should use
-- party_type = 'CONSUMER' and match by buyer_whatsapp, not buyer_id.

CREATE OR REPLACE FUNCTION public.khata_debit_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
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

    -- POS_SALE and MARKETPLACE orders with a consumer phone → CONSUMER party type
    IF NEW.order_type IN ('POS_SALE', 'MARKETPLACE') AND NEW.buyer_whatsapp IS NOT NULL THEN
      v_debtor_phone  := NEW.buyer_whatsapp;
      v_debtor_entity := NULL;
      v_party_type    := 'CONSUMER';

    -- Wholesale orders → RETAILER party type matched by buyer_id
    ELSIF NEW.order_type = 'WHOLESALE' THEN
      v_debtor_phone  := NULL;
      v_debtor_entity := NEW.buyer_id;
      v_party_type    := 'RETAILER';

    ELSE
      -- No khata debit for other order types / configurations
      RETURN NEW;
    END IF;

    -- Look up the khata account
    SELECT id, credit_term_days INTO v_account_id, v_term_days
    FROM khata_accounts
    WHERE creditor_entity_id = NEW.seller_id
      AND party_type = v_party_type
      AND (
        (v_debtor_phone IS NOT NULL   AND debtor_phone = v_debtor_phone) OR
        (v_debtor_entity IS NOT NULL  AND debtor_entity_id = v_debtor_entity)
      )
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
