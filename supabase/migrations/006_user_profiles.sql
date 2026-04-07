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
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims  JSONB;
  profile RECORD;
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles
  WHERE id = (event->>'user_id')::UUID;

  IF profile IS NULL THEN
    RETURN event;
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{entity_id}',  to_jsonb(profile.entity_id::TEXT));
  claims := jsonb_set(claims, '{role}',        to_jsonb(profile.role));
  claims := jsonb_set(claims, '{sub_role}',    to_jsonb(profile.sub_role));
  claims := jsonb_set(claims, '{permissions}', to_jsonb(profile.permissions));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;
