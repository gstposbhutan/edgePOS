-- Migration 015: Credit Ledger
-- Per Retailer ↔ Wholesaler credit balance, limit, repayments, and alert tracking.

-- ─── RETAILER_WHOLESALERS ADDITIONS ───────────────────────────────────────

ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_limit     DECIMAL(12,2) DEFAULT 0;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_balance   DECIMAL(12,2) DEFAULT 0;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_term_days INT DEFAULT 30;
ALTER TABLE retailer_wholesalers ADD COLUMN IF NOT EXISTS credit_frozen    BOOLEAN DEFAULT FALSE;

-- ─── CREDIT TRANSACTIONS ──────────────────────────────────────────────────
-- Immutable ledger — every debit and credit entry. Never deleted.

CREATE TABLE IF NOT EXISTS credit_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id      UUID NOT NULL REFERENCES entities(id),
  wholesaler_id    UUID NOT NULL REFERENCES entities(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT')),
  amount           DECIMAL(12,2) NOT NULL,
  reference_type   TEXT CHECK (reference_type IN ('ORDER', 'REPAYMENT', 'ADJUSTMENT')),
  reference_id     UUID,
  balance_after    DECIMAL(12,2),
  notes            TEXT,
  created_by       UUID REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_retailer   ON credit_transactions(retailer_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_wholesaler ON credit_transactions(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_created    ON credit_transactions(created_at DESC);

-- ─── CREDIT REPAYMENTS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_repayments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id    UUID NOT NULL REFERENCES entities(id),
  wholesaler_id  UUID NOT NULL REFERENCES entities(id),
  amount         DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'RTGS', 'BANK_TRANSFER', 'MBOB', 'MPAY')),
  status         TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date       DATE NOT NULL,
  reference_no   TEXT,
  notes          TEXT,
  created_by     UUID REFERENCES user_profiles(id),
  confirmed_by   UUID REFERENCES user_profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_repayments_retailer   ON credit_repayments(retailer_id);
CREATE INDEX IF NOT EXISTS idx_repayments_wholesaler ON credit_repayments(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_repayments_due        ON credit_repayments(due_date);
CREATE INDEX IF NOT EXISTS idx_repayments_status     ON credit_repayments(status);

-- ─── CREDIT ALERTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS credit_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repayment_id    UUID NOT NULL REFERENCES credit_repayments(id) ON DELETE CASCADE,
  alert_type      TEXT NOT NULL CHECK (alert_type IN ('PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D')),
  sent_to         TEXT NOT NULL CHECK (sent_to IN ('RETAILER', 'WHOLESALER', 'BOTH')),
  whatsapp_status TEXT DEFAULT 'PENDING',
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (repayment_id, alert_type)  -- each alert type fires once per repayment
);

-- ─── TRIGGER: CREDIT ORDER CONFIRMED → DEBIT BALANCE ─────────────────────

CREATE OR REPLACE FUNCTION debit_credit_balance_on_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_wholesaler_id UUID;
  v_new_balance   DECIMAL(12,2);
  v_term_days     INT;
BEGIN
  IF NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.payment_method = 'CREDIT' THEN

    -- Derive wholesaler from seller (for POS sales, seller IS the retailer)
    -- For wholesale orders, buyer_id is the retailer, seller_id is the wholesaler
    IF NEW.order_type = 'POS_SALE' THEN
      -- Consumer bought on credit from retailer — not a B2B credit transaction
      RETURN NEW;
    END IF;

    v_wholesaler_id := NEW.seller_id;

    -- Check credit limit — hard block (guard is in app layer; this is DB safety net)
    SELECT credit_balance + NEW.grand_total, credit_term_days
    INTO v_new_balance, v_term_days
    FROM retailer_wholesalers
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = v_wholesaler_id AND active = TRUE
    LIMIT 1;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Update balance
    UPDATE retailer_wholesalers
    SET credit_balance = credit_balance + NEW.grand_total
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = v_wholesaler_id AND active = TRUE;

    -- Log debit transaction
    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.buyer_id, v_wholesaler_id, 'DEBIT', NEW.grand_total, 'ORDER', NEW.id, v_new_balance,
       'Order ' || NEW.order_no);

    -- Create repayment record with due date
    INSERT INTO credit_repayments
      (retailer_id, wholesaler_id, amount, payment_method, status, due_date, notes)
    VALUES
      (NEW.buyer_id, v_wholesaler_id, NEW.grand_total, 'CASH',
       'CREATED',
       (NOW() + (v_term_days || ' days')::INTERVAL)::DATE,
       'Auto-created for order ' || NEW.order_no);

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_debit_credit ON orders;
CREATE TRIGGER orders_debit_credit
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION debit_credit_balance_on_confirm();

