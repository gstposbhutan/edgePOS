-- Migration 002: Entities (Multi-tenant foundation)
-- Every participant in the supply chain: SUPER_ADMIN, DISTRIBUTOR, WHOLESALER, RETAILER
-- NOTE: parent_entity_id removed — replaced by retailer_wholesalers junction table (migration 005)

CREATE TABLE IF NOT EXISTS entities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER')),
  tpn_gstin    TEXT UNIQUE,
  whatsapp_no  TEXT,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to pre-existing entities table
ALTER TABLE entities ADD COLUMN IF NOT EXISTS role         TEXT CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER'));
ALTER TABLE entities ADD COLUMN IF NOT EXISTS tpn_gstin    TEXT UNIQUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS whatsapp_no  TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) DEFAULT 0;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT TRUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE entities ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();

-- Add FK from categories to entities (safe to re-run)
DO $$ BEGIN
  ALTER TABLE categories
    ADD CONSTRAINT fk_categories_distributor
    FOREIGN KEY (distributor_id) REFERENCES entities(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_updated_at ON entities;
CREATE TRIGGER entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
