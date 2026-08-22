# Category system consolidation — finding + plan

**Trigger:** admin/property-templates categories don't sync with admin/categories; "categories is
currently not used, get rid of it or merge with the HSN category/subcategory tree."

## Finding: there are TWO live category taxonomies

| | **A. Category TAGS** | **B. HSN category/subcategory** |
|---|---|---|
| Tables | `categories` (168) + `product_categories` join (**1,176 tags**) + `category_properties` (32) | `products.category`/`subcategory` (**all 1,212 products**), sourced from `hsn_master` (926 codes) |
| Admin UI | `app.pelbu.com/admin/categories` (configure per-category properties) | `app.pelbu.com/admin/property-templates` (free-text category → property template) |
| Property table | `category_properties` (keyed by `category_id`) | `category_property_templates` (keyed by category **name**) |
| Consumed by | marketplace (`/api/marketplace/[slug]`), catalog (`/api/products/catalog`, `/api/console/catalog`), **terminal sync** (`/api/sync/bootstrap` → `category_name`), restock/suppliers | retailer **product-form** custom fields (`/api/property-templates?category=`), AI enrichment |
| Distinct values | 168 tag categories | 169 product category strings / 12 HSN chapter categories |

**Neither is dead** — that's why "just delete categories" isn't safe: the tags drive the marketplace,
catalog and the desktop terminal's `category_name`. But they ARE redundant: every product already
carries an HSN‑derived `category` + `subcategory`, so the tag system duplicates a taxonomy the HSN
tree already provides more completely.

## Recommendation: consolidate onto the HSN category/subcategory tree

The HSN tree is authoritative (on 100% of products, backed by `hsn_master`), drives GST, and already
feeds the property‑template system the product form uses. Make it the single taxonomy; retire the tag
system. This is what "merge into the HSN tree" means in practice.

## Phased plan (each phase shippable + reversible until Phase 3)

- **Phase 0 — align the admin page + add subcategory (✅ DONE, `396d148`, migration 128).**
  `admin/property-templates` now sources the **live HSN category→subcategory tree** (`pos.category_tree()`
  RPC, 222 pairs) instead of free‑text; templates are keyed on **(category, subcategory)** (`''` =
  category‑level); the product form merges category‑level + subcategory properties. Backward‑compatible
  (the 7 existing templates became category‑level). `admin/categories` + tags untouched. **Fixes the
  reported "don't sync" bug.** Decision Q2 resolved: templates key on category **and** subcategory
  (subcategory tree lives on products — 222 pairs — since `hsn_master` has category but not subcategory).
- **Phase 1 — repoint consumers (✅ DONE, `85e42e8`).** Marketplace (groups by `products.category`;
  157 HSN groups — also fixed a pre‑existing `entity_id`→`created_by` bug that had the storefront
  broken), `sync/bootstrap` (`category_name` = `products.category`, 999/1000 products), and the
  products‑list category chips now read the HSN tree instead of the `product_categories` tags. Tables
  + authoring writes kept for the bake‑in. The product‑form edit chip‑selector is unchanged (Phase 2).
- **Phase 2 — remove tag authoring (✅ DONE, `d599967`).** Removed the category‑chip selector from all
  three product forms and stopped `product_categories` writes in the catalog routes (create no longer
  inserts; update no longer wipes). Verified: a create with explicit categoryIds writes 0 tag rows.
  Non‑destructive — tables + existing tags kept for the bake‑in.
  **⚠ PLAN CORRECTION:** `category_properties` is NOT part of the redundant tag system — all 32 rows
  are **HSN‑pattern‑keyed** (`hsn_chapter` + `applies_to_hsn_pattern` e.g. `3004.%`, `category_id`
  null) and feed the **entity‑product specifications**. So it is **not** migrated and **not** dropped,
  and **`admin/categories`** (which edits it) is **left intact** pending its own analysis. Only
  `categories` + `product_categories` are redundant.
- **Phase 2.5 — repoint the SECOND tier of consumers (✅ DONE in the working tree, 2026‑08‑13, not
  yet deployed).** A full re‑grep found a second tier Phase 1/2 missed: the two catalog‑list embeds,
  the console‑`[id]` + package tag writes, the bootstrap `categories` fetch, and the
  `admin/category-properties` `categories(...)` embeds in **both** apps. All repointed off the tag
  tables (HSN taxonomy kept). **Decision on `admin/categories` = RETIRE** (its `PropertyConfigModal`
  authored `category_id`‑keyed rows the live HSN read path never uses — already disconnected): the
  page, both `/api/categories`, the modal + type‑configs, and the sidebar links are deleted. Both apps
  build clean. Full audit + the deploy step: `CATEGORY-PHASE-3-PREP.md`.
- **Phase 3 — drop the redundant tables ✅ APPLIED to DEV (2026‑08‑18, migration `132`).** Dropped
  **`product_categories` + `categories`** (and the empty `entity_categories` join table); kept
  `category_properties` (+ its now‑FK‑less `category_id` column) and the wholesaler `category_id` columns.
  A live‑DB audit before the drop found more coupling than the prep doc listed (5 FK children, 2 dormant
  RLS policies, the `calculate_stock_predictions` JOIN) — all handled. `pg_dump` taken first
  (`backups/*_20260813_234041.dump`). Verified clean. **Prod not yet commissioned** (P9/P10).

## Decision needed
1. **Approve consolidating onto the HSN tree?** (vs. keeping tags and just linking the two admin pages.)
2. **Subcategory:** should property templates key on `category` only (today) or `category`+`subcategory`?
3. **Go-ahead to start Phase 0 now** (safe), and confirm you want Phases 1–3 sequenced after.

*Generated 2026‑08‑13. No destructive change made yet.*
