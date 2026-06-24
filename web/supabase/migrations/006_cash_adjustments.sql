-- Cash drawer adjustments (cash in / cash out) for a shift — web parity with the
-- desktop terminal's cash_adjustments PocketBase collection
-- (desktop/pb/pb_migrations/003_cash_adjustments.js). Each entry is a manual cash
-- movement recorded against the ACTIVE shift: a petty-cash pickup, a bank deposit,
-- a drawer correction, etc. `amount` is always positive; the sign comes from `type`.
--
-- The shift close-math (api/shifts/[id]/close) and the reconciliation preview
-- (api/shifts/[id]/reconciliation) both fold these in:
--   expected_total = opening_float + cash_sales − cash_refunds + Σ cash_in − Σ cash_out
--
-- Not yet terminal-synced: shifts themselves aren't reconciled in sync-core yet
-- (register-order-sync.ts TODO), so no external_id column here. Add one when shifts
-- become sync-ready.

CREATE TABLE IF NOT EXISTS public.cash_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid NOT NULL REFERENCES public.entities(id),
  shift_id    uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  register_id uuid REFERENCES public.cash_registers(id),
  type        text NOT NULL CHECK (type IN ('CASH_IN', 'CASH_OUT')),
  amount      numeric(12,2) NOT NULL CHECK (amount > 0),
  reason      text NOT NULL,
  notes       text,
  created_by  uuid REFERENCES public.user_profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_adjustments_shift  ON public.cash_adjustments(shift_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cash_adjustments_entity ON public.cash_adjustments(entity_id, created_at);
