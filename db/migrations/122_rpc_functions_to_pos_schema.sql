-- 122 — P4 follow-up: re-home the app RPC functions into the `pos` schema.
--
-- Since migration 121 the pos/auth service clients default to the `pos`
-- PostgREST profile, but these functions stayed in `public` — so EVERY
-- supabase.rpc() call in the pos app has failed with "Could not find the
-- function pos.X in the schema cache" since the flip (2026-07-14): the
-- terminal store-user mirror (desktop logins!), khata refund reversal,
-- package opening/availability, stock predictions, HSN properties, fuzzy
-- bill matching, face-profile deletion. Surfaced by the sync/bootstrap
-- store-user logging on 2026-08-11 (field report: owner couldn't log in
-- on the desktop terminal).
--
-- Their bodies already run correctly post-P4 (121 pinned search_path=
-- pos,public on all of them); only the schema HOME was missed. ALTER ...
-- SET SCHEMA preserves ownership, grants (incl. get_terminal_store_users'
-- service_role-only EXECUTE), and per-function config. No caller used the
-- `public` profile for these (verified: zero .schema('public').rpc sites;
-- the old edgePOS stack that did is stopped), so no wrappers are needed.
-- Reload PostgREST afterwards: NOTIFY pgrst, 'reload schema';

ALTER FUNCTION public.calculate_stock_predictions(p_entity_id uuid) SET SCHEMA pos;
ALTER FUNCTION public.delete_face_profile(p_profile_id uuid) SET SCHEMA pos;
ALTER FUNCTION public.fuzzy_match_product(p_name text, p_entity_id uuid, p_threshold numeric) SET SCHEMA pos;
ALTER FUNCTION public.get_hsn_properties(p_hsn_code text) SET SCHEMA pos;
ALTER FUNCTION public.get_terminal_store_users(p_entity uuid) SET SCHEMA pos;
ALTER FUNCTION public.open_package(p_package_product_id uuid, p_entity_id uuid, p_qty integer) SET SCHEMA pos;
ALTER FUNCTION public.package_available_qty(p_package_id uuid, p_depth integer) SET SCHEMA pos;
ALTER FUNCTION public.reverse_khata_on_refund(p_order_id uuid, p_amount numeric, p_created_by uuid, p_notes text) SET SCHEMA pos;
