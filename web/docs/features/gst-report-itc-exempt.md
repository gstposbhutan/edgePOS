# Feature: GST report + B2B ITC + GST-exempt products (Phase 5)

**Feature ID**: F-GST-001
**Status**: In progress
**Phase**: 5 of the distributor/wholesaler parity plan (GST report + ITC), extended with GST-exempt products.

---

## 1. Scope

Three related pieces:
1. **GST report** — per-period output tax (GST collected on sales), input tax (GST paid on purchases),
   net GST payable, and a taxable-vs-exempt sales breakdown. For filing.
2. **B2B Input Tax Credit (ITC)** — the input side of the report: GST an entity paid on its purchases,
   offsettable against output tax. Falls out of `orders`.
3. **GST-exempt products** — some goods carry **0% GST** instead of the flat 5%. New product flag that
   must be honoured at every sale and reflected in the report.

Report + ITC are web-only (data aggregates in the cloud). GST-exempt is **cross-cutting** (web + desktop
checkout, all sales channels, product forms, bootstrap sync).

---

## 2. Current state (from the code map)

- **No shared web GST helper.** `* 0.05` / `gst_5` is inlined in ~12 web sites (POS cart + server,
  marketplace cart/checkout, POS orders, sales-invoice, wholesale, shop orders, the console B2B engine,
  WhatsApp gateway) + ~7 display sites. Desktop has a real engine `desktop/lib/gst.ts` (used everywhere).
  Dead code: `web/packages/accounting` `calculateGST`, `web/packages/shared-utils` `calculateITC` (unused).
- **No product tax field** in either schema. `hsn_code` exists but drives no rate logic.
- **No GST report / ITC** anywhere (admin-hub is an empty scaffold; the CLAUDE.md report is aspirational).
- **`orders`** carries `gst_total` on POS_SALE/WHOLESALE/SALES_ORDER/SALES_INVOICE/MARKETPLACE; **0** on
  PURCHASE_ORDER/PURCHASE_INVOICE (web). Desktop purchases *do* book 5% (`use-purchases.ts`) — a divergence.
- **Desktop already has a whole-bill `taxExempt` toggle** (`use-cart`/`use-checkout`), but **no
  per-product exempt**. Web has no exempt concept at all.

---

## 3. Design — GST-exempt products

- **Schema (additive):** `products.gst_exempt boolean NOT NULL DEFAULT false` on web (migration `115`)
  and desktop (`022`, idempotent). A product is either standard 5% or exempt (0%). (`gst_rate` numeric
  was considered for future multi-rate; a boolean matches Bhutan's flat-5%-or-exempt reality and is
  simpler — revisit if more rates ever appear.)
- **Per-line snapshot (audit integrity):** persist the exemption on the line so historical reports don't
  shift if the product flag later changes. Web `order_items` already stores `gst_5` (0 for exempt is the
  signal); optionally add `gst_exempt` to the line. v1: store `gst_5 = 0` for exempt lines (the report
  keys off `gst_5 = 0` with a positive line total = exempt). A dedicated per-line flag is a later refinement.
- **Web engine choke-point:** introduce **`web/lib/gst.js`** — `GST_RATE = 0.05`, `lineGst(taxable,
  exempt)`, `splitGst(subtotal, exempt)` — and route the inline sites through it, each passing the
  product's `gst_exempt`. The one B2B choke-point is `web/lib/console/b2b-order.js priceB2BCart` (already
  fetches `hsn_code`; add `gst_exempt` to its product SELECT). POS: `web/hooks/use-cart.js` +
  `web/app/api/pos/cart/items/route.js` (the POS orders route trusts the client cart, so fixing the cart
  covers it). Marketplace: `web/app/api/shop/{orders,checkout}/route.js` + `web/app/api/cart/*`. Plus
  `web/app/api/sales/[id]/invoice/route.js` and `web/app/api/wholesale/orders/route.js`.
- **Desktop engine choke-point:** `desktop/lib/gst.ts` — add a per-line `gstExempt` to `calcItemTotals`/
  `calcCartTotals`; thread `product.gst_exempt` through `desktop/hooks/use-cart.ts`; `use-checkout.ts`
  already zeroes at bill level so per-line falls out. Sync the flag down: add `gst_exempt` to the
  `web/app/api/sync/bootstrap` product SELECT + PB mapping + the desktop `products` collection.
- **Product forms:** add a "GST exempt" toggle — web console `vendor-product-form.jsx`, web POS
  `components/pos/products/product-form.jsx` (+ entity-product-form, package-form), desktop
  `components/pos/product-form-modal.tsx`. Optional: the Excel import.

**Blast radius:** ~12 web compute files + ~7 display + forms; desktop 1 engine + cart + checkout + form +
bootstrap. Tax correctness is all-or-nothing per platform, so exempt must land on **every** sales path.

---

## 4. Design — GST report + ITC (web console)

