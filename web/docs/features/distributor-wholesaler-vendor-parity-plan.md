# Distributor / Wholesaler → Vendor-function parity — PLAN

Goal: give the DISTRIBUTOR and WHOLESALER consoles **most of the retailer (vendor) functions**, and
decide, per function, whether it **applies as-is**, **needs modification**, or **doesn't apply**.
Scope spans **web + desktop**. Status: PLAN only (nothing built yet).

## Guiding principles
- **Keep the parallel-console pattern.** The consoles never reuse `/pos` or `/api/pos/*`; they have
  their own `/api/console/*` namespace + shared `components/console/*`, so the B2B tiers can diverge.
  We extend by porting features into that namespace / shared components, NOT by opening `/pos` to
  distributor/wholesaler.
- **B2B ≠ retail counter.** A distributor/wholesaler is not a shop with a till. "Selling" for them is
  issuing a B2B order/invoice to a *linked buyer* (the tier below), on CREDIT, decrementing their
  stock and debiting the buyer's khata — not ringing anonymous cash sales. So the retail *cash
  register* mostly does NOT port; the *order/invoice/stock/credit* engine does.
- **App-layer scoping.** Platform RLS is disabled; `/api/console/*` runs the service-role client and
  scopes every query by `entityId` (see `console-access-model.md`). Every ported feature must do the
  same `getAuthContext()` entity-scoping — RLS will not protect it.
- **Reuse the desktop we just built.** The BACK_OFFICE terminal mode + `/stock` screen (products,
  inventory/receive, barcode, restock) is the natural desktop surface for a distributor/wholesaler
  (a warehouse/back-office terminal, no cash sale).

---

## Foundations (prerequisites — most features are blocked until these exist)

| # | Foundation | Why it blocks | Where | Status |
|---|---|---|---|---|
| **F1** | **Supply-link write path** — create/disconnect `distributor_wholesalers` + `retailer_wholesalers` links (a real "Connect" action, not the decorative favourite/star). | Today links are **seed-only**; no B2B order, credit, or catalog flow works end-to-end between two real accounts without a link. | new `/api/console/links` + a "Connect" action on `entity-browser.jsx`; `browse`/`favourites` surface link status; junctions already exist (`082`, `001_schema`). Whole-catalog (category-NULL) links via migration `105`. | ✅ done |
| **F2** | **Khata auto-provisioning + per-tier debit** — auto-create the `khata_accounts` row (creditor = seller, debtor = buyer) when a link is made or on first CREDIT order, with the **tier-correct `party_type`**. | CREDIT B2B orders otherwise `RAISE 'No active khata account found'`; and the old single debit trigger hardcoded `party_type='RETAILER'` for every entity buyer. | `ensureKhataAccount()` in `lib/console/supply-links.js` (from F1 link path + `/api/console/orders` POST safety-net); migration `106` splits `khata_debit_on_confirm` into per-tier triggers (`khata_debit_consumer/retailer/wholesaler`) + re-types existing wholesaler-debtor khata. | ✅ done |
| **F3** | **Allow desktop licenses for DISTRIBUTOR/WHOLESALER** (today `/api/admin/licenses` hard-rejects non-RETAILER). Default their terminal to **BACK_OFFICE**. | Blocks all desktop access for the tiers. | `web/app/api/admin/licenses/route.js` role gate + `/pos/licenses` picker; the register/mode plumbing already exists. | ✅ done |
| **F4** | **Console entity-scoping discipline** — every ported route/component replicates `getAuthContext()` `.eq('entity_id'/'created_by'/'seller_id', entityId)`. | RLS is dormant; a ported retailer route that trusts RLS would leak across tenants. | all new `/api/console/*`. | ⏳ ongoing discipline |

---

## Feature mapping (retailer surface → Distributor / Wholesaler)

Legend: ✅ applies ~as-is · ✏️ needs modification · ⛔ doesn't apply (with why) · 🆕 net-new (no retailer version to port).

