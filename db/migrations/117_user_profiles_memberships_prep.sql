-- P1 of the user-model unification (docs/pelbu/USER-MODEL-UNIFICATION.md).
-- Extend public.user_profiles toward the unified memberships shape — ADDITIVE and
-- NON-BREAKING: `id` stays PRIMARY KEY (= auth user id) and it remains one row per
-- user for now, so every existing `.eq('id', uid).single()` reader is unaffected.
-- Multi-row + PK swap happens in P3, once the auth readers are multi-row-tolerant (P2).

alter table public.user_profiles add column if not exists user_id  uuid;
alter table public.user_profiles add column if not exists module   text not null default 'pos';
alter table public.user_profiles add column if not exists scope_id uuid;
alter table public.user_profiles add column if not exists status   text not null default 'active';

-- constrain the new enums (dropped-then-added so re-runs are clean)
alter table public.user_profiles drop constraint if exists user_profiles_module_check;
alter table public.user_profiles add  constraint user_profiles_module_check
  check (module in ('pos','hotel','travel','platform'));
alter table public.user_profiles drop constraint if exists user_profiles_status_check;
alter table public.user_profiles add  constraint user_profiles_status_check
  check (status in ('active','suspended','pending'));

-- backfill existing (POS + super-admin) rows
update public.user_profiles set user_id  = id         where user_id is null;
update public.user_profiles set scope_id = entity_id  where scope_id is null and entity_id is not null;
update public.user_profiles set module   = 'platform' where role = 'SUPER_ADMIN';

create index if not exists user_profiles_user_id_idx on public.user_profiles(user_id);
create index if not exists user_profiles_module_idx  on public.user_profiles(module);
