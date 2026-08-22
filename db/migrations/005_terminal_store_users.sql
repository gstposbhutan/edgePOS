-- Terminal user sync: a provisioned terminal mirrors its store's team into local
-- PocketBase using the SAME bcrypt hash (Supabase GoTrue and PocketBase both use
-- bcrypt), so one owner-set password works on web AND the terminal — no plaintext,
-- no reversible storage. The hash lives in auth.users.encrypted_password and updates
-- whenever the password is set/reset; the terminal re-mirrors it on each bootstrap.
--
-- auth.users is not reachable via PostgREST, so this SECURITY DEFINER function bridges
-- it for the service-role bootstrap only. It exposes password hashes, so EXECUTE is
-- granted to service_role exclusively (never anon/authenticated).

CREATE OR REPLACE FUNCTION public.get_terminal_store_users(p_entity uuid)
RETURNS TABLE (id uuid, email text, full_name text, sub_role text, password_hash text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT p.id, u.email::text, p.full_name, p.sub_role, u.encrypted_password::text
  FROM public.user_profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.entity_id = p_entity
    AND p.sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF')
    AND u.encrypted_password IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_terminal_store_users(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_terminal_store_users(uuid) TO service_role;
