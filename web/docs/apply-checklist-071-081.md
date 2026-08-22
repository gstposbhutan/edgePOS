# Apply checklist — Migrations 071–081 (terminal → cloud sync) to production Supabase

> ⚠️ **SUPERSEDED for a clean prod (2026-06-08).** The migrations were consolidated — the canonical schema is now `supabase/migrations/001_schema.sql` (flattened) + `002_seed.sql` (data). For an **empty** prod, just apply those two (`supabase db push --linked`, or run them in order) — they already include 071–081. **This delta checklist applies ONLY if prod already has the old 001–070** and you need to layer 071–081 on top. See the "Migration consolidation" note in `desktop-web-parity-fix-plan.md`.

**Status:** verified on the local Supabase stack + throwaway Postgres + a full e2e through `/api/sync/ingest`. **NOT applied to any cloud project.** Applying to production is your operational step — this is the runbook.

**Delta file:** [`migrations-071-081.sql`](./migrations-071-081.sql) — extracted verbatim from `web/supabase/migrations/001_schema.sql` (lines 4387–4690), proven idempotent + valid (re-applied cleanly on local, exit 0).

---

## ⚠️ Why you can't just `supabase db push`

These 11 migrations were **appended inside `001_schema.sql`** during development. A linked prod project already has `001_schema.sql` recorded as applied in its migration history, so `supabase db push` will treat it as done and **skip the new statements**. You must apply the **delta** explicitly (Option A/B below) or repackage it as a new migration file (Option C).

---

## What each migration does (and its risk)

| # | Change | Type | Risk |
|---|--------|------|------|
| 071 | `orders.payment_channel`; `pos_order_counters` table; `next_pos_order_no()` RPC | add col + table + fn | none (additive) |
| 072 | `orders.register_id` + index | add col | none |
| 073 | `cash_registers.machine_id` + `UNIQUE(entity_id, machine_id)` | add col + unique idx | low — unique index build; NULLs are distinct so existing rows unaffected |
| 074 | `orders.origin` + re-create 3 **confirm** triggers with `WHEN (origin <> 'TERMINAL_SYNC')` | add col + DROP/CREATE triggers | **trigger swap — wrap in txn** |
| 075 | `khata_transactions.external_id` + `apply_synced_khata_txn()` RPC | add col + idx + fn | none |
| 076 | `inventory_movements.external_id` + unique idx | add col + idx | none |
| 077 | `terminal_tokens` table (+ RLS enabled, no anon policy) | add table | none |
| 078 | re-create 2 **cancel** triggers with the same `origin` guard | DROP/CREATE triggers | **trigger swap — wrap in txn** |
| 079 | `order_items.external_id` + unique idx | add col + idx | none |
| 080 | `reverse_khata_on_refund()` RPC | add fn | none |
| 081 | **fix infinite recursion** in `sync_product_category_from_hsn` (BEFORE trigger was self-`UPDATE`ing → `stack depth limit exceeded` on ANY HSN-product update) | `CREATE OR REPLACE` fn | **correctness fix — apply even independent of sync** |

**Safety properties (all verified):** every statement is idempotent (`IF [NOT] EXISTS` / `CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS`); all additive (new columns are nullable, new tables, replaced functions) — **no data is dropped or rewritten**. Migration 081 is a standalone bug fix worth applying regardless.

---

## Pre-flight

1. **Confirm the target.** `supabase projects list` (or the dashboard) — be certain you're pointed at the intended **production** project, not staging.
2. **Back up.** Take a PITR checkpoint / on-demand backup (Dashboard → Database → Backups), or `pg_dump` the schema+data. Confirms a restore point exists.
3. **Confirm prerequisites exist on prod.** These build on objects from 001–004 / Migration 070: tables `orders`, `cash_registers`, `khata_accounts`, `khata_transactions`, `inventory_movements`, `order_items`, `products`, `user_profiles`, `entities`, `hsn_master`; functions `guard_stock_on_confirm`, `deduct_stock_on_confirm`, `khata_debit_on_confirm`, `restore_stock_on_cancel`, `khata_credit_on_cancel`, `apply_inventory_movement`. Quick check:
   ```sql
   SELECT to_regclass('public.terminal_tokens') AS tt,           -- expect NULL pre-apply
          to_regprocedure('public.guard_stock_on_confirm()') AS guard,  -- expect NOT NULL (prereq)
          to_regprocedure('public.sync_product_category_from_hsn()') AS hsn; -- expect NOT NULL (prereq)
   ```
4. **Dry-run first.** Apply to a Supabase **branch** or a staging clone, run the verification block, and ideally re-run the sync e2e there before touching prod.
5. **P0-7 first.** Rotate the committed prod `service_role` key + DB password **before** the ingest goes live (the ingest authenticates terminals, but it uses the service-role key server-side).

