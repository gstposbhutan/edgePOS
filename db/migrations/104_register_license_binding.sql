-- 104: bind desktop licenses to registers + per-register mode (POS vs back-office).
--
-- A cash register IS a desktop terminal. It is now provisioned when a super-admin approves a
-- terminal's license request (rather than created ad-hoc), and each terminal runs as either a
-- full POS (rings cash sales) or a stock-only BACK_OFFICE terminal (stock + online orders, no
-- cash sale). The mode is carried in the signed .lic payload + the sync bootstrap so the terminal
-- knows what it may do offline.

-- Register mode. Default POS so existing terminals keep ringing sales.
ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'POS';

DO $$ BEGIN
  ALTER TABLE public.cash_registers
    ADD CONSTRAINT cash_registers_mode_check CHECK (mode IN ('POS', 'BACK_OFFICE'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The register a license provisioned (the terminal it activates). Nullable for older licenses
-- issued before this binding existed; ON DELETE SET NULL so soft-deleting a register never
-- orphans the license row (which is kept for revocation + audit).
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS register_id uuid;

DO $$ BEGIN
  ALTER TABLE public.licenses
    ADD CONSTRAINT licenses_register_id_fkey
    FOREIGN KEY (register_id) REFERENCES public.cash_registers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_licenses_register ON public.licenses (register_id);
