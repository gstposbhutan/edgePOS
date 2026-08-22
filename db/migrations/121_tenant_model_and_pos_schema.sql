-- 121 — Unified tenant model + POS→pos schema move (one migration; see
-- docs/pelbu/TENANT-MODEL.md, P4-POS-SCHEMA-CUTOVER.md). Run as ONE transaction
-- (psql -1) with the pos/auth app containers stopped. Reverse: 121_rollback.sql.
--
-- Effects:
--   * public.entities becomes the generic tenant registry (+ kind); the 15
--     POS-commercial columns move to pos.merchant_profiles (entity_id PK).
--   * hotel.hotels / travel.operators gain an entity_id link (+ entities rows).
--   * ~54 POS commerce tables + POS views move public → pos.
--   * pos-side views bridge the tables that STAY in public (entities join-view
--     with INSTEAD OF triggers, user_profiles, email_otps) so the apps only need
--     a default-schema flip, not a call-site rewrite.
--   * every public function gets search_path = pos, public (also a security fix).

-- ---------------------------------------------------------------------------
-- 1. pos schema
-- ---------------------------------------------------------------------------
create schema if not exists pos;
grant usage on schema pos to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. drop the one view that reads a moved entities column (recreated in pos below)
-- ---------------------------------------------------------------------------
drop view if exists public.entity_products_with_hsn;

-- ---------------------------------------------------------------------------
-- 3. genericize public.entities → generic identity + pos.merchant_profiles
-- ---------------------------------------------------------------------------
alter table public.entities add column if not exists kind text;
update public.entities set kind = 'pos' where kind is null;
alter table public.entities
  alter column kind set default 'pos',
  alter column kind set not null;
alter table public.entities
  add constraint entities_kind_check check (kind in ('pos','hotel','travel_operator'));

create table pos.merchant_profiles (
  entity_id            uuid primary key references public.entities(id) on delete cascade,
  role                 text    not null,
  tpn_gstin            text,
  credit_limit         numeric default 0,
  delivery_mode        text    not null default 'DELIVERY',
  is_featured          boolean not null default false,
  shop_slug            text,
  marketplace_bio      text,
  marketplace_logo_url text,
  nqrc_enabled         boolean not null default false,
  nqrc_merchant_name   text,
  nqrc_merchant_city   text,
  nqrc_account_id      text,
  nqrc_psp_guid        text,
  nqrc_mcc             text,
  nqrc_account_tag     text    not null default '26'
);

insert into pos.merchant_profiles
  (entity_id, role, tpn_gstin, credit_limit, delivery_mode, is_featured, shop_slug,
   marketplace_bio, marketplace_logo_url, nqrc_enabled, nqrc_merchant_name,
   nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag)
select id, role, tpn_gstin, credit_limit, delivery_mode, is_featured, shop_slug,
       marketplace_bio, marketplace_logo_url, nqrc_enabled, nqrc_merchant_name,
       nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag
from public.entities;

-- unique constraints that were on entities (partial → allow multiple NULLs)
create unique index merchant_profiles_shop_slug_key on pos.merchant_profiles (shop_slug) where shop_slug is not null;
create unique index merchant_profiles_tpn_gstin_key on pos.merchant_profiles (tpn_gstin) where tpn_gstin is not null;
create index        merchant_profiles_featured_idx  on pos.merchant_profiles (is_featured) where is_featured;

alter table public.entities
  drop column role,
  drop column tpn_gstin,
  drop column credit_limit,
  drop column delivery_mode,
  drop column is_featured,
  drop column shop_slug,
  drop column marketplace_bio,
  drop column marketplace_logo_url,
  drop column nqrc_enabled,
  drop column nqrc_merchant_name,
  drop column nqrc_merchant_city,
  drop column nqrc_account_id,
  drop column nqrc_psp_guid,
  drop column nqrc_mcc,
  drop column nqrc_account_tag;