---

## Apply (choose one — always single-transaction)

**Option A — SQL editor (simplest).** Open the Supabase SQL editor, paste:
```sql
BEGIN;
-- <paste the entire contents of web/docs/migrations-071-081.sql here>
COMMIT;
```

**Option B — psql, one transaction (recommended):**
```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f web/docs/migrations-071-081.sql
```
`--single-transaction` + `ON_ERROR_STOP=1` → any failure rolls the whole apply back (no half-applied triggers).

**Option C — proper CLI migration (records history).** Repackage the delta as a new timestamped migration and push:
```bash
cp web/docs/migrations-071-081.sql \
   web/supabase/migrations/20260608000000_terminal_sync_071_081.sql
supabase db push --linked     # applies + records it in the migration history
```
Use this if you want the change tracked in `supabase_migrations`. Do **not** re-edit `001_schema.sql` for prod.

> Wrapping in a transaction matters mainly for 074/078/081 (trigger DROP+CREATE) — it guarantees there's never a window where a confirm/cancel trigger is missing.

---

## Post-apply verification (run on prod)

```sql
-- 1. New columns (expect all 6 rows)
SELECT table_name || '.' || column_name AS col
FROM information_schema.columns
WHERE (table_name='orders' AND column_name IN ('payment_channel','register_id','origin'))
   OR (table_name='cash_registers' AND column_name='machine_id')
   OR (table_name='khata_transactions' AND column_name='external_id')
   OR (table_name='inventory_movements' AND column_name='external_id')
   OR (table_name='order_items' AND column_name='external_id')
ORDER BY 1;

-- 2. New tables + RPCs (all non-null / true)
SELECT to_regclass('public.pos_order_counters')                                            AS pos_order_counters,
       to_regclass('public.terminal_tokens')                                               AS terminal_tokens,
       to_regprocedure('public.next_pos_order_no(uuid,text)')                              AS next_pos_order_no,
       (to_regprocedure('public.apply_synced_khata_txn(uuid,text,text,numeric,uuid,text,uuid)') IS NOT NULL) AS apply_synced_khata,
       (to_regprocedure('public.reverse_khata_on_refund(uuid,numeric,uuid,text)') IS NOT NULL)               AS reverse_khata_on_refund;

-- 3. Trigger origin-guards (all 5 -> has_when_guard = t)
SELECT tgname, (tgqual IS NOT NULL) AS has_when_guard
FROM pg_trigger
WHERE tgname IN ('orders_guard_stock','orders_deduct_stock','orders_khata_debit',
                 'orders_restore_stock_cancel','orders_khata_cancel')
ORDER BY tgname;

-- 4. Idempotency indexes (expect all 5)
SELECT indexname FROM pg_indexes
WHERE indexname IN ('idx_orders_register','idx_cash_registers_entity_machine',
                    'idx_khata_txn_external','idx_inventory_movements_external','idx_order_items_external')
ORDER BY 1;

-- 5. Migration 081 recursion fix — a bare HSN-product stock update must now succeed.
--    Wrap in a txn + ROLLBACK so it's a pure check with no data change:
BEGIN;
  UPDATE products SET current_stock = current_stock
  WHERE id = (SELECT id FROM products WHERE hsn_master_id IS NOT NULL LIMIT 1);  -- must NOT raise "stack depth limit exceeded"
ROLLBACK;
```

---

## After applying

1. **Issue terminal tokens** in the web admin (`/pos/terminals`, manager/owner/admin only) — one per terminal. A terminal can't sync until it has a token.
2. On each terminal: set the **sync API key** = the issued token, and the **ingest URL** = `https://<your-prod-domain>/api/sync/ingest`.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` (rotated, per P0-7) + `SUPABASE_URL` are set in the web deployment — the ingest route uses the service-role client.
4. Smoke-test with one terminal: push a small batch, then re-push it; confirm the response shows the second push as all `*Duplicate` / `inserted: 0` (idempotent), and stock/khata moved exactly once.

---

## Rollback

- **Failure during apply (txn):** automatic full rollback — no-op, safe to fix and retry.
- **After commit:** changes are additive, so the safest path is **forward-fix**, not revert. If you must remove them, drop the added columns/tables/indexes/functions and recreate the original (un-guarded) confirm/cancel triggers — **but do NOT revert Migration 081** (that reintroduces the `stack depth limit exceeded` recursion on HSN-product updates).

---

## Reminders

- Nothing here has been applied to any cloud Supabase. Verified only on the **local** stack (`127.0.0.1:55221`) + a throwaway Postgres.
- Migrations 071–081 are the complete set (the e2e also depends on 081, which the run surfaced + fixed).
