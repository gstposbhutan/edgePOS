-- P2 of the user-model unification (docs/pelbu/USER-MODEL-UNIFICATION.md).
-- Make the access-token hook multi-row tolerant (user_profiles becomes a
-- memberships table in P3) and stamp {module, scope_id} into the JWT app_metadata.
-- RLS helpers (auth_role/auth_entity_id) already read app_metadata from the JWT,
-- so they keep working unchanged; auth_module() is added for future policies.
-- Matches the original: STABLE, SECURITY DEFINER, owner postgres (grants preserved).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
DECLARE
  app_metadata JSONB;
  profile RECORD;
BEGIN
  -- Primary membership: platform > pos-business > hotel > travel > pos-customer.
  SELECT entity_id, role, sub_role, permissions, module, scope_id
  INTO profile
  FROM public.user_profiles
  WHERE user_id = (event->>'user_id')::UUID
  ORDER BY (CASE module
              WHEN 'platform' THEN 0
              WHEN 'pos' THEN (CASE WHEN role IN ('DISTRIBUTOR','WHOLESALER','RETAILER','RIDER') THEN 1 ELSE 4 END)
              WHEN 'hotel' THEN 2
              WHEN 'travel' THEN 3
              ELSE 5 END)
  LIMIT 1;

  IF profile IS NULL THEN
    RETURN event;
  END IF;

  app_metadata := event->'app_metadata';
  app_metadata := jsonb_set(app_metadata, '{entity_id}',   to_jsonb(profile.entity_id::TEXT));
  app_metadata := jsonb_set(app_metadata, '{role}',        to_jsonb(profile.role));
  app_metadata := jsonb_set(app_metadata, '{sub_role}',    to_jsonb(profile.sub_role));
  app_metadata := jsonb_set(app_metadata, '{permissions}', to_jsonb(profile.permissions));
  app_metadata := jsonb_set(app_metadata, '{module}',      to_jsonb(profile.module));
  app_metadata := jsonb_set(app_metadata, '{scope_id}',    to_jsonb(profile.scope_id::TEXT));

  RETURN jsonb_set(event, '{app_metadata}', app_metadata);
END;
$$;

create or replace function public.auth_module()
returns text language sql stable
as $$ select auth.jwt() -> 'app_metadata' ->> 'module'; $$;
grant execute on function public.auth_module() to public;
