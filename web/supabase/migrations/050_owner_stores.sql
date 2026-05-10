-- Migration 050: Owner → Multiple Stores
-- Allows a single OWNER user to manage multiple retailer entities.
-- An owner can switch between their stores in the POS header.

-- ── Junction table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS owner_stores (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id  UUID NOT NULL REFERENCES entities(id)   ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,  -- the default store on login
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_owner_stores_owner   ON owner_stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_owner_stores_entity  ON owner_stores(entity_id);

-- RLS
ALTER TABLE owner_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_owner_stores" ON owner_stores
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "owner_read_own_stores" ON owner_stores
  FOR SELECT USING (owner_id = auth.uid());

-- ── Back-fill: existing OWNER user_profiles → primary owner_stores entry ──
-- Links each existing OWNER sub_role user to their current entity as primary.
INSERT INTO owner_stores (owner_id, entity_id, is_primary)
SELECT p.id, p.entity_id, true
FROM   user_profiles p
WHERE  p.sub_role = 'OWNER'
  AND  p.entity_id IS NOT NULL
ON CONFLICT (owner_id, entity_id) DO NOTHING;
