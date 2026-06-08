# Plan — Desktop peripherals: label maker + printer config (RETAILER terminal)

**Decisions (2026-06-08):**
- **Barcode / label maker → IN SCOPE** (user-confirmed). Build it as a feature, not just config.
- **Printer config** → fold the cheap *correctness* fixes (paper width + cash-drawer kick) into the existing Settings printer card (recommended default; the full picker/auto-print is optional polish).

Both are **RETAILER-desktop-only** (consistent with the platform split — only the retailer runs the Electron/PocketBase terminal). They sit *alongside* the desktop launch-blockers (`pocketbase.exe` bundle → `.lic` gate + activation → bootstrap), not ahead of them.

---

## 1. Label maker — why it's a feature, not a setting

"Barcode maker" = generate **scannable price/shelf labels** for products. The driving use case (confirmed 2026-06-08) is **loose / weighed goods** — rice, sugar, vegetables, fruit, repacked items — which arrive **without** a manufacturer barcode, so we **mint a Code128 from the SKU**. This needs generation + layout + a print path + config, so it's its own feature.

**Initial scope (confirmed 2026-06-08): SINGLE-label makers only — NOT A4 / sticker sheets.** One label per print (× copies), sized for a dedicated label printer / roll. A4 grid mode is **deferred** to a later phase.

### 1.1 Print path — hardware-agnostic (the key architectural choice)
**Do NOT** ship printer-specific label drivers (TSPL/Zebra ZPL/EPL). They're brittle, model-specific, and contradict the project's "no fragile integrations" guidance. Instead:

- Render the label as **HTML + CSS**, barcode as inline **SVG** (crisp at any DPI).
- Print via the **OS print dialog** (`window.print()` in the Electron renderer) with a print-only stylesheet that sets `@page { size: <w>mm <h>mm; margin: 0 }` — **one label per page**, repeated per copy.
- This targets a **dedicated label printer / roll**: set `@page` to the single-label size; the OS driver (already known to Windows) handles the roll. Zero new hardware integration, works on Windows 10+ out of the box.
- *(Deferred)* A4 / Avery sticker-sheet mode — a CSS grid of N×M labels on an A4 page, reusing the same label renderer.

### 1.2 Symbology
- **Auto:** if `product.barcode` is 13 numeric digits → **EAN-13**; else → **Code128** (encodes any alphanumeric — used for SKU-derived "made" barcodes).
- Override available in config.

### 1.3 Data — reuse what exists
`products` already has `name`, `sku`, `barcode`, `mrp`. No schema change. For a product with no `barcode`, the maker encodes its `sku` (and can optionally persist a generated barcode back — deferred).

### 1.4 Config (Settings → new "Labels" card)
Persisted in store settings (PocketBase `store_settings`): label `width_mm` / `height_mm`, `symbology` = `auto | code128 | ean13`, fields toggles (`name`, `mrp`, `sku`), `font_pt`, default `copies`.
**Defaults:** 40×30 mm, auto symbology, show name+MRP, 1 copy. *(Adjustable — guessing the default is low-risk because the card edits it.)* Sheet-mode fields (`columns`/`mode`) are **out of initial scope** (single-label only).

### 1.5 Triggers (inventory page — owner/manager)
- Per-row **"Print label"** (qty = copies prompt).
- Multi-select → **"Print labels"** (bulk).
- Optional: "Print labels for new products" (since last restock) — deferred.
Opens a dedicated **print view** (`/labels/print` or a print modal) that renders the grid and calls `window.print()`.

### 1.6 Library
`bwip-js` (barcode generator) — `toSVG()` runs in **both** node (testable) and the browser (renderer), no canvas/DOM dependency. `jspdf`/`html2canvas` already present if a PDF export is later wanted, but the **primary path is HTML+print** (no PDF needed).

### 1.7 Phasing
1. **Generation core** (this increment): `lib/labels.ts` — `barcodeSVG(value, opts)` (auto symbology) + `LabelConfig` defaults + `renderLabelsHTML(items, config)`. Headless-tested.
2. **Config card** in Settings (label size/columns/mode/symbology/fields/copies).
3. **Inventory triggers** + print view (`window.print()` + `@page`).
4. *(Deferred)* persist generated barcodes back to products; "new products" batch.

---

## 1A. Weighed goods at checkout (product config + checkout integration)

**Requirement (2026-06-08):** POS checkout must let the cashier print a barcode label for products **weighed at the counter**, where cost = weight × rate (loose rice, sugar, vegetables, fruit).

### Product config (schema impact — both stores)
Add a **`sold_by_weight`** boolean to `products`:
- **Desktop PocketBase** (`pb/pb_migrations`): new migration adding `sold_by_weight` (bool, default false) to the `products` collection. `unit` already exists (set to `kg`/`g`); `sale_price` is **reinterpreted as the per-unit (per-kg) rate** when `sold_by_weight`.
- **Web Supabase** (`products` table): matching `sold_by_weight boolean default false` so the central catalog + sync carry it.
- **Product editor UI** gains a "Sold by weight" toggle + unit selector; when on, the price field is labelled "Rate per {unit}".

