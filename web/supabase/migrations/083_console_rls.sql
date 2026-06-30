-- 083: Defense-in-depth RLS for the three console tables (favourites, warehouses,
-- distributor_wholesalers).
--
-- These tables are reached ONLY through the /api/console/* routes, which use the
-- service-role client (getAuthContext().supabase). The service role bypasses RLS, so
-- the console keeps working exactly as before — the active isolation for the console is
-- the explicit per-entity scoping in those routes, not these policies.
--
-- We still enable RLS + scoped policies here as a second line of defence: platform RLS is
-- currently disabled (see archive/071_disable_rls.sql), but if it is ever re-enabled and a
-- non-service (anon/user-JWT) path ever touches these tables, the data stays isolated to the
-- owning entity. Policies use the same auth_entity_id() / is_super_admin() helpers and the
-- same is_super_admin() OR <scope> shape as the baseline policies in 001_schema.sql.

-- favourites — a row belongs to the actor that saved it.
ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favourites_own_actor" ON public.favourites
  USING (public.is_super_admin() OR actor_entity_id = public.auth_entity_id())
  WITH CHECK (public.is_super_admin() OR actor_entity_id = public.auth_entity_id());

-- warehouses — a row belongs to the entity that owns it.
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_own_entity" ON public.warehouses
  USING (public.is_super_admin() OR entity_id = public.auth_entity_id())
  WITH CHECK (public.is_super_admin() OR entity_id = public.auth_entity_id());

-- distributor_wholesalers — a link is visible/writable to either side of it (the distributor
-- or the wholesaler named on the row).
ALTER TABLE public.distributor_wholesalers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dw_own_either_side" ON public.distributor_wholesalers
  USING (
    public.is_super_admin()
    OR wholesaler_id = public.auth_entity_id()
    OR distributor_id = public.auth_entity_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR wholesaler_id = public.auth_entity_id()
    OR distributor_id = public.auth_entity_id()
  );
