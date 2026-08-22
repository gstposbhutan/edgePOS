-- Shift management + cash registers for blind cash close reconciliation
-- Migration: 069

-- ── Cash registers (named registers managed by MANAGER/OWNER) ──────────
CREATE TABLE cash_registers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  name                  TEXT NOT NULL,
  default_opening_float DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (default_opening_float >= 0),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cash_registers_entity ON cash_registers (entity_id, is_active);

ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_registers_tenant" ON cash_registers
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- ── Shifts (tied to a register, opened by cashier) ────────────────────
CREATE TABLE shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  register_id     UUID NOT NULL REFERENCES cash_registers(id),
  opened_by       UUID NOT NULL REFERENCES user_profiles(id),
  closed_by       UUID REFERENCES user_profiles(id),
  opening_float   DECIMAL(12,2) NOT NULL CHECK (opening_float >= 0),
  closing_count   DECIMAL(12,2),
  expected_total  DECIMAL(12,2),
  discrepancy     DECIMAL(12,2),
  status          TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'CLOSING', 'CLOSED')),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- One active shift per register at a time
CREATE UNIQUE INDEX idx_shifts_one_active_per_register
  ON shifts (register_id)
  WHERE status IN ('ACTIVE', 'CLOSING');

CREATE INDEX idx_shifts_entity ON shifts (entity_id, opened_at DESC);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shifts_tenant" ON shifts
  FOR ALL USING (
    entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- ── Shift transactions (sales, refunds, voids tracked per shift) ──────
CREATE TABLE shift_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id         UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  order_id         UUID,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('SALE', 'REFUND', 'VOID')),
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT', 'UPI', 'ONLINE')),
  amount           DECIMAL(12,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_transactions_shift ON shift_transactions (shift_id, created_at);

ALTER TABLE shift_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_transactions_tenant" ON shift_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );

-- ── Shift reconciliations (blind close results) ───────────────────────
CREATE TABLE shift_reconciliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL UNIQUE REFERENCES shifts(id),
  expected_total  DECIMAL(12,2) NOT NULL,
  actual_count    DECIMAL(12,2) NOT NULL,
  discrepancy     DECIMAL(12,2) NOT NULL,
  classification  TEXT NOT NULL CHECK (classification IN ('OVERAGE', 'SHORTAGE', 'BALANCED')),
  reviewed_by     UUID REFERENCES user_profiles(id),
  reviewed_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shift_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_reconciliations_tenant" ON shift_reconciliations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shifts s
      WHERE s.id = shift_id
      AND s.entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
  );