- **Route:** `GET /api/console/reports/gst?from=&to=` — OWNER/MANAGER, entity-scoped. Aggregates the
  caller's `orders` over the period:
  - **Output tax** = Σ `gst_total` where `seller_id = me` and `order_type IN (POS_SALE, WHOLESALE,
    SALES_INVOICE, MARKETPLACE)` and `status` in a settled set (CONFIRMED..COMPLETED, excluding
    CANCELLED/REFUNDED). (SALES_ORDER excluded — it's a quote, not a sale, until invoiced.)
  - **Input tax (ITC)** = Σ `gst_total` where `buyer_id = me` (intra-platform B2B purchases) + external
    PURCHASE_INVOICE GST once that's captured (see §5).
  - **Taxable vs exempt sales** = split each sale's `subtotal` by whether its lines were taxable
    (gst_5 > 0) or exempt (gst_5 = 0). Report gross sales, taxable sales, exempt sales, output GST.
  - **Net GST payable** = output − input.
  - Group by month; also a totals row. Returns rows the UI charts/tabulates.
- **UI:** `components/console/gst-report.jsx` (date range + summary cards: gross/taxable/exempt sales,
  output GST, input GST/ITC, net payable + a monthly table) → `/{distributor,wholesaler}/reports` pages
  + a **Reports** nav entry. Mirror the existing console component/page/nav pattern.
- **Retailer/POS:** the retailer needs the same report — `web/app/pos/reports/page.jsx` +
  `web/app/api/pos/reports/gst/route.js` (net of POS_SALE output vs any purchase input). Net-new (no POS
  reports page exists to mirror).

---

## 5. ITC scope decision (flag)

- **Intra-platform B2B** input GST is already captured (the buyer side of WHOLESALE/SALES_INVOICE carries
  `gst_total`). The report can compute ITC from these today.
- **External-supplier PURCHASE_INVOICE** carries `gst_total = 0` on web (desktop books 5% — a divergence).
  For *complete* ITC that includes goods bought from off-platform suppliers, the console PO/PI must
  capture input GST (add GST to `web/app/api/console/purchases/*` + `web/app/api/purchases/route.js`).
  **Decision needed:** ITC = intra-platform only (ship now), or also external purchases (adds PI-GST
  capture + reconcile the web/desktop purchase-GST divergence). Plan: ship intra-platform ITC first;
  add external-purchase input GST as a follow-on.

---

## 6. Build order + status
1. **Foundation ✅** — migration `115` (`products.gst_exempt` + `order_items.gst_exempt`) + `web/lib/gst.js` (`GST_RATE`, `lineGst(taxable, exempt)`). Applied + lint-clean.
2. **GST report + ITC ✅** — `/api/console/reports/gst` + `GstReport` component + `/{distributor,wholesaler}/reports` pages + `GST Report` nav. Output/input/net + taxable-vs-exempt split; DB-verified.
3. **Exempt across ALL web sales paths ✅** — routed through `lib/gst.js` (`lineGst`), each reading the product's `gst_exempt` and summing per-line GST (exempt→0): B2B engine (`b2b-order.js` priceB2BCart + SO→SI), POS cart (`/api/pos/cart/items` add + qty-update, DB-authoritative fetch), marketplace (`/api/cart` + `/api/cart/[itemId]` + `/api/shop/orders` + `/api/shop/checkout` sums cart GST), retailer sales-invoice (`/api/sales/[id]/invoice`), and `/api/wholesale/orders`. `order_items.gst_exempt` persisted where the line is built. Product-form toggles: console `vendor-product-form.jsx` + retailer `components/pos/products/product-form.jsx`; save routes (`/api/console/catalog`, `/api/products/catalog`) + fetch selects (`/api/pos/products`, `/api/products/{catalog,sellable}`) carry the flag. *(Remaining forms: `entity-product-form.jsx` / `package-form.jsx` — packages assumed taxable for now.)*
4. **Desktop exempt ⏳** — migration `022`, `lib/gst.ts` per-line exempt, `use-cart`/`use-checkout`, product-form toggle, bootstrap `gst_exempt` in the product SELECT + PB collection. *(Runtime-unverified — desktop release, like Phase 4.)*
5. **Retailer GST report ⏳** — `/pos/reports` + `/api/pos/reports/gst` (mirror the console report).
6. **External-purchase input GST ⏳** (optional, per §5).

---

## 7. Verification
- [ ] `gst_exempt` defaults false; existing products unaffected (still 5%).
- [ ] An exempt product sold on each channel yields `gst_5 = 0` on its line and reduces `gst_total`.
- [ ] GST report: output = Σ seller-side sale GST; input = Σ buyer-side purchase GST; net = output − input; exempt sales excluded from output GST but shown as exempt turnover.
- [ ] `/api/console/reports/gst` is OWNER/MANAGER + entity-scoped (401/403 as expected).
- [ ] Desktop: an exempt product rings 0% at the counter (on-terminal test).
