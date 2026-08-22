# Feature — Weighed goods + barcode label maker

**Status:** built (2026-06). **Detailed design / decisions:** `../../../desktop/docs/label-maker-plan.md`.
**Related:** `terminal-provisioning.md` (carries `sold_by_weight` + the per-unit rate to terminals).

## What it is
Two linked capabilities for loose / weighed goods (rice, sugar, vegetables, fruit, oil):
1. **Sell by weight/measure** at checkout — price = weight × per-unit rate (multi-UOM: kg, g, litre, ml, m).
2. **Print barcode labels** — shelf labels and weighed-item labels (Code128 / EAN-13).

## Product config
A **`sold_by_weight`** boolean on `products` (web Supabase migration `003_sold_by_weight.sql`;
desktop PocketBase migration `006_sold_by_weight.js` + `setup-pb.js`). When true, `selling_price`
(web) / `sale_price` (PB) is the **per-unit rate** and `unit` is the measure (kg/g/…). Set via the
web product editor's "Sold by weight / measure" toggle (`web/components/pos/products/product-form.jsx`
→ `/api/products/catalog`).

## Checkout (desktop POS)
Selecting a `sold_by_weight` product opens a **weight-entry modal**
(`desktop/components/pos/weight-entry-modal.tsx`); the line is created with `quantity = weight`,
`unit_price = rate`, so the existing fractional-quantity GST math gives `total = weight × rate` with
**no cart-math change** (`desktop/hooks/use-cart.ts` `addItem(product, weight)`). The modal offers
**Add** and **Add & Print** (prints the weighed label).

## Label maker
`desktop/lib/labels.ts` (17 unit tests) renders barcodes via **bwip-js → SVG** (auto symbology:
valid EAN-13 → EAN-13, else Code128 of the SKU) and lays out a single-label printable HTML doc with
an `@page` sized to the label; printed via the OS dialog (`lib/print-label.ts`) — hardware-agnostic,
no printer-specific drivers. SKU prints as the human-readable caption under the barcode.
- **Config** (per-terminal, localStorage): Settings → "Barcode Labels" card — size, symbology,
  fields, font, default copies (`desktop/lib/label-config.ts`).
- **Triggers:** checkout "Add & Print" (weighed) + inventory per-row **"Print label"** (shelf).

## Initial scope (confirmed)
Single-label printing (not A4 sheets) · manual weight entry (no scale integration) · Code128-of-SKU
(not price-embedded EAN-13). All three are deferred — see `label-maker-plan.md`.

## Open / pending
Web touch-POS weighed-checkout parity (desktop-only today; needs `sold_by_weight` in
`/api/products/sellable`); A4 sheets; price-embedded EAN-13; digital scale. See `pending-tasks.md`.
