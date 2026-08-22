# P4 — POS tables → `pos` schema: cutover plan (for review)

Status: **proposed, not started.** Highest-risk phase of the user-model/schema tidy
([[USER-MODEL-UNIFICATION]]). This touches the **live** edgePOS commerce app owned by the
porting agent. Nothing here runs without explicit go-ahead + a maintenance window + the
porting agent in the loop.

---

## TL;DR + recommendation

The goal (P4) is aesthetic: make `public` hold only cross-platform shared data and move the
POS/edgePOS tables into a `pos` schema (hotel/travel already own theirs). The audit below shows
the **cost is high and the ROI is low**, because edgePOS was built with no schema abstraction.

- **Recommendation A (default): defer P4** unless there's a concrete driver (naming collision,
  a real multi-schema query need, or a compliance boundary). Instead, *enforce the principle
  going forward*: `public` = shared identity + reference; every **new** POS-only table/feature
  lands in `pos` from day one; hotel/travel stay in their schemas. This gets ~90% of the benefit
  at ~0% of the risk. The existing 58 tables stay put — `public` is effectively "the POS schema"
  today and renaming it buys little.
- **Recommendation B (if we proceed anyway):** use the **compat-view mechanism** ("A′" below) —
  move the ~48 POS tables to `pos`, leave thin auto-updatable views in `pos` for the ~6 shared
  tables, flip the POS Supabase client's *default schema* to `pos` (a 3-file change, not a
  3,237-site rewrite), and pin `search_path` on every function. Do it table-group by table-group
  behind a full backup, each group verified before the next. Budget it as its own multi-day
  effort with the porting agent, not a side-task.

**Do not** attempt the "rewrite every query" approach (option B in the mechanism section) — it
edits thousands of live call sites and is pure downside.

---

## What P4 actually touches (audit — 2026-07-13)

| Surface | Count | Implication |
|---|---:|---|
| `public` base tables | 58 | ~48 move, ~6 stay, a few undecided (see split) |
| POS-app `.from()` call sites | **3,237** | No schema qualification anywhere → can't hand-edit |
| …of which hit shared tables | 779 | `user_profiles` 543, `entities` 236 — must stay reachable |
| POS-app files using PostgREST **embedding** | 118 | Nested `select('…, child(*)')` — the #1 validation risk |
| `public` functions | 195 (13 SECURITY DEFINER) | **190 pin no `search_path`** → rely on `public` being default |
| RLS policies on `public` | 50 | Ride along with `SET SCHEMA`; helpers read the JWT, unaffected |
| Triggers on `public` tables | 30 | Move with the table automatically |
| `public` views | 5 | `*_with_hsn`, `sellable_products`, `package_contents`… move too |
| Realtime publication (`supabase_realtime`) | **empty** | Not a blocker; POS realtime (8 files) uses channels, verify |

**The two facts that dictate the mechanism:**
1. The app never qualifies a schema (no `db: { schema }`, raw `.from('x')` × 3,237). So the move
   must be transparent to the app — either the table keeps its old name reachable (a view) or the
   client's *default* schema changes (one place), never per-call edits.
2. 190/191 functions have **no pinned `search_path`** — they find `products` etc. via the default
   `public`. Move the table out of `public` and those functions break *unless* a same-named object
   remains resolvable (a view) or their `search_path` is repointed.

---

## Mechanism options

### A′ — tables to `pos`, flip the app default, views only for shared **(recommended if proceeding)**
- `ALTER TABLE public.<pos_table> SET SCHEMA pos` for the ~48 commerce tables. FKs, triggers,
  owned sequences, indexes, and RLS **ride along automatically**. FKs into `public.user_profiles`
  / `public.entities` become valid **cross-schema** FKs (Postgres allows this; nothing to change).
- Leave the ~6 shared tables in `public`; create thin **`security_invoker`** views in `pos`
  (`pos.user_profiles` → `public.user_profiles`, etc.) so unqualified reads still resolve.
