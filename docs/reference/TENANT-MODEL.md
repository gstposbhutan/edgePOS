# PELBU — unified tenant model (for approval)

Status: **DONE — executed & verified 2026-07-13** (migration `121`, commit `546deab`).
Full genericization, bundled with the POS→`pos` move as one transactional cutover. Reverse:
`db/public/migrations/121_rollback.sql`; primary rollback = PGDATA snapshot
(`pelbu-supabase_db-data-pretenant` + tarball). Companion to [[USER-MODEL-UNIFICATION]] and
[[P4-POS-SCHEMA-CUTOVER]].

> **Porting-agent action required:** the POS app's default Supabase schema was flipped to `pos`
> on-disk (`apps/pos/lib/supabase/server.js`), but that file is untracked here. The porting
> agent MUST carry `db: { schema: 'pos' }` (both the user client via `@pelbu/db` `createServer`'s
> `{ schema }` option and the service client) into their source, or their next deploy will query
> `public.*` for tables that now live in `pos.*` and break. See [[pelbu-repo-tracking-boundary]].

## Goal

`public.entities` becomes the **universal business/tenant registry** — the entity-level twin of
what `public.user_profiles` is for identity. Every business (POS merchant, hotel, travel operator)
is one `entities` row; module-specific attributes live in that module's schema, keyed by `entity_id`.
A company that runs a shop *and* a hotel is **one** entity with two extensions.

```
public.entities              generic tenant identity (the "who")
  id · name · kind ('pos_merchant'|'hotel'|'travel_operator') · is_active
  · address · lat · lng · whatsapp_no (contact) · email_notifications_enabled
  · created_at · updated_at

pos.merchant_profiles        POS-commercial extension   (entity_id PK → public.entities)
hotel.hotels     += entity_id → public.entities         (hotel attributes stay in hotel schema)
travel.operators   entity_id → public.entities          (already has the column ✓)
```

## Column split (concrete)

`public.entities` today has 24 columns. **9 stay** (generic identity); **15 move** to
`pos.merchant_profiles`:

| Stays on `public.entities` | Moves to `pos.merchant_profiles` (entity_id PK) |
|---|---|
| id, name, **kind** (new), is_active | role, tpn_gstin, credit_limit, delivery_mode, is_featured |
| address, lat, lng | shop_slug, marketplace_bio, marketplace_logo_url |
| whatsapp_no, email_notifications_enabled | nqrc_enabled, nqrc_merchant_name, nqrc_merchant_city, |
| created_at, updated_at | nqrc_account_id, nqrc_psp_guid, nqrc_mcc, nqrc_account_tag |

Backfill: every existing `entities` row is a POS merchant → `kind='pos_merchant'` + one
`merchant_profiles` row carrying its moved values. Hotels/operators get `kind='hotel'` /
`'travel_operator'` rows (see below).

**The 35 FKs into `entities(id)` are unaffected** — they reference the id, which stays. After P4
they simply become cross-schema (`pos.carts.entity_id → public.entities.id`), which Postgres allows.

## The real cost — and how we contain it

Extracting those columns would break **~100–150 POS read sites** (`tpn_gstin` ×52, `credit_limit`
×34, `nqrc_*`, `role`, `delivery_mode` ×13, marketplace slug…) plus the auth admin-console entity
routes, because they `select('… , credit_limit, tpn_gstin, …')` **from `entities`** and those
columns no longer live there. Rewriting 150 live call sites is the expensive, risky part.

**Containment — a compat join-view (mirrors the P4 approach):**
```sql
create view pos.entities with (security_invoker = true) as
  select e.*, m.role, m.tpn_gstin, m.credit_limit, m.delivery_mode, m.is_featured,
         m.shop_slug, m.marketplace_bio, m.marketplace_logo_url,
         m.nqrc_enabled, m.nqrc_merchant_name, m.nqrc_merchant_city,
         m.nqrc_account_id, m.nqrc_psp_guid, m.nqrc_mcc, m.nqrc_account_tag
  from public.entities e
  left join pos.merchant_profiles m on m.entity_id = e.id;
```
The POS app is flipped to default schema `pos` (already the A′ plan), so `.from('entities')` →
`pos.entities` (the join-view) and every existing read keeps working **unchanged** — storage is
fully generic, the view restores the old flat shape. Writes to moved columns are handled by
`INSTEAD OF INSERT/UPDATE/DELETE` triggers on the view that split the row across `entities` +
`merchant_profiles` (a dozen write sites; the trigger means we don't chase them individually).
The auth app (default schema `public`, mine) can't use a `public.entities` view (name clash with
the real table), so its admin-entity routes read/write `pos.merchant_profiles` explicitly via
`.schema('pos')` — a bounded, tracked change I own. Porting agent later migrates POS reads to the
real tables and we drop `pos.entities`.

