# Category Phase 3 — drop prep + **blocker audit**

**Status: ✅ Phase 3 APPLIED to the DEV DB (2026‑08‑18) — tag tables dropped, verified. Prod not yet
commissioned.** Companion to `CATEGORY-CONSOLIDATION.md`. Phase 2.5 (code repoint) shipped in `a9f22ca`;
the 2 late‑caught `categories(name)` embed gaps + the drop migration shipped in `753103e`. The drop was
applied via `db/public/migrations/132_drop_category_tag_tables.sql` (transactional, committed clean).
**Verified post‑drop:** `pos.categories`/`product_categories`/`entity_categories` gone; `category_properties`
+ both wholesaler `category_id` columns kept; zero FKs reference categories; `calculate_stock_predictions`
has no `product_categories` dependency; `backfill_product_categories_from_hsn()` dropped; RLS clean; all
app routes 401 (no 500s). **⚠ SEPARATE PRE‑EXISTING BUG surfaced (NOT caused by this):** `pos.calculate_stock_predictions`
references `im.timestamp` but `pos.inventory_movements` has `created_at` — the function errors at line 40
regardless of categories. Preserved verbatim here; needs its own tiny fix (`im.timestamp`→`im.created_at`).

The plan's Phase 3 ("drop `product_categories` + `categories` only") understated the coupling. Phases 1/2
repointed the **headline** consumers (marketplace, products‑list chips, product‑form authoring), but a
**second tier** of live consumers still read/wrote both tables. **Phase 2.5 repointed/removed all of that
second tier** — see the ✅ log below. A live‑DB audit before the drop found even more coupling than this
doc originally listed (5 FK children, 2 RLS policies, `entity_categories`) — all handled in migration 132.

Generated 2026‑08‑13 from a full `grep` of the repo + schema. No destructive change made.

---

## ✅ Phase 2.5 — SHIPPED to the working tree (2026‑08‑13, not yet deployed)

A fresh grep found **more** than the original audit (the `admin/category-properties/[id]` routes
in **both** apps carry three `categories(...)` embeds each — missed below). All handled:

**Repointed off the tag tables (kept the HSN taxonomy):**
- `products/catalog/route.js` + `console/catalog/route.js` — dropped the `product_categories(...)`
  embed and the `.from('categories')` list; return `categories: []` for shape stability. Added
  `category, subcategory` to the console select so the vendor list can badge the HSN taxonomy.
- `components/console/vendor-catalog.jsx` — badges now read `product.category`/`subcategory`.
- `console/catalog/[id]/route.js` + `products/catalog/[id]/package/route.js` — removed the
  straggler `product_categories` writes Phase 2 missed (C, D). Dropped now‑unused `categoryIds`.
- `sync/bootstrap/route.js` — removed the `.from('categories')` fetch; the terminal's `categories`
  now derive from the **distinct HSN category names** of the store's products.
- `admin/category-properties/route.js` + `[id]/route.js` (**pos + auth**) — stripped every
  `categories(...)` embed and the dead (SUPER_ADMIN‑guarded) DISTRIBUTOR ownership reads; the live
  **HSN path** (`get_hsn_properties`) is untouched. `category_properties` itself stays.

**Retired the tag‑category admin surface** (decision §2.4 = **retire**, not rework — the
`PropertyConfigModal` authored `category_id`‑keyed rows that the live HSN read path never looks up,
so it was already disconnected):
- Deleted `auth/admin/categories/page.jsx`, both `/api/categories/route.js`, the
  `property-config-modal.jsx` + `property-type-configs.jsx` (both apps), and the "Categories"
  sidebar nav items (both apps; also dropped the now‑unused `FolderTree` import).
- *(An HSN‑keyed property editor — the "rework" alternative — is a deferred follow‑up.)*

**Verified:** `grep` shows zero `.from('categories')` / `.from('product_categories')` / tag embeds
left in source; **both `@pelbu/pos` and `@pelbu/auth` build clean.**

**Deploy to unblock the drop:** `npm run build -w @pelbu/pos && docker compose up -d --build pos`
(and `@pelbu/auth` / service `auth`), then let it bake before running §4.

---

## 1. Why it wasn't safe — live consumers on the tag tables (⟶ all resolved by Phase 2.5 above)