### Checkout flow (reuses existing cart primitives — minimal change)
The cart already computes `total = unit_price × quantity` with **fractional** quantity, and already exposes `overridePrice`. So a weighed line is simply:
- `quantity` = the **weight** (e.g. 1.250), `unit_price` = the **per-unit rate** → `total = weight × rate`, GST 5% as normal — no cart-math change.

Flow: cashier selects a `sold_by_weight` product → a **weight-entry modal** (numeric, kg) → create the cart line with `quantity = weight`, `unit_price = rate`. An optional **"Print label"** action prints a single label (name, weight, computed price, barcode) via the label core (`LabelItem.weight/unit/price`).

### Barcode on the label  — **confirmed 2026-06-08: manual weight entry + Code128 of SKU**
Initial scope: **Code128 of the SKU**, weight entered manually in a numeric modal (no scale hardware). **Price-embedded EAN-13** (GS1 variable-weight, prefix 20–29) and **digital-scale integration** are both **deferred**.

### Label content (name / SKU)
- **Product name → YES**, shown at top (`show_name`, default on).
- **SKU → already printed as the human-readable caption *under* the Code128** (we pass `includetext: true`, so the encoded SKU renders as text below the bars). A *separate* SKU line is therefore redundant — `show_sku` defaults **off**, available as a toggle for shops that want it large/explicit.
- **Weight + computed price → YES** for weighed items; **MRP** for fixed-price items.
All controlled by the Labels config card toggles.

### Deferred
- **Digital scale integration** (serial/USB scale → auto weight). Manual entry first; a scale is a fragile per-model integration — add later behind a driver abstraction.
- Price-embedded barcodes; auto-tare.

### Status (2026-06-08)
Built + verified: `sold_by_weight` schema (PB migration 006 + `setup-pb.js`; Supabase 003, applied + verified local) · web product-editor toggle (multi-UOM via the existing unit dropdown) · desktop checkout weight modal + per-line weighed pricing · label print at checkout + the inventory shelf-label trigger + the Settings label-config card. Label core: 17 tests green.

### Cross-DB propagation — RESOLVED (2026-06-08)
`sold_by_weight` (and the per-unit rate) now propagates cloud→terminal via the **product bootstrap**:
- **`GET /api/sync/bootstrap`** (web) — same per-terminal bearer token as the ingest; entity resolved from the token. Returns this store's active products (+ category name), categories, khata accounts, entity profile. **Maps Supabase `selling_price` → PB `sale_price`** and carries `sold_by_weight`. (`cost_price` is PB-only, left to default.) Data layer verified against local Supabase.
- **`doBootstrap()`** (desktop `electron/main.js`) — the inverse of `doSync`; upserts categories (by name) → products (by SKU, resolving category) → khata (by phone) into local PocketBase. Idempotent; exposed via `sync.bootstrap()` IPC + a "Pull catalog from cloud" button in Settings.
- **First-run auto-bootstrap: DONE** — the `.lic` activation flow (`license:activate`) runs `doBootstrap()` automatically after a license is accepted, using the sync token + ingest URL carried in the `.lic`. Manual refresh via the Settings "Pull catalog from cloud" button.
- **`pocketbase.exe` bundling: DONE (2026-06-08)** — `scripts/fetch-pocketbase.mjs` fetches the pinned PocketBase **v0.37.3** binary per-platform into `pb/` (run via `npm run pb:fetch`; wired into `electron:build` / `electron:build:win`). `pb-launcher.js` now selects `pocketbase.exe` on Windows (never the Linux ELF). Fetched binaries are gitignored. **Runtime-verified on Windows**: the real `pocketbase.exe` launches and applies all migrations from a fresh data dir with zero errors, and `products.sold_by_weight` is present — so migration 006 (and the full PB schema) is confirmed at runtime.
- **Pending:** full Electron activation → bootstrap end-to-end on a packaged build.

---

## 2. Printer config — minimal additions (existing card)

`electron/printer.js` today: auto-detects the first USB ESC/POS printer, **hardcodes 32-char (58 mm)** width, Settings shows Status + Test Print only.

- **Paper width 58 mm / 80 mm** — *correctness*: 32-char layout misaligns on 80 mm (~48 char). Make width a setting; `formatReceipt` uses it.
- **Cash-drawer kick** — **optional** (confirmed 2026-06-08): not all terminals have a drawer wired through the printer. Ship as a per-terminal toggle, **default OFF**; when on, send the ESC/POS drawer pulse (`ESC p 0 ...`) after print.
- *(Optional polish, deferred)* printer picker if >1 USB printer, auto-print-on-sale toggle + copies.

---

## 3. Hardware barcode *reader* — no config UI needed
A retail USB scanner is a **keyboard-wedge HID** (plug-and-play, no driver). The POS home already has a `keydown` handler + `findByBarcode()`. Only refinement (code, not config): a true **wedge buffer** — detect rapid keystrokes ending in Enter → exact `findByBarcode()` rather than relying on the search highlight. No settings surface. *(Deferred — current behavior already functions.)*
