# Desktop terminal — parity checklist (do in ONE pass on the `desktop` branch)

Every web change from the 2026-08-13 product-register + FEFO work that the **desktop terminal**
still needs. Shawn's call: batch it all into a single desktop pass **after the web side is finished**.

**Desktop = separate TS/Electron app** in `desktop/` on the `desktop` branch, backed by **local
PocketBase** (no `/api/hsn`, `/api/products/brands`, etc. offline). Catalog syncs DOWN via
`sync/bootstrap`. Product form = `desktop/components/pos/product-form-modal.tsx` (it DOES
create/edit locally). Checkout add paths: `product-grid.tsx`, `keyboard/product-search-modal.tsx`,
`barcode-scanner.tsx` → cart.

Port the web logic where it already exists: `apps/pos/lib/products/sku.js`,
`apps/pos/lib/products/fefo.js`, `hsn-picker.jsx`, `brand-picker.jsx`.

---

## A. Product registration modal (`product-form-modal.tsx` + local PB schema)

- [ ] **Modal width 80%** — `sm:max-w-xl` → `sm:max-w-[80vw]` (web: `882c679`).
- [ ] **HSN code = searchable/filterable picker** (web `hsn-picker.jsx`). ⚠ **Data source Q:** terminal
      has no `/api/hsn`. Either (a) **sync `hsn_master` (~926 rows)** into a local PB collection on
      bootstrap → local picker w/ chapter+category filters (recommended, works offline), or (b) call
      cloud `/api/hsn` when online.
- [ ] **Brand / Manufacturer = select-or-add combobox** (web `brand-picker.jsx`), **shared/global**.
      ⚠ Needs a `brand` field on the local products collection + a brand-list source: sync the shared
      list from cloud on bootstrap, or call cloud `/api/products/brands` when online.
- [ ] **Auto-SKU when blank** = `<VENDOR-ABBR>-001`, continue existing series, globally unique
      (web `sku.js`, `46a8f5b`). ⚠ **Uniqueness Q:** cloud enforces global `UNIQUE(sku)`; if the
      terminal mints SKUs offline they must not collide on sync-up — decide the strategy (e.g. mint on
      cloud, or reserve a per-terminal range, or validate on sync).
- [ ] **Rotation toggle** — 3-way **None / FIFO / FEFO** (`stock_rotation`, default FIFO;
      web `5333028` + `5651ff8`). Needs a `stock_rotation` field on the local products collection.
      NONE = no rotation policy / no warning.
- [ ] **FEFO receive-time expiry rule** — receiving a batch for a FEFO product requires an expiry
      (web = DB trigger `enforce_fefo_batch_expiry`; desktop = enforce in the receive flow + local
      guard). Also block switching a product to FEFO while expiry-less in-stock batches exist.

## B. Checkout — FEFO older-batch warning (`product-grid`, `product-search-modal`, `barcode-scanner`, cart)

- [ ] **Warn when a non-oldest batch is added/scanned** for a FEFO product (web `84acd51` + `da18fb1`
      + touch `7381f54`). Non-blocking amber banner: "an older batch (expires …) should sell first".
      Terminal has local batches → compute the product's earliest ACTIVE (qty>0) batch expiry locally
      (port `fefo.js`); warn when the added batch expires later. Must cover **all** add paths incl.
      **barcode scan** (the web gap that had to be fixed separately).
- [ ] **Auto-split a quantity across batches** (FEFO/FIFO, oldest first) when one batch can't cover it,
      at add and on qty-increase (web `05215f1` + `4ea4d78`; port the `/api/pos/allocate` logic).
- [ ] **Explicit batch-override picker** — a "change batch" affordance on cart lines listing the
      product's batches, switching the line + re-pricing to that batch (web `5651ff8`).

## C. Cloud-side enablers (web work that unblocks desktop — can ride with the web pass)

- [ ] **`sync/bootstrap` must send `stock_rotation`** per product to the terminal (currently not in the
      payload — `apps/pos/app/api/sync/bootstrap/route.js`). Confirm per-batch `expires_at` is already
      synced (needed for the FEFO warning).
- [ ] **Bootstrap `categories` now derive from HSN** (category consolidation Phase 2.5): the top-level
      `categories` payload is no longer the `pos.categories` tag list — it's the **distinct HSN category
      names** of the store's products (`[{ name }]`, no `id`). If the terminal keyed its local PB
      categories by `id`, adjust it to key by `name` (products already carry `category_name`).
- [ ] Optionally sync `hsn_master` + the shared brand list down on bootstrap (see A).

## Not needed / out of scope
- Modal-close fix, nav-icon sizes, day/night removal — **already done on desktop** (prior sessions).
- **Admin → Manufacturers merge** — cloud auth app only, not a terminal feature.
- **FEFO Phase B** (auto-allocate oldest + per-batch pricing + deduction rewrite) — not built on web
  yet; when it lands, the terminal's sell/deduct path will need its own parity pass.

*Generated 2026-08-13. Companion to [[pelbu-product-register-and-phase3-block]] +
docs/pelbu/FEFO-FIFO-DESIGN.md.*