### `product_categories` (join/tags)
| # | File | What it does | Break on drop |
|---|------|-------------|---------------|
| A | `apps/pos/app/api/products/catalog/route.js:19` | `products` SELECT **embeds** `product_categories(category_id, categories(id, name))` | **500** — PostgREST can't resolve the embedded relationship → whole query errors (route checks `productsResult.error`). Retailer catalog list breaks. |
| B | `apps/pos/app/api/console/catalog/route.js:27` | same embed | **500** — vendor console catalog list breaks. |
| C | `apps/pos/app/api/console/catalog/[id]/route.js:51,53` | `delete()` + `insert()` on `product_categories` (product edit) | write error on every edit. |
| D | `apps/pos/app/api/products/catalog/[id]/package/route.js:103,196,198` | `insert()` + `delete()` + `insert()` (package build) | write error on package create/edit. |
| E | `apps/pos/components/console/vendor-catalog.jsx:370` | reads `product.product_categories` from the embed | moot once A/B embeds removed (renders empty). |

### `categories` (tag categories)
| # | File | What it does | Break on drop |
|---|------|-------------|---------------|
| F | `apps/pos/app/api/products/catalog/route.js:25` | separate `.from('categories')` for the `categories:` payload | degrades to `[]` (error unchecked) — dead data. |
| G | `apps/pos/app/api/console/catalog/route.js:32` | same | degrades to `[]`. |
| H | `apps/pos/app/api/sync/bootstrap/route.js:63` → pushed at `:128` (`categories: categoriesRes.data ?? []`) | full categories list shipped to the **terminal** | terminal gets empty categories (error unchecked → `[]`). |
| I | `apps/pos/app/api/categories/route.js` **and** `apps/auth/app/api/categories/route.js` | GET `.from('categories')` (error‑checked) — backs the `admin/categories` page | **500** — admin/categories page breaks. |
| J | `apps/pos/app/api/admin/category-properties/route.js:95` **and** `apps/auth/...` | DISTRIBUTOR‑ownership check reads `categories` | **500** for a DISTRIBUTOR editing properties. |

> **The plan already half‑flagged this:** it said `admin/categories` "currently lists the
> soon‑gone `categories` table" and left "rework admin/categories" as an open question.
> That rework (I/J) is a hard prerequisite, not an afterthought.

