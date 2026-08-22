# PELBU — user-model unification + schema tidy (phased)

Goal (agreed): one users/membership model, and `public` reserved for cross-platform
shared data while each module owns its own schema (`pos` / `hotel` / `travel`).

## Target

- **`auth.users`** stays the single identity store (already is).
- **`public.user_profiles` becomes the unified memberships table** — extended, multi-row per user:
  `id (surrogate PK) · user_id → auth.users · module ('pos'|'hotel'|'travel'|'platform') · scope_id (entity/hotel/operator id, null for platform) · role · sub_role · permissions · status`.
  One user can hold several rows (e.g. owner of many hotels). Filter by `role`/`module`.
- **`public`** keeps only shared/cross-platform tables (auth, user_profiles, shared reference).
  **POS tables move to a `pos` schema**; `hotel`/`travel` already have theirs.

## Key coupling (why this is one careful migration, not independent bits)

`user_profiles` is today **one row per user** (PK = `id` = `auth.uid()`), and the
`custom_access_token_hook`, `getAuthContext`, `auth_role()`/`auth_entity_id()` and
much of edgePOS read it with `.eq('id', uid).single()`. Making it multi-row (to hold
hotel/travel memberships) **requires updating those live-auth readers first** — so
folding hotel/travel in cannot be isolated from touching POS auth.

## Audit finding (2026-07-13) — reshapes P3

`user_profiles` is the de-facto **users table**: its `id` (= auth uid) is referenced by
**26 FKs** across live commerce (`orders.created_by`, `shifts.*_by`, `salesperson_id`,
`khata_*`, `refunds`, …), plus 7 DB functions, 2 RLS policies, and ~40 code reads keyed on
`id`. **Converting it to multi-row (a surrogate-PK swap) is therefore inadvisable** — it
breaks all 26 FKs. So user_profiles STAYS one-row-per-user (identity); multi-membership stays
in `hotel.managers` / `travel.supplier_profiles`, which the hook already unifies into the JWT.

## Phases (each: backup → change → verify → commit)

- **P0 — DONE** (`d064bd7`): post-login redirect resolves module from the membership tables.
- **P1 — DONE** (`e360949`, migration 117): `user_profiles` + `module`/`scope_id`/`status`/`user_id`,
  backfilled; `id` stays PK (one row per user), non-breaking.
- **P2 — DONE** (`767f46d`, migrations 118→119; GoTrue hook enabled): `custom_access_token_hook`
  now resolves a role for **every** user (user_profiles → hotel.managers → travel.supplier_profiles
  → CUSTOMER) and stamps `{role, module, scope_id, entity_id, sub_role, permissions}` into the JWT.
  Fixed two bugs that had left it dead: wrong contract (must write `event.claims.app_metadata`,
  not `event.app_metadata`) and NULL-poisoning of `jsonb_set`. RLS helpers already read the JWT.
  Every user now has a role; the 5 role-less staff (incl. `admin@nexus.bt`) are fixed.
- **P3 — REVISED / mostly moot:** do **not** multi-row `user_profiles` (see audit). Membership
  stays in `hotel.managers`/`travel.supplier_profiles`; the JWT is unified via the hook. A single
  `public.memberships` table is optional future tidy-up, but NOT via converting `user_profiles`.
- **P4 — DONE** (`546deab`, migration 121): executed together with the unified tenant model —
  see below and `docs/pelbu/TENANT-MODEL.md`. 54 commerce tables + 5 views moved to `pos`; only
  `user_profiles`/`entities`/`email_otps` remain in `public`; apps flipped to default schema `pos`
  with `pos.*` bridge views; verified end-to-end (embedding, reads/writes, hook, all apps).
- **P4 (original notes) — POS tables → `pos` schema:** `ALTER … SET SCHEMA pos`; repoint the POS data layer,
  `PGRST_DB_SCHEMAS`, RLS, FKs, functions; `public` keeps auth/user_profiles + shared refs.
  **Highest risk — live commerce; own maintenance window; ideally with the porting agent.**
  Mechanism chosen: **A′ full cutover** (flip POS client default to `pos` + redeploy). Now bundled
  with the **unified tenant model** (see `docs/pelbu/TENANT-MODEL.md`) so `entities` is touched once:
  `entities` becomes the generic tenant registry, POS-commercial columns extracted to
  `pos.merchant_profiles`, `hotel.hotels`/`travel.operators` gain `entity_id`. Design must be
  approved before execution.

## Guardrails
- Full `pg_dump` before P1–P4 (like the Supabase cutover). `public` is append-only —
  new `db/public/migrations/117_*.sql…`, never edit applied ones.
- POS is the porting agent's live app; P2–P4 rewrite its auth/data layer — coordinate.
- Roll back per phase by restoring the compatibility view / previous migration; the
  pre-phase dump is the ultimate fallback.
