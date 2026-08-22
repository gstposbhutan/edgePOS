-- P2 (final): the access-token hook resolves a role for EVERY user from all
-- membership sources, so no authenticated user is role-less:
--   user_profiles (POS/platform) → hotel.managers → travel.supplier_profiles → CUSTOMER.
-- Stamps {role, module, scope_id, entity_id, sub_role, permissions} into the JWT.
--
-- IMPORTANT: the Supabase access-token hook contract nests the JWT claims under
-- event.claims (with app_metadata inside). The original edgePOS hook wrote
-- event.app_metadata at top level — which GoTrue ignores (why it was never
-- enabled/working). This version reads/writes event.claims.app_metadata.
-- SECURITY DEFINER (owner postgres) so it can read the hotel/travel schemas.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
DECLARE
  uid uuid := (event->>'user_id')::uuid;
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  v_role text; v_module text; v_scope uuid; v_entity uuid; v_sub text; v_perms jsonb := '[]'::jsonb;
  p record; m record; s record;
BEGIN
  -- 1) POS / platform identity (primary membership if several).
  SELECT entity_id, role, sub_role, permissions, module, scope_id INTO p
  FROM public.user_profiles WHERE user_id = uid
  ORDER BY (CASE module
              WHEN 'platform' THEN 0
              WHEN 'pos' THEN (CASE WHEN role IN ('DISTRIBUTOR','WHOLESALER','RETAILER','RIDER') THEN 1 ELSE 4 END)
              ELSE 5 END)
  LIMIT 1;

  IF FOUND THEN
    v_entity := p.entity_id; v_role := p.role; v_sub := p.sub_role;
    v_perms := coalesce(to_jsonb(p.permissions), '[]'::jsonb);
    v_module := coalesce(p.module, 'pos'); v_scope := coalesce(p.scope_id, p.entity_id);
  ELSE
    -- 2) hotel staff.
    SELECT role, hotel_id INTO m FROM hotel.managers WHERE user_id = uid
    ORDER BY (CASE role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END) LIMIT 1;
    IF FOUND THEN
      v_role := m.role; v_module := 'hotel'; v_scope := m.hotel_id;
    ELSE
      -- 3) travel staff.
      SELECT role, operator_id INTO s FROM travel.supplier_profiles WHERE user_id = uid LIMIT 1;
      IF FOUND THEN
        v_role := s.role; v_module := 'travel'; v_scope := s.operator_id;
      ELSE
        -- 4) everyone else is a platform customer.
        v_role := 'CUSTOMER'; v_module := 'pos';
      END IF;
    END IF;
  END IF;

  -- Merge into claims.app_metadata (jsonb_build_object keeps NULLs as JSON null,
  -- avoiding the SQL-NULL-poisons-jsonb_set trap for entity-less users).
  claims := jsonb_set(claims, '{app_metadata}',
    coalesce(claims->'app_metadata', '{}'::jsonb) || jsonb_build_object(
      'role',        v_role,
      'module',      v_module,
      'entity_id',   v_entity,
      'scope_id',    v_scope,
      'sub_role',    v_sub,
      'permissions', v_perms
    ));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Hook is only invoked by GoTrue (supabase_auth_admin). Lock it down.
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;
grant  execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
