-- Reverse of 121_tenant_model_and_pos_schema.sql. Data-preserving structural undo.
-- SECONDARY rollback — the PRIMARY rollback is the pre-migration PGDATA volume
-- snapshot (restore that if the cutover fails verification before traffic).
-- Run as ONE transaction (psql -1) with the pos/auth containers stopped, and
-- revert PGRST_DB_SCHEMAS + the app db.schema flip afterward.

-- 1. unpin function search_path (back to session default)
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.prokind in ('f','p')
             and pg_get_userbyid(p.proowner)=current_user
             and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
  loop execute format('alter routine %s reset search_path', r.sig); end loop;
end $$;

-- 2. unlink hotel/travel tenants (remove the entities rows we created)
delete from public.entities where kind in ('hotel','travel_operator');
alter table travel.operators drop constraint if exists operators_entity_id_fkey;
alter table hotel.hotels drop column if exists entity_id;

-- 3. drop pos bridge views/triggers/functions
drop view if exists pos.entities cascade;
drop function if exists pos.entities_ins() cascade;
drop function if exists pos.entities_upd() cascade;
drop function if exists pos.entities_del() cascade;
drop view if exists pos.user_profiles;
drop view if exists pos.email_otps;
drop view if exists pos.entity_products_with_hsn;

-- 4. move POS commerce tables + views back to public
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='pos' and tablename <> 'merchant_profiles'
  loop execute format('alter table pos.%I set schema public', t); end loop;
  for t in select viewname from pg_views where schemaname='pos'
  loop execute format('alter view pos.%I set schema public', t); end loop;
end $$;

-- 5. re-merge merchant_profiles columns back onto public.entities
alter table public.entities
  add column role text, add column tpn_gstin text, add column credit_limit numeric default 0,
  add column delivery_mode text default 'DELIVERY', add column is_featured boolean default false,
  add column shop_slug text, add column marketplace_bio text, add column marketplace_logo_url text,
  add column nqrc_enabled boolean default false, add column nqrc_merchant_name text,
  add column nqrc_merchant_city text, add column nqrc_account_id text, add column nqrc_psp_guid text,
  add column nqrc_mcc text, add column nqrc_account_tag text default '26';
update public.entities e set
  role=m.role, tpn_gstin=m.tpn_gstin, credit_limit=m.credit_limit, delivery_mode=m.delivery_mode,
  is_featured=m.is_featured, shop_slug=m.shop_slug, marketplace_bio=m.marketplace_bio,
  marketplace_logo_url=m.marketplace_logo_url, nqrc_enabled=m.nqrc_enabled,
  nqrc_merchant_name=m.nqrc_merchant_name, nqrc_merchant_city=m.nqrc_merchant_city,
  nqrc_account_id=m.nqrc_account_id, nqrc_psp_guid=m.nqrc_psp_guid, nqrc_mcc=m.nqrc_mcc,
  nqrc_account_tag=m.nqrc_account_tag
from pos.merchant_profiles m where m.entity_id=e.id;
alter table public.entities
  alter column role set not null, alter column delivery_mode set not null,
  alter column is_featured set not null, alter column nqrc_enabled set not null,
  alter column nqrc_account_tag set not null;
create unique index entities_shop_slug_key on public.entities (shop_slug);
create unique index entities_tpn_gstin_key on public.entities (tpn_gstin);
create unique index idx_entities_shop_slug on public.entities (shop_slug) where shop_slug is not null;
create index idx_entities_featured on public.entities (is_featured) where is_featured;
drop table pos.merchant_profiles;

-- 6. recreate the original public.entity_products_with_hsn (entity_role from entities.role)
create view public.entity_products_with_hsn as
select ep.*, hsn.customs_duty, hsn.sales_tax, hsn.green_tax, hsn.tax_type,
       case when ep.category is not null then ep.category else hsn.category end as display_category,
       case when ep.subcategory is not null then ep.subcategory else hsn.short_description end as display_subcategory,
       e.name as entity_name, e.role as entity_role
from public.entity_products ep
left join public.hsn_master hsn on ep.hsn_master_id=hsn.id
left join public.entities e on ep.entity_id=e.id;

-- 7. drop kind + pos schema
alter table public.entities drop constraint if exists entities_kind_check;
alter table public.entities drop column if exists kind;
drop schema if exists pos cascade;