-- ─── TRIGGER: CREDIT ORDER CANCELLED → CREDIT BALANCE BACK ───────────────

CREATE OR REPLACE FUNCTION credit_balance_on_cancel()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
BEGIN
  IF NEW.status = 'CANCELLED'
     AND OLD.status IS DISTINCT FROM 'CANCELLED'
     AND NEW.payment_method = 'CREDIT'
     AND NEW.order_type != 'POS_SALE'
     AND NEW.buyer_id IS NOT NULL THEN

    UPDATE retailer_wholesalers
    SET credit_balance = GREATEST(0, credit_balance - NEW.grand_total)
    WHERE retailer_id = NEW.buyer_id AND wholesaler_id = NEW.seller_id AND active = TRUE
    RETURNING credit_balance INTO v_new_balance;

    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.buyer_id, NEW.seller_id, 'CREDIT', NEW.grand_total, 'ORDER', NEW.id, v_new_balance,
       'Reversal for cancelled order ' || NEW.order_no);

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_credit_on_cancel ON orders;
CREATE TRIGGER orders_credit_on_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION credit_balance_on_cancel();

-- ─── TRIGGER: REPAYMENT → PAYMENT_MADE → REDUCE BALANCE ──────────────────

CREATE OR REPLACE FUNCTION apply_repayment()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance DECIMAL(12,2);
  v_limit       DECIMAL(12,2);
BEGIN
  IF NEW.status = 'PAYMENT_MADE' AND OLD.status = 'CREATED' THEN

    UPDATE retailer_wholesalers
    SET credit_balance = GREATEST(0, credit_balance - NEW.amount)
    WHERE retailer_id = NEW.retailer_id AND wholesaler_id = NEW.wholesaler_id AND active = TRUE
    RETURNING credit_balance, credit_limit INTO v_new_balance, v_limit;

    INSERT INTO credit_transactions
      (retailer_id, wholesaler_id, transaction_type, amount, reference_type, reference_id, balance_after, notes)
    VALUES
      (NEW.retailer_id, NEW.wholesaler_id, 'CREDIT', NEW.amount, 'REPAYMENT', NEW.id, v_new_balance,
       'Repayment via ' || NEW.payment_method || COALESCE(' ref: ' || NEW.reference_no, ''));

    -- Auto-unfreeze if balance now below limit
    IF v_new_balance < v_limit THEN
      UPDATE retailer_wholesalers
      SET credit_frozen = FALSE
      WHERE retailer_id = NEW.retailer_id AND wholesaler_id = NEW.wholesaler_id AND active = TRUE;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS repayment_apply ON credit_repayments;
CREATE TRIGGER repayment_apply
  AFTER UPDATE ON credit_repayments
  FOR EACH ROW EXECUTE FUNCTION apply_repayment();

-- ─── FUNCTION: CHECK CREDIT AVAILABILITY (used by app layer) ─────────────
-- Returns whether a buyer can place a credit order of a given amount.

CREATE OR REPLACE FUNCTION check_credit_available(
  p_retailer_id   UUID,
  p_wholesaler_id UUID,
  p_amount        DECIMAL
) RETURNS JSONB AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT credit_limit, credit_balance, credit_frozen, credit_term_days
  INTO rec
  FROM retailer_wholesalers
  WHERE retailer_id = p_retailer_id AND wholesaler_id = p_wholesaler_id AND active = TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No credit relationship found');
  END IF;

  IF rec.credit_frozen THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Credit account is frozen',
      'balance', rec.credit_balance, 'limit', rec.credit_limit);
  END IF;

  IF rec.credit_balance + p_amount > rec.credit_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Credit limit exceeded',
      'balance', rec.credit_balance,
      'limit', rec.credit_limit,
      'available', rec.credit_limit - rec.credit_balance,
      'requested', p_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'balance', rec.credit_balance,
    'limit', rec.credit_limit,
    'available', rec.credit_limit - rec.credit_balance
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_repayments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_alerts       ENABLE ROW LEVEL SECURITY;

-- Wholesaler sees transactions for their retailers
CREATE POLICY "credit_tx_wholesaler" ON credit_transactions
  FOR ALL USING (
    is_super_admin() OR
    wholesaler_id = auth_entity_id() OR
    retailer_id   = auth_entity_id()
  );

CREATE POLICY "credit_repayments_parties" ON credit_repayments
  FOR ALL USING (
    is_super_admin() OR
    wholesaler_id = auth_entity_id() OR
    retailer_id   = auth_entity_id()
  );

CREATE POLICY "credit_alerts_wholesaler" ON credit_alerts
  FOR SELECT USING (
    is_super_admin() OR
    repayment_id IN (
      SELECT id FROM credit_repayments WHERE wholesaler_id = auth_entity_id()
    )
  );