### DB‑level dependencies (must be handled in the migration)
| # | Object | Dependency | Handling |
|---|--------|-----------|----------|
| K | `pos.distributor_wholesalers.category_id` | **FK → categories(id)** (migration 082; column nullable "for v1", effectively unused) | drop the FK constraint (keep or drop the column — recommend drop the column, it's unused). |
| L | `pos.calculate_stock_predictions(uuid)` | function body `JOIN product_categories pc` for a **category‑level lead‑time fallback** (`001_schema.sql:~334`) | `CREATE OR REPLACE` the function with the middle `COALESCE` branch removed. Late‑bound → **not** caught by CASCADE; calling it after the drop raises `relation "product_categories" does not exist`. |
| M | `public.backfill_product_categories_from_hsn()` | function body references `product_categories` (backfill utility, not a runtime path) | drop the function (or leave; it only errors if called). *(This one is in `public`.)* |
| N | `pos.category_properties.category_id` | **FK → categories(id) ON DELETE CASCADE** (`001_schema.sql:3499`); all 32 rows are HSN‑pattern‑keyed with `category_id` **NULL** | **Drop the FK constraint but KEEP the column** (nullable, unused). Phase 2.5 left the `category_properties` routes' harmless `category_id` handling in place (dead — no UI sends it — but valid), so keeping the column avoids code churn. `category_properties` STAYS. *(A later cleanup can drop the column once the HSN‑property‑editor rework decides the final shape.)* |

**⚠ SCHEMA CORRECTION (2026‑08‑13):** the POS tables live in the **`pos` schema** (migration 121
flip), not `public` — verified against `pg_tables`: `pos.categories`, `pos.product_categories`,
`pos.distributor_wholesalers`, `pos.category_properties`, and `pos.calculate_stock_predictions`.
Only `public.backfill_product_categories_from_hsn` is in `public`. The web routes work because
PostgREST maps `.from('categories')` → `pos.categories`. All raw SQL below is `pos.`‑qualified.

---

## 2. Required BEFORE the drop — "Phase 2.5" (code repoint, non‑destructive)

**✅ All five items below are DONE in the working tree (see the ✅ log at the top). Left here as the
original spec.**

1. **Remove the `product_categories(...)` embed** from the two catalog SELECTs (A, B). The
   category display already comes from `products.category`/`subcategory` (Phase 1). Update
   `vendor-catalog.jsx` (E) to read `product.category` instead of the tag names.
2. **Stop the remaining tag writes** (C, D) — the console‑catalog `[id]` update and the
   package route (Phase 2 stopped the *create* routes but missed these two).
3. **Repoint or remove the `categories:` payloads** (F, G, H) — either drop the field
   (nothing authors tags anymore) or source the list from the HSN tree
   (`pos.category_tree()` / distinct `products.category`). The terminal (H) should get the
   HSN category list if it needs one at all.
4. **Decide `admin/categories` (I, J):** either (a) **retire** the page + `/api/categories`
   + the DISTRIBUTOR branch of `admin/category-properties`, or (b) **rework** it into an
   HSN‑property editor (the plan's open question). `category_properties` itself stays.
5. Deploy + bake in. **Only then** run the migration below.

---

## 3. Backup command (run on the box, BEFORE the migration)

```bash
# On the box (or via docker exec). Dumps the two doomed tables (schema+data) as a
# restore point, plus a full-DB safety net. Adjust the timestamp by hand.
TS=20260813            # set to today's date; Date.now() intentionally not scripted here
docker exec pelbu-supabase-db-1 pg_dump -U postgres -d postgres \
  -t pos.categories -t pos.product_categories \
  --format=custom -f /tmp/phase3_tagtables_${TS}.dump
docker cp pelbu-supabase-db-1:/tmp/phase3_tagtables_${TS}.dump ./backups/

# Full-DB safety net (recommended given FK/function edits):
docker exec pelbu-supabase-db-1 pg_dump -U postgres -d postgres \
  --format=custom -f /tmp/full_${TS}.dump
docker cp pelbu-supabase-db-1:/tmp/full_${TS}.dump ./backups/
```

---

## 4. Migration draft — `NNN_drop_category_tag_tables.sql` (⛔ DO NOT APPLY until §2 ships)

> Kept **out of `db/public/migrations/`** on purpose so a "apply all migrations" pass can't
> run it prematurely. Move it in only when Phase 2.5 is deployed + baked. **Pick the next free
> number when unblocked** (129 is now `product_stock_rotation`; use ≥ the current max + 1).

```sql
-- NNN_drop_category_tag_tables.sql — Category consolidation Phase 3 (DESTRUCTIVE).
-- PRECONDITION: Phase 2.5 (code repoint) deployed; pg_dump taken. Idempotent.
-- NOTE: tables are in the `pos` schema (migration 121), not public.
BEGIN;

-- K: unhook distributor_wholesalers from categories (column is unused, "v1" nullable)
ALTER TABLE pos.distributor_wholesalers DROP CONSTRAINT IF EXISTS distributor_wholesalers_category_id_fkey;
ALTER TABLE pos.distributor_wholesalers DROP COLUMN IF EXISTS category_id;

-- L: patch pos.calculate_stock_predictions to drop the product_categories JOIN fallback.
--    (CREATE OR REPLACE with the full current body minus the middle COALESCE branch —
--     copy the live definition first: \sf pos.calculate_stock_predictions)
-- <PASTE PATCHED FUNCTION HERE before running>

-- M: retire the backfill helper (references product_categories) — this one IS in public
DROP FUNCTION IF EXISTS public.backfill_product_categories_from_hsn();

-- N: category_properties.category_id FK would drop with the parent via CASCADE, but be explicit.
--    KEEP the column (nullable, unused) — Phase 2.5 left harmless category_id handling in the routes,
--    so dropping the column would require more code churn for no benefit. Drop only the FK.
ALTER TABLE pos.category_properties DROP CONSTRAINT IF EXISTS category_properties_category_id_fkey;
-- (Intentionally NOT dropping pos.category_properties.category_id — see §1 row N.)

DROP TABLE IF EXISTS pos.product_categories;   -- child first
DROP TABLE IF EXISTS pos.categories;

COMMIT;
-- Then: NOTIFY pgrst, 'reload schema';
```

**Post‑run checks:** retailer + console catalog lists load; terminal bootstrap succeeds;
`admin/categories`/property‑templates behave per the §2.4 decision; reorder suggestions
(`calculate_stock_predictions`) still run.
