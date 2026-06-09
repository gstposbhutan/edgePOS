# Feature — Terminal provisioning / bootstrap (cloud → terminal)

**Status:** built (2026-06) · **Scope:** RETAILER desktop terminal.
**Related:** `terminal-licensing.md`, `offline-sync.md` (the inverse, terminal → cloud).

## What it is
First-run **cold-start provisioning**: a freshly-activated terminal pulls its store's catalog +
reference data from the cloud (Supabase) into its local PocketBase, so it can sell offline
immediately. It is the inverse of the ongoing terminal→cloud push (`offline-sync.md`).

## Flow
1. Triggered automatically by **activation** (`license:activate` → `doBootstrap()`), or manually via
   Settings → **"Pull catalog from cloud"**.
2. `doBootstrap()` (`desktop/electron/main.js`) calls **`GET /api/sync/bootstrap`** with the terminal
   bearer token (from the `.lic`). The cloud resolves the **store from the token, never the request**.
3. The endpoint returns the store's **active products, categories, khata accounts, and entity
   profile**, then `doBootstrap` upserts them into local PocketBase by business key
   (category name → product SKU → khata phone). Idempotent — safe to re-run.

## Field bridge (important)
The endpoint shapes products for PocketBase:
- **Supabase `selling_price` → PocketBase `sale_price`** (the per-unit / per-kg rate; carries the
  weighed-goods rate too — see `weighed-goods-labels.md`).
- Carries **`sold_by_weight`**; `mrp` / `wholesale_price` / `unit` / `barcode` map by the same name.
- First category name is flattened (PB `products.category` is single-select). `cost_price` is
  PB-only (left to default).

## What is NOT bootstrapped
Orders / inventory_movements (operational — the terminal starts fresh and pushes upstream),
`hsn_master` reference table (products carry `hsn_code` directly), and `product_batches`.

## Key files
- **Web:** `app/api/sync/bootstrap/route.js` (token-auth, entity-scoped, field mapping).
- **Desktop:** `electron/main.js` `doBootstrap()` + the `sync:bootstrap` IPC + Settings "Pull
  catalog" button (`app/settings/page.tsx`).

## Verified
Headless end-to-end against a live `pocketbase.exe` + the live endpoint: 1000 products bootstrapped,
`selling_price→sale_price` + `sold_by_weight` confirmed in the terminal DB after upsert.

## Open / pending
`hsn_master` pull; ongoing **delta refresh** (re-pull catalog/price/khata changes) — bootstrap is
first-run only today. See `pending-tasks.md`.