| Retailer area | Distributor | Wholesaler | Notes |
|---|---|---|---|
| **Cash register / POS** (cash sale, weighed, held carts, shifts, cash drawer, Z-report, receipts, exchange, complimentary, Face-ID, rate-tier toggle) | ⛔ | ⛔ | Decision #1: B2B only, no counter. Retail cash-sale concepts don't map. |
| **B2B sell / invoice to a buyer** | ✏️ | ✏️ | Today consoles only *receive* orders (read-only). Add a **seller-initiated** order/invoice to a linked buyer (pick buyer → catalog → CREDIT/other → decrement stock + debit buyer khata). This is the real "selling" for a vendor. Reuses the `/api/console/orders` + auto-CONFIRM machinery. |
| **Sales Order / Quotation** (Alt+Q, SO→SI convert, batch assign, partial fulfil) | ✅→✏️ | ✅→✏️ | Port to console — B2B quotes + fulfil-later are valuable. Batch assignment applies (they hold batches). |
| **Orders management** (status actions, cancel-with-reason + stock return, refund, dispatch/rider OTP) | ✏️ | ✏️ | Make `incoming-orders.jsx` **actionable** (currently read-only "v1"): confirm/process/dispatch/cancel/refund with stock return. Rider dispatch applies if the tier delivers. |
| **Purchases (buy-side PO/PI)** | 🆕 (external suppliers) | ✏️ (upgrade `distributor-restock`) | Distributor is top tier: add a generic PO/PI (free-text/importer supplier) like retailer `/pos/purchases` (receive against PO → batches + cost, CREDIT→supplier khata). Wholesaler already has simple restock-from-distributor; optionally upgrade to full PO/PI. |
| **Catalog — products + Model-B packages** | ✅ | ✅ | Already built (`vendor-catalog`, `vendor-product-form`, package open/buy/sell). |
| **AI product enrichment** (z.ai metadata + image + video) | ✏️ | ✏️ | Port the "Enrich" controls into `vendor-product-form`/`vendor-catalog`. Applies (fills metadata/images for B2B catalogs). |
| **Excel product + opening-stock import** | ✅→✏️ | ✅→✏️ | High value for large B2B catalogs. Port `/api/products/import` as `/api/console/import` (B2B pricing columns). |
| **Inventory management** (stock levels, batches, receive, adjust LOSS/DAMAGE/TRANSFER, movements, low-stock, predictions, bill-scan OCR) | 🆕 (console) | 🆕 (console) | Big add: no console inventory screen today. **Per-warehouse (decision #2 / F5):** receive, adjust, and inter-warehouse **transfer** are warehouse-scoped; stock reads roll up per warehouse. Bill-scan OCR + predictions optional/later. |
| **Barcode label maker** | ✅ (desktop) | ✅ (desktop) | Desktop-only; comes with F3 desktop access. |
| **Khata / credit management** (accounts, repayment, adjust, credit limit, freeze) | 🆕 (console) | 🆕 (console) | Big add: vendors *extend* credit to the tier below. Port a khata console scoped to their B2B debtors. Depends on F2. |
| **Marketplace / consumer storefront** (`/shop`, delivery/pickup mode) | ⛔ | ⛔ (optional for cash-and-carry) | B2B tiers sell to businesses, not consumers. `entity-profile-form` already exposes `shop_slug`/`delivery_mode` if a wholesaler wants a public storefront — leave optional, don't build. |
| **Team management** | ✅ | ✅ | Already shared (`TeamManager`). |
| **Settings / business profile / email prefs / notifications** | ✅ | ✅ | Already shared (`EntityProfileForm`, notification bell). |
| **Multi-store / stores** | ⛔ (use warehouses) | ⛔ (use warehouses) | Retail multi-*store* → B2B multi-*warehouse*. Warehouses exist for wholesaler; **add to distributor**. |
| **Warehouses** | 🆕 (add) | ✅→✏️ | Distributor console has no warehouses page today; add `WarehouseManager`. Per F5 warehouses become **real** (hold per-warehouse stock), not records-only. |
| **Network browse / favourites** | ✅ | ✅ | Already built (`entity-browser`) — but see F1 (favourite ≠ link). |
| **Desktop terminal** (offline register / BACK_OFFICE stock + online orders) | 🆕 (F3) | 🆕 (F3) | Provision BACK_OFFICE terminals: warehouse stock (`/stock`) + incoming B2B orders + online orders. Reuses what we just shipped. |
| **Terminals / registers / licenses / sync-token pages** | 🆕 (F3) | 🆕 (F3) | Surface `/…/terminals` + register mgmt in the consoles once F3 lands. |
| **GST report / ITC accounting** | 🆕 | 🆕 | No GST report exists anywhere yet (retailer included). B2B needs **Input Tax Credit** tracking (buy-side GST offsets sell-side). Net-new; arguably build once and share across all tiers. |

---

## Phased implementation

- **Phase 0 — Foundations:** ✅ **DONE** — F1 supply-link write path + F2 khata auto-provisioning & per-tier debit triggers + F3 desktop license gate. (Migrations `105`/`106` applied to the box; per-tier debit verified end-to-end for wholesaler + retailer tiers. Unblocks the rest.)
- **Phase 1 — B2B selling + actionable orders:** ✅ **COMPLETE** — seller-initiated sale to a linked buyer (`/api/console/sales` + `/api/console/buyers` + `SellToBuyer`, shared engine `lib/console/b2b-order.js` also now backs the buy-side `/api/console/orders` POST); incoming orders actionable (`/api/console/orders/[id]` PATCH: confirm→processing→dispatched→delivered→completed, + cancel with seller **and** buyer stock return and khata reversal — verified net-zero). Migration `107` makes `restock_buyer_on_delivery` idempotent. Migration `108` **fixes the system-wide cancel double-restore** (POS/wholesale/marketplace/console): the item-level `restore_stock_on_item_cancel` now only handles legacy product-less package lines, so product-backed lines are restored exactly once by the order-level trigger / cancel routes (also corrects Model-B package cancels that were restoring the component leaves instead of the package product) — verified single-restore across full-cancel, partial-full-line, and partial-qty paths. **Refund** shipped: `/api/console/orders/[id]/refund` (full refund — returns seller + buyer stock, reverses khata via `reverse_khata_on_refund`) with a Refund action on delivered/completed orders; migration `109` makes refund restore product-level + batch-aware (fixes Model-B package refunds); migration `110` fixes `restock_buyer_on_delivery` (was inserting a non-existent `timestamp` column — so the wholesale DELIVERED path never worked — and restocking the seller's product row instead of the buyer's mirror; now skips console orders already received at confirm). **SO/Quotation + SO→SI convert** shipped: `/api/console/sales` takes a `mode` (INVOICE / SALES_ORDER / QUOTATION); a Sales Order/Quotation is a priced DRAFT with no movement, fulfilled via `/api/console/sales/[id]/invoice` into a confirmed SALES_INVOICE (deduct + khata via triggers + receive-on-buy). Engine refactored into shared resolve/price/receive helpers backing all three creators. UI: document-type toggle on the Sell page + a "Quotes & Orders" section with a Fulfil action. **Partial fulfilment** — a sales order can be invoiced in parts (`/api/console/sales/[id]/invoice` takes `lines`; `/api/console/sales/[id]` exposes per-line remaining; SO tracks PARTIALLY_FULFILLED → CONFIRMED). **Partial refunds** — refund selected lines (`/api/console/orders/[id]/refund` takes `item_ids`); the inbox shows per-line checkboxes and reverses only the chosen lines' stock + khata. Phase 1 fully complete.
- **Phase 2 — Per-warehouse inventory + purchases:** **F5** per-warehouse stock (`warehouse_id` on batches/movements + inter-warehouse transfers; warehouses become real); console inventory (warehouse-scoped receive/adjust/transfer/levels/batches/movements/low-stock); distributor **PO/PI to external suppliers** (warehouse-scoped receiving → supplier khata); Excel import + AI enrichment ports; add distributor warehouses.
- **Phase 3 — Khata/credit management:** console khata UI scoped to B2B debtors (accounts, repayment, adjust, limit, freeze).
- **Phase 4 — Desktop for the tiers:** provision BACK_OFFICE terminals (warehouse stock + incoming/online orders); surface terminal/register mgmt in the consoles.
- **Phase 5 — Reporting:** GST report + B2B ITC (net-new; build shared across tiers).

Each phase ships independently and keeps app-layer entity-scoping (F4).

---

## Resolved decisions (2026-07-10)
1. **Cash-and-carry → NO.** B2B only; the retail cash-sale POS, shifts, drawer, Z-report and receipts do **not** port to the tiers. (Cash-register row stays ⛔.)
2. **Inventory granularity → PER-WAREHOUSE.** Stock is tracked per warehouse/depot, with inter-warehouse transfers — NOT the current entity-level model. This is a **schema + logic change** (see Foundation F5) and makes the wholesaler/distributor warehouses "real" (not records-only). Receiving, B2B selling, and adjustments all become warehouse-scoped.
3. **GST/ITC → LATER, shared.** Do foundations + selling + inventory + credit first; build the GST report **with B2B Input Tax Credit**, shared across retailer + distributor + wholesaler, in the last phase.
4. **Distributor upstream purchases → YES.** Add PO/PI to **external** suppliers (free-text/importer): PO → receive → batches + cost → supplier khata (port of retailer `/pos/purchases`, warehouse-scoped per #2).
5. **Feature reuse → parallel `/api/console/*`** pattern confirmed (port/adapt components; do not open `/pos` to the tiers).

### Foundation added by decision #2
- **F5 — Per-warehouse inventory.** 🟡 **foundation shipped** (migration `111`). Approach: keep `products.current_stock` as the entity total (all ~35 read sites untouched); add a new `warehouse_stock (product_id, warehouse_id, entity_id, quantity)` table + nullable `warehouse_id` on `inventory_movements`/`product_batches`; `apply_inventory_movement` now also upserts `warehouse_stock` when a movement is located. Retailer/single-shop flows leave `warehouse_id` NULL (entity-level, unchanged); tier flows stamp a warehouse and their per-warehouse totals sum back to `current_stock`. Transfers = a −qty + +qty movement pair. DB-verified. **Console inventory SHIPPED** — `/api/console/inventory/*` (levels/receive/adjust/transfer/batches/movements) + `InventoryManager` UI (warehouse selector + tabs + receive/adjust/transfer modals); distributor Warehouses page added (was wholesaler-only) + Inventory/Warehouses nav on both; migration `112` adds `products.manufacturer_price` (auto-filled from receive cost). **Remaining in F5/Phase 2:** warehouse-aware receiving in distributor PO/PI + console PO/PI routes; warehouse-aware B2B sell (source warehouse) / receive-on-buy (dest warehouse); FEFO batch pick filtered by warehouse; + the 2 pricing items (per-line sell rate-tier, manufacturer-rate margin UI).

### Model clarified (2026-07-10, user)
- **Retailers = shops** (single location, entity-level stock, keep the cash-sale POS). **Wholesalers/distributors = warehouses** (multi-location per F5, **no POS** — B2B only, back-office desktop). A wholesaler wanting retail registers a **separate RETAILER shop account** (supplied by the wholesaler via the existing B2B link) — no multi-entity feature for now.
- **Sell-rate tiers (per line):** a wholesaler/distributor can sell at Retail (`mrp`) / Wholesale (`wholesale_price`) / Distributor (`distributor_price`), defaulting to their own tier — mirror the POS per-line rate tier in the console sell/SO flow. (TODO, Phase 2 catalog/sell work.)
- **Manufacturer rate (cost):** add `products.manufacturer_price` = the distributor's buy cost from the manufacturer; auto-fill from PO/PI landed `unit_cost`, editable in the vendor product form; show margin (sell − cost). Distributors track it; wholesalers can see manufacturer + distributor rate for chain visibility. (TODO, Phase 2 catalog work.)

---

## Data-model notes
- Junctions: `distributor_wholesalers` (082), `retailer_wholesalers` (001) — the whole link model; write path shipped (F1: `/api/console/links`). Whole-catalog links carry `category_id IS NULL` (migration `105`).
- Credit: enforced on `khata_accounts.credit_limit`, debited on order CONFIRM by **per-tier triggers** — `khata_debit_consumer` (POS, party_type CONSUMER), `khata_debit_wholesaler` (entity buyer role WHOLESALER), `khata_debit_retailer` (catch-all, party_type RETAILER) — sharing `_khata_apply_debit()` (migration `106`). The reverse (`khata_credit_on_cancel`) is party_type-agnostic. `party_type` must match the buyer's tier: `ensureKhataAccount()` derives it from the buyer role, keep in lockstep with `106`.
- Pricing: vendors type `wholesale_price`/`mrp`/`distributor_price` directly (retailer derives from receipts) — ported product/pricing UI must branch (vendor-product-form already does).
- Warehouses (081): records-only, entity-level stock is source of truth — see decision #2.
- Desktop license gate is RETAILER-only today (F3).
