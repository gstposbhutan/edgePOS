-- Migration 022: Unified Khata — Credit Ledger for All Parties (F-KHATA-001)
-- Replaces old B2B credit system (migration 015) with unified tables
-- supporting CONSUMER, RETAILER, and WHOLESALER party types.

-- ─── DROP OLD TRIGGERS AND FUNCTIONS ───────────────────────────────────────

DROP TRIGGER IF EXISTS orders_debit_credit ON orders;
DROP TRIGGER IF EXISTS orders_credit_on_cancel ON orders;
DROP TRIGGER IF EXISTS repayment_apply ON credit_repayments;

DROP FUNCTION IF EXISTS debit_credit_balance_on_confirm() CASCADE;
DROP FUNCTION IF EXISTS credit_balance_on_cancel() CASCADE;
DROP FUNCTION IF EXISTS apply_repayment() CASCADE;
DROP FUNCTION IF EXISTS check_credit_available(UUID, UUID, DECIMAL) CASCADE;

-- ─── DROP OLD TABLES ───────────────────────────────────────────────────────

DROP TABLE IF EXISTS credit_alerts;
DROP TABLE IF EXISTS credit_repayments;
DROP TABLE IF EXISTS credit_transactions;

-- Drop consumer credit tables if they exist (from old F-KHATA-001 draft)
DROP TABLE IF EXISTS consumer_credit_alerts;
DROP TABLE IF EXISTS consumer_credit_transactions;
DROP TABLE IF EXISTS consumer_accounts;

-- ─── REMOVE OLD CREDIT COLUMNS FROM retailer_wholesalers ───────────────────

ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_limit;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_balance;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_term_days;
ALTER TABLE retailer_wholesalers DROP COLUMN IF EXISTS credit_frozen;

-- ─── KHATA ACCOUNTS ───────────────────────────────────────────────────────
-- One row per creditor-debtor relationship.
-- Consumer accounts keyed on (creditor_entity_id, debtor_phone).
-- Business accounts keyed on (creditor_entity_id, debtor_entity_id).

CREATE TABLE khata_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_entity_id    UUID NOT NULL REFERENCES entities(id),
  party_type            TEXT NOT NULL CHECK (party_type IN ('CONSUMER', 'RETAILER', 'WHOLESALER')),
  debtor_entity_id      UUID REFERENCES entities(id),
  debtor_phone          TEXT,
  debtor_name           TEXT,
  debtor_face_id_hash   TEXT,
  credit_limit          DECIMAL(12,2) NOT NULL DEFAULT 0,
  outstanding_balance   DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit_term_days      INT NOT NULL DEFAULT 30,
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  last_payment_at       TIMESTAMPTZ,
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_khata_creditor_debtor UNIQUE (creditor_entity_id, debtor_entity_id, debtor_phone)
);

CREATE INDEX idx_khata_accounts_creditor ON khata_accounts(creditor_entity_id);
CREATE INDEX idx_khata_accounts_debtor_entity ON khata_accounts(debtor_entity_id) WHERE debtor_entity_id IS NOT NULL;
CREATE INDEX idx_khata_accounts_debtor_phone ON khata_accounts(debtor_phone) WHERE debtor_phone IS NOT NULL;
CREATE INDEX idx_khata_accounts_status ON khata_accounts(status) WHERE status = 'ACTIVE';

-- ─── KHATA TRANSACTIONS ───────────────────────────────────────────────────
-- Immutable ledger — every debit, credit, and adjustment for any khata account.

CREATE TABLE khata_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  order_id              UUID,
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT', 'ADJUSTMENT')),
  amount                DECIMAL(12,2) NOT NULL,
  balance_after         DECIMAL(12,2) NOT NULL,
  payment_method        TEXT CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  notes                 TEXT,
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_khata_txn_account ON khata_transactions(khata_account_id);
CREATE INDEX idx_khata_txn_date ON khata_transactions(created_at DESC);
CREATE INDEX idx_khata_txn_order ON khata_transactions(order_id) WHERE order_id IS NOT NULL;

