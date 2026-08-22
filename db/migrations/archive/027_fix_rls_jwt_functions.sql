-- Migration 027: Fix RLS helper functions to read from app_metadata
--
-- Supabase nests custom claims (role, sub_role, entity_id) inside
-- app_metadata in the JWT. The original functions read from the top
-- level which returned wrong values:
--   auth_role()   -> 'authenticated' (Supabase auth role) instead of 'RETAILER'
--   auth_entity_id() -> NULL instead of the actual entity UUID
--   auth_sub_role()  -> NULL instead of 'CASHIER'/'MANAGER'/'OWNER'

CREATE OR REPLACE FUNCTION auth_entity_id() RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'entity_id')::UUID;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_role() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION auth_sub_role() RETURNS TEXT AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'sub_role';
$$ LANGUAGE SQL STABLE;
