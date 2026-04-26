-- Migration 006: User Profiles
-- Extends Supabase auth.users with business context for RBAC

CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id   UUID NOT NULL REFERENCES entities(id),
  role        TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER')),
  sub_role    TEXT NOT NULL CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN')),
  permissions TEXT[] DEFAULT '{}',
  full_name   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_entity ON user_profiles(entity_id);

-- JWT Custom Claims Hook
-- Adds RBAC claims to the JWT's app_metadata for RLS functions
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  app_metadata  JSONB;
  profile RECORD;
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles
  WHERE id = (event->>'user_id')::UUID;

  IF profile IS NULL THEN
    RETURN event;
  END IF;

  app_metadata := event->'app_metadata';
  app_metadata := jsonb_set(app_metadata, '{entity_id}',  to_jsonb(profile.entity_id::TEXT));
  app_metadata := jsonb_set(app_metadata, '{role}',        to_jsonb(profile.role));
  app_metadata := jsonb_set(app_metadata, '{sub_role}',    to_jsonb(profile.sub_role));
  app_metadata := jsonb_set(app_metadata, '{permissions}', to_jsonb(profile.permissions));

  RETURN jsonb_set(event, '{app_metadata}', app_metadata);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