- Flip the POS Supabase client **default schema to `pos`** in the 3 client factories
  (`apps/pos/lib/supabase/{server,client,middleware}.js` — set `db: { schema: 'pos' }`). Now all
  3,237 `.from()` calls target `pos.*`; POS tables are real (native embedding works — the 118
  embedding sites keep working because the FKs are intact within `pos`); shared tables resolve via
  the `pos` views.
- Pin `search_path = pos, public` on all 190 unpinned functions (scripted bulk `ALTER FUNCTION`).
  This is also a **security fix** — unpinned `search_path` on SECURITY DEFINER functions is a known
  privilege-escalation vector (overlaps task #7 security cleanup).
- **Pros:** ~3-file app change; native embedding (no view-embedding risk for POS tables); clean
  end-state; security win. **Cons:** the `search_path` bulk change + the shared-table views must be
  right; still a live-app schema flip.

### A — tables to `pos`, keep app default `public`, compat views in `public` for everything moved
- Same table moves, but instead of flipping the app default, create ~48 `security_invoker` views
  in `public` with the old names. App unchanged; functions unchanged (they resolve the public
  views). **Cons:** all **118 embedding sites now embed *through views*** — PostgREST v14 supports
  view embedding for simple views but it's the single biggest thing that can silently break; plus
  ~48 views to own indefinitely. Prefer A′ unless we can't touch the app clients at all.

### B — repoint every query (rejected)
- Set default `pos` and hand-qualify the 779 shared reads with `.schema('public')`, or qualify all
  2,458 POS reads with `.schema('pos')`. Thousands of edits in the live app. **All risk, no upside
  over A′.** Do not do this.

---

## Proposed `public` ↔ `pos` split (for review)

**Stay in `public` (shared identity / platform):**
`user_profiles`, `entities`, `consumer_accounts`, `notifications`, `email_otps`, `audit_logs`.

**Move to `pos` (commerce-specific, ~48 + 5 views):** everything else —
`orders`, `order_items`, `order_status_log`, `order_cancellation_items`, `pos_order_counters`,
`carts`, `cart_items`, `favourites`, `products`, `product_batches`, `product_categories`,
`product_packages`, `product_price_history`, `categories`, `category_properties`,
`category_property_templates`, `units`, `hsn_master`, `entity_products`,
`entity_product_specifications`, `entity_categories`, `entity_packages`, `package_items`,
`cash_registers`, `cash_adjustments`, `shifts`, `shift_transactions`, `shift_reconciliations`,
`khata_accounts`, `khata_transactions`, `khata_repayments`, `khata_alerts`, `refunds`,
`replacements`, `riders`, `warehouses`, `warehouse_stock`, `inventory_movements`,
`draft_purchases`, `draft_purchase_items`, `stock_predictions`, `supplier_lead_times`,
`licenses`, `license_requests`, `terminal_tokens`, `payment_attempts`, `owner_stores`,
`distributor_wholesalers`, `retailer_wholesalers`, `desktop_releases`, `face_profiles`
+ the 5 views (`hsn_code_properties`, `entity_products_with_hsn`, `package_contents`,
`products_with_hsn`, `sellable_products`).

**Open decisions (need your / the porting agent's call):**
1. **`entities`** — the tenant/business registry. It's shared in spirit but has 236 POS reads and
   is edgePOS-shaped. Keep in `public` (proposed) or move to `pos`?
2. **`notifications`, `email_otps`, `whatsapp_otps`** — treat as shared platform infra (public) or
   POS-owned? (`whatsapp_otps` is slated for removal in #24 regardless.)
3. **`face_profiles`, `consumer_accounts`** — POS customer/biometric data: shared identity or POS?

---

## Cutover procedure (mechanism A′), phased by table group

Run in a maintenance window (POS briefly read-only or paused). Each **group** = a set of tables
with tight mutual FKs (move together so no FK dangles mid-migration): e.g. `products*`+`categories`
+`units`; `orders*`+`carts*`; `khata*`; `shifts*`+`cash*`; inventory/warehouse; the rest.

0. **Prep** — full `pg_dump` (schema+data) to `/home/ubuntu/pelbu-backups/<ts>-p4/`; snapshot the
   PGDATA volume (same lossless copy technique used in the Supabase relocation). Freeze POS writes.
1. **Schema + grants** — `create schema pos; grant usage on schema pos to anon, authenticated,
   service_role;` add `pos` to `PGRST_DB_SCHEMAS` (`infra/supabase/.env`) and reload PostgREST.
2. **Move a group** — `alter table public.<t> set schema pos;` per table in the group. FKs,
   triggers, sequences, indexes, RLS ride along. Re-grant table privileges in `pos`
   (`grant … on all tables in schema pos to anon, authenticated, service_role;` + default privs).
3. **Shared views (once)** — `create view pos.<shared> with (security_invoker=true) as select *
   from public.<shared>;` for the 6 shared tables; grant on them.
4. **Functions** — bulk `alter function … set search_path = pos, public;` for the 190 unpinned
   ones (generate from `pg_proc`). Recheck the 5 views' definitions still resolve.
5. **Verify the group** (see checklist) before moving the next group.
6. **Flip the app** — once *all* groups are in `pos`, set `db: { schema: 'pos' }` in the 3 POS
   client factories, rebuild, restart. (Until this flip, the app still reads `public`; so either
   flip per-group with temporary `public` views, or — simpler — keep `public` names live via views
   during the move and flip once at the end. Recommended: **move everything, then flip once**,
   minimizing the window where the app is half-migrated.)
7. **Unfreeze**, smoke-test live, monitor.
8. **Later (separate change):** drop the temporary `public` compat views once the app is verified
   fully `pos`-native; keep only the 6 `pos`→`public` shared views.

---

## Dependency handling (why each is safe)

- **FKs:** `SET SCHEMA` preserves them (referenced by OID). POS→`user_profiles`/`entities` become
  cross-schema FKs — fully supported, no change.
- **Functions (190):** the `search_path = pos, public` pin makes unqualified table refs resolve in
  `pos` first, then `public` (for the shared tables). Also closes a real security hole.
- **RLS (50):** policies move with their table. Helpers (`auth_role()`/`auth_entity_id()`/
  `auth_module()`) read the JWT, not table location — unaffected.
- **PostgREST embedding (118):** with A′ the POS tables are *real* in `pos` and their FKs are
  intact, so embedding is native. Shared-table embedding across schemas (e.g. `orders→user_profiles`)
  isn't native anyway and the app already reads those standalone — confirm no cross-schema embed is
  relied on (grep the 118 files for nested `user_profiles(`/`entities(`).
- **Realtime:** publication is empty today; if POS later adds `postgres_changes`, add `pos` tables
  to the publication. The 8 channel files use it — verify post-flip.
- **Sequences/defaults/triggers:** owned sequences and triggers move with `SET SCHEMA`; `nextval`
  default expressions are rewritten to the new schema automatically.

---

## Verification checklist (per group + final)

- [ ] `SELECT` on each moved table works via the app default (post-flip) and via a shared view.
- [ ] `INSERT/UPDATE/DELETE` through the flipped client on a moved table + through a `pos` shared view.
- [ ] A representative embedded query from the 118 (e.g. `orders?select=*,order_items(*)`) returns rows.
- [ ] RLS: a non-privileged POS role sees only its rows; a cross-entity read is blocked.
- [ ] Each SECURITY DEFINER function called by the app (RPC) still runs (search_path pin correct).
- [ ] Place a live test order end-to-end (cart → order → stock movement → khata) on staging data.
- [ ] `pg_dump` diff / row counts match pre-move for every moved table.

---

## Rollback

- **Per group:** `alter table pos.<t> set schema public;` (reverse). Views/grants dropped in reverse.
- **App flip:** revert the 3-file `db.schema` change + redeploy (client-side only; DB untouched).
- **Nuclear:** restore the pre-P4 PGDATA volume snapshot (edgepos-style lossless restore); the
  original volume is left intact as the ultimate fallback.

## Go / no-go

Proceed only when: full backup + volume snapshot taken; porting agent available for the window;
staging dry-run of the whole sequence passed (especially the 118 embedding sites); a rollback was
rehearsed. Otherwise **defer** per the TL;DR and enforce the principle for new tables only.
