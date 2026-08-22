-- 127 — per-shop terminal (license) cap. Meeting 2026-08-11 (Fame Digital) decision:
-- the base package is 1 shop + 3 terminals combined (any type: POS or BACK_OFFICE);
-- more requires an upgrade. This adds the per-shop TERMINAL cap; the "1 shop per owner"
-- limit is enforced separately at shop creation (admin-only, see MEETING plans P2).
--
-- Adds pos.merchant_profiles.license_limit (default 3) and threads it through the
-- pos.entities bridge view + entities_upd() trigger (same path as shifts_enabled / theme_*).
-- Raising a shop's license_limit is the "upgrade". Idempotent; safe to re-run.

ALTER TABLE pos.merchant_profiles
  ADD COLUMN IF NOT EXISTS license_limit integer NOT NULL DEFAULT 3;

-- View: expose the flag (appended — CREATE OR REPLACE only allows new trailing cols).
CREATE OR REPLACE VIEW pos.entities AS
  SELECT e.id, e.name, e.kind, e.is_active, e.address, e.lat, e.lng, e.whatsapp_no,
         e.email_notifications_enabled, e.created_at, e.updated_at,
         m.role, m.tpn_gstin, m.credit_limit, m.delivery_mode, m.is_featured, m.shop_slug,
         m.marketplace_bio, m.marketplace_logo_url, m.nqrc_enabled, m.nqrc_merchant_name,
         m.nqrc_merchant_city, m.nqrc_account_id, m.nqrc_psp_guid, m.nqrc_mcc, m.nqrc_account_tag,
         m.shifts_enabled, m.theme_preset, m.theme_primary, m.license_limit
  FROM entities e
  LEFT JOIN pos.merchant_profiles m ON m.entity_id = e.id;

-- INSTEAD OF UPDATE trigger fn: route license_limit to merchant_profiles.
CREATE OR REPLACE FUNCTION pos.entities_upd() RETURNS trigger LANGUAGE plpgsql AS $$
begin
  update public.entities set
    name = new.name, kind = coalesce(new.kind, kind), is_active = new.is_active,
    address = new.address, lat = new.lat, lng = new.lng, whatsapp_no = new.whatsapp_no,
    email_notifications_enabled = new.email_notifications_enabled, updated_at = now()
  where id = old.id;
  insert into pos.merchant_profiles
    (entity_id, role, tpn_gstin, credit_limit, delivery_mode, is_featured, shop_slug,
     marketplace_bio, marketplace_logo_url, nqrc_enabled, nqrc_merchant_name,
     nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag,
     shifts_enabled, theme_preset, theme_primary, license_limit)
  values (old.id, coalesce(new.role,'CUSTOMER'), new.tpn_gstin, coalesce(new.credit_limit,0),
          coalesce(new.delivery_mode,'DELIVERY'), coalesce(new.is_featured,false), new.shop_slug,
          new.marketplace_bio, new.marketplace_logo_url, coalesce(new.nqrc_enabled,false),
          new.nqrc_merchant_name, new.nqrc_merchant_city, new.nqrc_account_id, new.nqrc_psp_guid,
          new.nqrc_mcc, coalesce(new.nqrc_account_tag,'26'),
          coalesce(new.shifts_enabled,false), coalesce(new.theme_preset,'champagne'), new.theme_primary,
          coalesce(new.license_limit,3))
  on conflict (entity_id) do update set
    role=excluded.role, tpn_gstin=excluded.tpn_gstin, credit_limit=excluded.credit_limit,
    delivery_mode=excluded.delivery_mode, is_featured=excluded.is_featured, shop_slug=excluded.shop_slug,
    marketplace_bio=excluded.marketplace_bio, marketplace_logo_url=excluded.marketplace_logo_url,
    nqrc_enabled=excluded.nqrc_enabled, nqrc_merchant_name=excluded.nqrc_merchant_name,
    nqrc_merchant_city=excluded.nqrc_merchant_city, nqrc_account_id=excluded.nqrc_account_id,
    nqrc_psp_guid=excluded.nqrc_psp_guid, nqrc_mcc=excluded.nqrc_mcc, nqrc_account_tag=excluded.nqrc_account_tag,
    shifts_enabled=excluded.shifts_enabled, theme_preset=excluded.theme_preset, theme_primary=excluded.theme_primary,
    license_limit=excluded.license_limit;
  return new;
end
$$;
