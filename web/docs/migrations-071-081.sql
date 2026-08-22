-- ============================================================================
-- Terminal->Cloud sync: Migrations 071-081 (production apply delta)
-- Extracted verbatim from web/supabase/migrations/001_schema.sql (lines 4387-4690).
-- These were appended to 001 during development; this standalone file is the delta
-- to apply to a Supabase project that already has 001-004. Every statement is
-- idempotent (IF [NOT] EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS), so it
-- is safe to re-run. Wrap in a transaction when applying (see the checklist).
-- ============================================================================

-- Migration 071: Desktop↔web parity — payment_channel + gapless server-issued order numbers (P1-1 / P1-2)

-- P1-1: preserve the desktop's ONLINE sub-channel (mBoB/mPay/RTGS) on synced orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_channel TEXT;

-- P1-2: per-seller, per-year gapless counter so order numbers are server-issued
-- and never collide (replaces the client-side random serial).
CREATE TABLE IF NOT EXISTS pos_order_counters (
  seller_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  year        INT  NOT NULL,
  last_serial INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (seller_id, year)
);

-- Atomically allocate and return the next order number: {PREFIX}-{YYYY}-{NNNNN}.
-- The INSERT ... ON CONFLICT ... RETURNING is a single atomic statement, so
-- concurrent sales for the same seller cannot get the same serial.
CREATE OR REPLACE FUNCTION next_pos_order_no(p_seller_id UUID, p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Migration 072: register_id on orders — which terminal/register rang the sale
-- (desktop↔web parity; registers = terminals, created by terminals, synced up).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS register_id UUID REFERENCES cash_registers(id);
CREATE INDEX IF NOT EXISTS idx_orders_register ON orders (register_id);

-- Migration 073: machine_id on cash_registers — the stable dedup key for
-- terminal-created registers synced up from desktop (registers = terminals).
-- The sync worker upserts ON CONFLICT (entity_id, machine_id). NULLs are DISTINCT
-- in a unique index, so existing web-created registers (machine_id IS NULL) are
-- unaffected; uniqueness only binds once a terminal sets its machine_id.
ALTER TABLE cash_registers ADD COLUMN IF NOT EXISTS machine_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_registers_entity_machine
  ON cash_registers (entity_id, machine_id);

-- Migration 074: TRIGGER SAFETY for terminal-synced orders.
-- A synced order is ALREADY confirmed and already had its stock deducted + khata
-- debited ON THE TERMINAL. Re-firing the cloud confirm-time triggers would
-- double-deduct stock, re-debit khata, or wrongly REJECT the (already-completed)
-- sale via the stock guard. We tag the order's `origin` and gate the three
-- confirm triggers to skip TERMINAL_SYNC orders via a trigger WHEN clause — the
-- function bodies are left untouched. Cloud stock/khata for synced orders is
-- reconciled from the SYNCED inventory_movements / khata_transactions instead
-- (movements remain the single source of truth for stock; see design note).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'CLOUD'
  CHECK (origin IN ('CLOUD', 'TERMINAL_SYNC'));

-- Re-create the three confirm-time triggers with a WHEN guard. Definitions are
-- otherwise identical to Migration 062 / the khata trigger above.
DROP TRIGGER IF EXISTS orders_guard_stock ON orders;
CREATE TRIGGER orders_guard_stock
  BEFORE INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'TERMINAL_SYNC')
  EXECUTE FUNCTION guard_stock_on_confirm();

DROP TRIGGER IF EXISTS orders_deduct_stock ON orders;
CREATE TRIGGER orders_deduct_stock
  AFTER INSERT OR UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'TERMINAL_SYNC')
  EXECUTE FUNCTION deduct_stock_on_confirm();

DROP TRIGGER IF EXISTS orders_khata_debit ON orders;
CREATE TRIGGER orders_khata_debit
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'TERMINAL_SYNC')
  EXECUTE FUNCTION khata_debit_on_confirm();