-- ─── KHATA REPAYMENTS ─────────────────────────────────────────────────────

CREATE TABLE khata_repayments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  amount                DECIMAL(12,2) NOT NULL,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  status                TEXT NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date              DATE,
  reference_no          TEXT,
  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id),
  confirmed_by          UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ
);

CREATE INDEX idx_khata_repayments_account ON khata_repayments(khata_account_id);
CREATE INDEX idx_khata_repayments_due ON khata_repayments(due_date) WHERE due_date IS NOT NULL AND status = 'CREATED';

-- ─── KHATA ALERTS ─────────────────────────────────────────────────────────

CREATE TABLE khata_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  repayment_id          UUID REFERENCES khata_repayments(id),
  alert_type            TEXT NOT NULL CHECK (alert_type IN (
                            'PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D',
                            'OVERDUE_30D', 'MONTHLY_REMINDER')),
  sent_to               TEXT NOT NULL CHECK (sent_to IN ('CREDITOR', 'DEBTOR', 'BOTH')),
  whatsapp_status       TEXT DEFAULT 'PENDING'
                          CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  sent_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_khata_alerts_account ON khata_alerts(khata_account_id);

-- ─── TRIGGER: KHATA ORDER CONFIRMED → DEBIT BALANCE ───────────────────────
-- Fires when a CREDIT order transitions to CONFIRMED.
-- For POS_SALE: uses khata_accounts by (creditor_entity_id=seller, debtor_phone=buyer_whatsapp, party_type='CONSUMER').
-- For B2B: uses khata_accounts by (creditor_entity_id=seller, debtor_entity_id=buyer_id, party_type).

CREATE OR REPLACE FUNCTION khata_debit_on_confirm()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_khata_debit ON orders;
CREATE TRIGGER orders_khata_debit
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION khata_debit_on_confirm();

-- ─── TRIGGER: KHATA ORDER CANCELLED → CREDIT BALANCE BACK ─────────────────

CREATE OR REPLACE FUNCTION khata_credit_on_cancel()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_khata_cancel ON orders;
CREATE TRIGGER orders_khata_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION khata_credit_on_cancel();

-- ─── TRIGGER: REPAYMENT PAYMENT_MADE → REDUCE BALANCE ─────────────────────

CREATE OR REPLACE FUNCTION khata_apply_repayment()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS khata_repayment_apply ON khata_repayments;
CREATE TRIGGER khata_repayment_apply
  AFTER UPDATE ON khata_repayments
  FOR EACH ROW EXECUTE FUNCTION khata_apply_repayment();

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE khata_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_repayments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE khata_alerts      ENABLE ROW LEVEL SECURITY;

-- Creditor entity sees their own accounts
CREATE POLICY "tenant_khata_accounts" ON khata_accounts
  FOR ALL USING (
    is_super_admin() OR
    creditor_entity_id = auth_entity_id()
  );

-- Debtor entity can view (not modify) accounts where they owe
CREATE POLICY "debtor_view_khata" ON khata_accounts
  FOR SELECT USING (
    is_super_admin() OR
    debtor_entity_id = auth_entity_id()
  );

-- Transactions visible to both creditor and debtor
CREATE POLICY "tenant_khata_transactions" ON khata_transactions
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_transactions.khata_account_id
      AND (ka.creditor_entity_id = auth_entity_id()
           OR ka.debtor_entity_id = auth_entity_id())
    )
  );

-- Repayments visible to both creditor and debtor
CREATE POLICY "tenant_khata_repayments" ON khata_repayments
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_repayments.khata_account_id
      AND (ka.creditor_entity_id = auth_entity_id()
           OR ka.debtor_entity_id = auth_entity_id())
    )
  );

-- Alerts visible to creditor only
CREATE POLICY "tenant_khata_alerts" ON khata_alerts
  FOR ALL USING (
    is_super_admin() OR
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_alerts.khata_account_id
      AND ka.creditor_entity_id = auth_entity_id()
    )
  );