## Migration (one sequence, integrated with P4)

Backup + PGDATA snapshot first; maintenance window; rollback rehearsed.

1. **Schema:** `create schema pos`; grants; add `pos` to `PGRST_DB_SCHEMAS`; reload.
2. **Genericize entities:**
   a. `alter table public.entities add column kind text; update … set kind='pos_merchant'; … not null`.
   b. `create table pos.merchant_profiles (entity_id uuid primary key references public.entities(id) on delete cascade, …15 cols…)`.
   c. `insert into pos.merchant_profiles select id, role, tpn_gstin, … from public.entities`.
   d. `alter table public.entities drop column role, tpn_gstin, … (15)`.
   e. Create the `pos.entities` join-view + `INSTEAD OF` triggers (above); grant.
3. **Hotel/travel links:**
   - `alter table hotel.hotels add column entity_id uuid references public.entities(id)`; per hotel,
     insert an `entities` row (`kind='hotel'`, name/contact/geo from `hotels`) and set `entity_id`.
   - `travel.operators`: confirm the existing `entity_id` FK + backfill `entities` rows
     (`kind='travel_operator'`) for any operator without one.
4. **P4 commerce move:** `alter table public.<pos_table> set schema pos` for the ~48 commerce
   tables (FKs/RLS/triggers/sequences ride along). Pin `search_path = pos, public` on the 190
   functions (also a security fix).
5. **Apps:** flip POS client default schema to `pos` (3 files, on disk — porting agent's app);
   update the auth admin-entity routes to read/write `pos.merchant_profiles` (mine). Rebuild both.
6. **Verify** (below); cut over; monitor.

## Verification checklist
- [ ] POS reads of merchant fields (`credit_limit`, `tpn_gstin`, `nqrc_*`, `shop_slug`) return values via `pos.entities`.
- [ ] Create/edit a merchant in the auth admin console → row split correctly across `entities` + `merchant_profiles`.
- [ ] A hotel and a travel operator each resolve to an `entities` row with the right `kind`.
- [ ] Place a live POS order end-to-end (cart→order→stock→khata); a representative embedded query works.
- [ ] RLS: non-privileged POS role sees only its rows; cross-entity read blocked.
- [ ] Row counts / `pg_dump` diff match pre-migration for entities + every moved table.

## Rollback
Per step, in reverse (`INSTEAD OF` triggers + view dropped; columns re-added to `entities` from
`merchant_profiles`; tables `set schema public`; app flip reverted — client-only). Nuclear: restore
the pre-migration PGDATA snapshot (original volume left intact).

## Open decisions (confirm at approval)
1. **Universal `entity_id` in the JWT?** Optionally set the access-token hook's `entity_id` from
   `hotel.hotels.entity_id` / `travel.operators.entity_id` so every tenant has an entity id in the
   token (today hotel/travel users get `scope_id` only). Nice consistency; not required. Default: **defer** — the modules use `scope_id` and this can follow later.
2. **`email_notifications_enabled`, `lat`/`lng`, `whatsapp_no`** — I've kept these on `entities` as
   generic. Move any to `merchant_profiles` if you consider them POS-only.
3. **Naming** — keep the table name `entities`, or rename to `businesses`/`tenants` for clarity?
   Rename adds churn (35 FKs + code); default: **keep `entities`**.

## Cost check (honest)
Full genericization is the cleanest model but the heaviest: ~150 POS read sites (shielded by the
join-view), a dozen write sites (shielded by triggers), the auth admin routes (mine), hotel/travel
backfills, plus the P4 move — all in one live window, coordinated with the porting agent. If at
approval the POS-app exposure feels too large, the **lightweight variant** (keep POS columns on
`entities`, nullable for hotels/operators; add only `kind` + `entity_id` links) delivers one tenant
registry at a fraction of the risk. Recommendation stands with your choice (full), via the
join-view/trigger technique that keeps the live cutover tractable.
