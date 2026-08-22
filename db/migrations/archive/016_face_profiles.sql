-- Migration 016: Face-ID Profiles
-- Opt-in biometric loyalty. Consent required before any capture.
-- GDPR-compliant: soft-delete preserves audit trail, hard-delete removes embedding.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS face_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id),  -- store that enrolled them
  whatsapp_no   TEXT NOT NULL,                           -- linked identity
  name          TEXT,
  embedding     vector(512),                             -- 512-dim face vector (encrypted at rest)
  consent_at    TIMESTAMPTZ NOT NULL,                    -- explicit consent timestamp
  consent_token TEXT UNIQUE NOT NULL,                    -- QR token used for consent
  deleted_at    TIMESTAMPTZ,                             -- GDPR soft delete
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index — only active (non-deleted) profiles searchable
CREATE INDEX IF NOT EXISTS idx_face_profiles_entity
  ON face_profiles(entity_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_face_profiles_whatsapp
  ON face_profiles(whatsapp_no) WHERE deleted_at IS NULL;

-- Vector similarity index for fast face matching
CREATE INDEX IF NOT EXISTS idx_face_profiles_embedding
  ON face_profiles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS face_profiles_updated_at ON face_profiles;
CREATE TRIGGER face_profiles_updated_at
  BEFORE UPDATE ON face_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── GDPR DELETION FUNCTION ───────────────────────────────────────────────
-- Zeroes out the embedding vector and marks deleted.
-- Keeps the record for audit (consent_at, consent_token preserved).

CREATE OR REPLACE FUNCTION delete_face_profile(p_profile_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE face_profiles
  SET
    embedding  = NULL,
    name       = '[deleted]',
    deleted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE face_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "face_profiles_entity_scope" ON face_profiles
  FOR ALL USING (
    is_super_admin() OR entity_id = auth_entity_id()
  );

-- Consumers can request deletion of their own record via whatsapp_no
CREATE POLICY "face_profiles_self_delete" ON face_profiles
  FOR UPDATE USING (whatsapp_no = current_setting('app.requesting_whatsapp', true));