-- ---------------------------------------------------------------------------
-- 4. move all POS commerce base tables public → pos (keep the 3 shared ones)
-- ---------------------------------------------------------------------------
do $$
declare t text; n int := 0;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('user_profiles','entities','email_otps')
    order by tablename
  loop
    execute format('alter table public.%I set schema pos', t);
    n := n + 1;
    raise notice 'moved table -> pos.%', t;
  end loop;
  raise notice 'total tables moved to pos: %', n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. move the remaining POS views public → pos (entity_products_with_hsn is
--    recreated below; the other 4 have no moved-column refs)
-- ---------------------------------------------------------------------------
alter view public.hsn_code_properties set schema pos;
alter view public.package_contents    set schema pos;
alter view public.products_with_hsn   set schema pos;
alter view public.sellable_products   set schema pos;

-- ---------------------------------------------------------------------------
-- 6. recreate entity_products_with_hsn in pos (entity_role now via merchant_profiles)
-- ---------------------------------------------------------------------------
create view pos.entity_products_with_hsn as
select ep.*,
       hsn.customs_duty, hsn.sales_tax, hsn.green_tax, hsn.tax_type,
       case when ep.category is not null then ep.category else hsn.category end          as display_category,
       case when ep.subcategory is not null then ep.subcategory else hsn.short_description end as display_subcategory,
       e.name  as entity_name,
       m.role  as entity_role
from pos.entity_products ep
left join pos.hsn_master hsn on ep.hsn_master_id = hsn.id
left join public.entities e  on ep.entity_id = e.id
left join pos.merchant_profiles m on m.entity_id = e.id;

-- ---------------------------------------------------------------------------
-- 7. pos-side bridge views for the tables that STAY in public
-- ---------------------------------------------------------------------------
-- 7a. pos.entities = generic identity ⋈ merchant profile (old flat shape), writable via triggers.
create view pos.entities with (security_invoker = true) as
select e.id, e.name, e.kind, e.is_active, e.address, e.lat, e.lng, e.whatsapp_no,
       e.email_notifications_enabled, e.created_at, e.updated_at,
       m.role, m.tpn_gstin, m.credit_limit, m.delivery_mode, m.is_featured, m.shop_slug,
       m.marketplace_bio, m.marketplace_logo_url, m.nqrc_enabled, m.nqrc_merchant_name,
       m.nqrc_merchant_city, m.nqrc_account_id, m.nqrc_psp_guid, m.nqrc_mcc, m.nqrc_account_tag
from public.entities e
left join pos.merchant_profiles m on m.entity_id = e.id;

create function pos.entities_ins() returns trigger language plpgsql as $fn$
begin
  insert into public.entities (id, name, kind, is_active, address, lat, lng, whatsapp_no,
                               email_notifications_enabled, created_at, updated_at)
  values (coalesce(new.id, gen_random_uuid()), new.name, coalesce(new.kind,'pos'),
          coalesce(new.is_active, true), new.address, new.lat, new.lng, new.whatsapp_no,
          coalesce(new.email_notifications_enabled, true),
          coalesce(new.created_at, now()), coalesce(new.updated_at, now()))
  returning id into new.id;
  insert into pos.merchant_profiles
    (entity_id, role, tpn_gstin, credit_limit, delivery_mode, is_featured, shop_slug,
     marketplace_bio, marketplace_logo_url, nqrc_enabled, nqrc_merchant_name,
     nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag)
  values (new.id, coalesce(new.role,'CUSTOMER'), new.tpn_gstin, coalesce(new.credit_limit,0),
          coalesce(new.delivery_mode,'DELIVERY'), coalesce(new.is_featured,false), new.shop_slug,
          new.marketplace_bio, new.marketplace_logo_url, coalesce(new.nqrc_enabled,false),
          new.nqrc_merchant_name, new.nqrc_merchant_city, new.nqrc_account_id, new.nqrc_psp_guid,
          new.nqrc_mcc, coalesce(new.nqrc_account_tag,'26'));
  return new;
end $fn$;