-- Migration 075: khata-balance reconciliation for SYNCED transactions.
-- Because Migration 074 skips khata_debit_on_confirm for terminal-synced orders,
-- the cloud balance is no longer moved by those credit sales. We reconcile by
-- replaying each terminal khata transaction's DELTA exactly once — NOT by a
-- "balance = SUM(txns)" recompute, because the cloud applies a per-operation
-- floor (GREATEST(0, balance - x)) on CREDIT/repayment, which makes the balance
-- path-dependent; a flat sum would alter correct cloud-originated balances.
-- Idempotency comes from external_id (the terminal's txn id, terminal-prefixed):
-- the txn is claimed once, and only a NEW claim moves the balance.
ALTER TABLE khata_transactions ADD COLUMN IF NOT EXISTS external_id TEXT;
-- NULLs are DISTINCT in a unique index, so existing cloud txns (external_id NULL)
-- are unaffected; uniqueness only binds synced txns.
CREATE UNIQUE INDEX IF NOT EXISTS idx_khata_txn_external ON khata_transactions (external_id);

CREATE OR REPLACE FUNCTION apply_synced_khata_txn(
  p_account_id  UUID,
  p_external_id TEXT,           -- terminal txn id (idempotency key), e.g. "<machine_id>:<txn_id>"
  p_type        TEXT,           -- 'DEBIT' | 'CREDIT'
  p_amount      NUMERIC,
  p_order_id    UUID DEFAULT NULL,
  p_notes       TEXT DEFAULT NULL,
  p_created_by  UUID DEFAULT NULL
) RETURNS TEXT                  -- 'applied' | 'duplicate'
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- Migration 076: idempotent inventory_movements sync — stock reconciliation for
-- synced sales. Because Migration 074 skips deduct_stock_on_confirm for synced
-- orders, cloud stock for those sales is driven by the SYNCED movements: the
-- existing apply_inventory_movement trigger (AFTER INSERT → current_stock += qty)
-- does the math. external_id makes each terminal movement insertable exactly once
-- — a re-sync conflicts and inserts nothing, so the trigger never double-applies.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_external ON inventory_movements (external_id);

-- Migration 077: terminal credentials for the sync-ingest endpoint.
-- A terminal authenticates to POST /api/sync/ingest with a bearer token; the cloud
-- stores ONLY sha256(token). The token is bound to an entity (store) and optionally
-- a register, so the ingest resolves entity_id FROM THE TOKEN — never from the
-- request body — and a terminal can therefore only ever push into its own store.
CREATE TABLE IF NOT EXISTS terminal_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID NOT NULL REFERENCES entities(id),
  register_id  UUID REFERENCES cash_registers(id),
  token_hash   TEXT NOT NULL UNIQUE,           -- sha256 hex of the secret token
  label        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_by   UUID REFERENCES user_profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_terminal_tokens_entity ON terminal_tokens (entity_id, is_active);
ALTER TABLE terminal_tokens ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policy: only the service-role client (the ingest route) touches this.

-- Migration 078: extend trigger-safety (074) to the CANCEL triggers. When a
-- terminal-synced order's status is re-synced to CANCELLED, the cloud must NOT
-- re-restore stock / re-credit khata — the terminal already did, and its RETURN
-- movements + reversal khata_transactions sync separately and reconcile. Gate the
-- order cancel triggers on origin, exactly like the confirm triggers in 074.
DROP TRIGGER IF EXISTS orders_restore_stock_cancel ON orders;
CREATE TRIGGER orders_restore_stock_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'TERMINAL_SYNC')
  EXECUTE FUNCTION restore_stock_on_cancel();

DROP TRIGGER IF EXISTS orders_khata_cancel ON orders;
CREATE TRIGGER orders_khata_cancel
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'TERMINAL_SYNC')
  EXECUTE FUNCTION khata_credit_on_cancel();

-- Migration 079: idempotent order_items sync. Synced orders carry their line items in
-- the orders.items JSONB; the ingest expands them into normalized order_items so the
-- cloud gets line-item granularity (refunds/replacements/reporting) for terminal sales
-- too. external_id (= "<machine_id>:<order_no>:<line_index>") makes each line insertable
-- exactly once — a re-sync inserts nothing. order_items has no confirm-time stock
-- trigger (only AFTER-UPDATE restore-on-cancel/refund), so inserting ACTIVE lines has no
-- stock side effect; cloud stock stays driven by the synced inventory_movements (076).
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_external ON order_items (external_id);

-- Migration 080: reverse khata credit on refund (P2-3 parity). A refunded credit sale
-- is no longer owed, so the buyer's outstanding balance must drop by the refunded
-- amount. The cloud reversed khata on CANCEL (khata_credit_on_cancel) but NOT on refund;
-- the terminal already reverses on both. This aligns the cloud: the refund-approval
-- route calls this RPC with the (possibly partial) refund amount. Same per-op floor as
-- the cloud triggers; finds the account via the order's original DEBIT; logs a CREDIT
-- txn. created_by is resolved like apply_synced_khata_txn when the caller omits it.
CREATE OR REPLACE FUNCTION reverse_khata_on_refund(
  p_order_id   UUID,
  p_amount     NUMERIC,
  p_created_by UUID  DEFAULT NULL,
  p_notes      TEXT  DEFAULT NULL
) RETURNS NUMERIC      -- new outstanding_balance, or NULL when the order has no khata debt
LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- Migration 081: fix infinite recursion in the HSN category-sync trigger. It is a
-- BEFORE INSERT OR UPDATE trigger on products, but its body ran
-- `UPDATE products SET ... WHERE id = NEW.id` — that inner UPDATE re-fired the same
-- BEFORE-UPDATE trigger, recursing until "stack depth limit exceeded". So ANY update
-- to an HSN-classified product (e.g. a stock movement) blew up — which broke cloud
-- stock reconciliation (Migration 076 drives stock from synced movements) and ordinary
-- product edits. A BEFORE trigger must mutate NEW in place, never self-UPDATE; rewritten
-- to assign NEW.* directly (semantically identical, and now also applies on INSERT,
-- where the old self-UPDATE was a silent no-op because the row didn't exist yet).
CREATE OR REPLACE FUNCTION sync_product_category_from_hsn()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;