create function pos.entities_upd() returns trigger language plpgsql as $fn$
begin
  update public.entities set
    name = new.name, kind = coalesce(new.kind, kind), is_active = new.is_active,
    address = new.address, lat = new.lat, lng = new.lng, whatsapp_no = new.whatsapp_no,
    email_notifications_enabled = new.email_notifications_enabled, updated_at = now()
  where id = old.id;
  insert into pos.merchant_profiles
    (entity_id, role, tpn_gstin, credit_limit, delivery_mode, is_featured, shop_slug,
     marketplace_bio, marketplace_logo_url, nqrc_enabled, nqrc_merchant_name,
     nqrc_merchant_city, nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag)
  values (old.id, coalesce(new.role,'CUSTOMER'), new.tpn_gstin, coalesce(new.credit_limit,0),
          coalesce(new.delivery_mode,'DELIVERY'), coalesce(new.is_featured,false), new.shop_slug,
          new.marketplace_bio, new.marketplace_logo_url, coalesce(new.nqrc_enabled,false),
          new.nqrc_merchant_name, new.nqrc_merchant_city, new.nqrc_account_id, new.nqrc_psp_guid,
          new.nqrc_mcc, coalesce(new.nqrc_account_tag,'26'))
  on conflict (entity_id) do update set
    role=excluded.role, tpn_gstin=excluded.tpn_gstin, credit_limit=excluded.credit_limit,
    delivery_mode=excluded.delivery_mode, is_featured=excluded.is_featured, shop_slug=excluded.shop_slug,
    marketplace_bio=excluded.marketplace_bio, marketplace_logo_url=excluded.marketplace_logo_url,
    nqrc_enabled=excluded.nqrc_enabled, nqrc_merchant_name=excluded.nqrc_merchant_name,
    nqrc_merchant_city=excluded.nqrc_merchant_city, nqrc_account_id=excluded.nqrc_account_id,
    nqrc_psp_guid=excluded.nqrc_psp_guid, nqrc_mcc=excluded.nqrc_mcc, nqrc_account_tag=excluded.nqrc_account_tag;
  return new;
end $fn$;

create function pos.entities_del() returns trigger language plpgsql as $fn$
begin
  delete from public.entities where id = old.id;  -- cascade removes merchant_profiles
  return old;
end $fn$;

create trigger entities_instead_ins instead of insert on pos.entities for each row execute function pos.entities_ins();
create trigger entities_instead_upd instead of update on pos.entities for each row execute function pos.entities_upd();
create trigger entities_instead_del instead of delete on pos.entities for each row execute function pos.entities_del();

-- 7b. passthrough bridges for the other shared tables
create view pos.user_profiles with (security_invoker = true) as select * from public.user_profiles;
create view pos.email_otps     with (security_invoker = true) as select * from public.email_otps;

-- ---------------------------------------------------------------------------
-- 8. hotel / travel tenants link to public.entities
-- ---------------------------------------------------------------------------
alter table hotel.hotels add column if not exists entity_id uuid references public.entities(id);
do $$
declare h record; eid uuid;
begin
  for h in select id, name from hotel.hotels where entity_id is null loop
    insert into public.entities (id, name, kind, is_active)
    values (gen_random_uuid(), h.name, 'hotel', true) returning id into eid;
    update hotel.hotels set entity_id = eid where id = h.id;
    raise notice 'linked hotel % -> entity %', h.id, eid;
  end loop;
end $$;

alter table travel.operators add constraint operators_entity_id_fkey foreign key (entity_id) references public.entities(id);
do $$
declare o record; eid uuid;
begin
  for o in select id, name from travel.operators where entity_id is null loop
    insert into public.entities (id, name, kind, is_active)
    values (gen_random_uuid(), o.name, 'travel_operator', true) returning id into eid;
    update travel.operators set entity_id = eid where id = o.id;
    raise notice 'linked operator % -> entity %', o.id, eid;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. grants on pos (moved tables keep their own grants; cover new objects + schema)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on all tables    in schema pos to authenticated, service_role;
grant select                         on all tables    in schema pos to anon;
grant usage, select                  on all sequences in schema pos to authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 10. pin search_path on every public function → resolve pos first, then public
--     (required now that commerce tables live in pos; also closes the unpinned
--     SECURITY DEFINER search_path hole).
-- ---------------------------------------------------------------------------
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind in ('f','p')
      and pg_get_userbyid(p.proowner) = current_user                       -- only routines we own
      and not exists (select 1 from pg_depend d                            -- skip extension-owned (pgvector, etc.)
                      where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s set search_path = pos, public', r.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path pinned on % public routines', n;
end $$;
