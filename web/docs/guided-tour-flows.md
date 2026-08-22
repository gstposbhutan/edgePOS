# Guided Tour — Exhaustive User-Flow Inventory

Backlog of every user flow to record as a slow-paced Playwright video tour (see
`feedback-small-test-suites` + the `recordings`/`pelbu` projects in `web/playwright.config.js`).
Each tour: `video:'on'`, high `slowMo`, **char-by-char typing** (`pressSequentially` w/ delay), explicit
pauses — so a viewer follows every click and keypress.

Legend — **App**: W=web cloud · D=desktop terminal. **Pri**: 1=core/launch, 2=important, 3=advanced.
Status: ☐ to record.

---

## 1. Public / Marketing — unauthenticated (W)
- ☐ **P1** Home/landing walkthrough — hero, value props, nav.
- ☐ **P2** Feature hub + 4 deep-dive pages.
- ☐ **P2** Sell / vendor pitch → onboarding CTA.
- ☐ **P3** About / Contact (form submit) / Terms.

## 2. Customer — marketplace `/shop` (W)
- ☐ **P1** Browse featured shops + product grid; open a product.
- ☐ **P1** Add to cart → open cart drawer → adjust qty.
- ☐ **P1** Sign up — email → 6-digit email-OTP → set password + mandatory phone.
- ☐ **P1** Sign in — email + password (returning customer).
- ☐ **P2** Social sign-in — Google / Facebook (needs OAuth creds live).
- ☐ **P1** Checkout — **Delivery**: enter address + pick map location → place order.
- ☐ **P2** Checkout — **Pickup** vendor: place order (no rider).
- ☐ **P1** My orders list → order detail + status timeline.
- ☐ **P1** Track delivery — show the **delivery OTP** to give the rider at the door.
- ☐ **P2** Pay after delivery (payment link / token).
- ☐ **P2** Cancel an **undeliverable** order (no rider available).
- ☐ **P3** Consumer khata/credit view (if enabled for the buyer).

## 3. Rider — `/rider` (W, mobile-first)
- ☐ **P1** Login — email → 6-digit emailed code → in.
- ☐ **P1** Go **online/offline** (shift toggle); location-sharing prompt (GPS).
- ☐ **P1** View the **queue** (multiple orders, worked in any order).
- ☐ **P1** Confirm **pickup** — enter the vendor's pickup OTP.
- ☐ **P1** Confirm **delivery** — enter the customer's delivery OTP.
- ☐ **P2** **Reject** an order → it re-dispatches to another rider.
- ☐ **P2** Submit the **delivery fee** after delivery.
- ☐ **P3** History; Profile (email-login explainer).

## 4. Retailer / Vendor — Web POS + back-office (W)
### POS register (`/pos`)
- ☐ **P1** Staff login (email + password) → POS.
- ☐ **P1** Keyboard sale — type-to-search product, add lines, edit qty, checkout.
- ☐ **P1** Touch sale — card grid, cart drawer, checkout.
- ☐ **P1** Customer ID on a sale (phone) + walk-in.
- ☐ **P2** Per-line **salesperson** (F8) + per-line **rate tier** (Retail/Wholesale/Distributor).
- ☐ **P2** **Weighed goods** — weigh modal, per-kg rate.
- ☐ **P2** Invoice **discount** (pre-GST) + per-line discount.
- ☐ **P1** Payment — Cash / Online / Credit; GST 5% breakdown; receipt.
- ☐ **P1** Shift — open, close, **handover** on logout; one-active-shift guard.
- ☐ **P2** Cash in/out **adjustments**; cash registers; Z-report.
- ☐ **P3** Held carts (hold/recall); undo.
### Orders (`/pos/orders`)
- ☐ **P1** Sales invoice detail; **marketplace order**: confirm → processing, **rider pickup OTP**, cancel.
- ☐ **P2** Save as **Sales Order** vs **Quotation** (Alt+Q); convert SO → invoice.
- ☐ **P2** Refund / cancel-with-reason + stock return; delivery-fee confirm.
### Purchases (`/pos` buy-side)
- ☐ **P2** Purchase Order — create, editable line cost, cancel-with-reason.
- ☐ **P2** Purchase Invoice — receive against PO (batch + cost), per-line + bill discount, CREDIT → khata.
### Khata / credit customers
- ☐ **P2** Create credit customer; record repayment; adjust balance; freeze/unfreeze.
### Catalog / inventory (`/pos/products`, `/purchases`)
- ☐ **P2** Add product; **AI enrichment** (z.ai/GLM metadata + image + video).
- ☐ **P2** Stock adjust; inventory movements; low-stock alert; reorder point.
- ☐ **P2** Barcode **label maker** (Code128/EAN-13; weighed).
### Marketplace vendor
- ☐ **P2** Vendor onboarding; per-vendor **delivery mode** (Delivery/Pickup/None).
- ☐ **P2** **Excel** product + opening-stock import.
- ☐ **P2** Manager order **cancel (full/partial) + stock return**.
### Store admin
- ☐ **P2** Team management (add store users; terminal user sync).
- ☐ **P3** Settings; per-user **email-notification** prefs.

## 5. Desktop terminal — Electron POS (D)
- ☐ **P1** Activation — license key + cloud URL; first-run bootstrap.
- ☐ **P1** Login (store team, same email+password mirror).
- ☐ **P1** Offline sale (rides out an outage) → auto-sync when back online.
- ☐ **P1** Shift lifecycle (open/close/handover).
- ☐ **P2** Cash registers + adjustments; khata.
- ☐ **P2** Weighed goods + **thermal receipt** + **label printing** (silent print).
- ☐ **P1** **Online orders** (v1.3.0) — incoming marketplace orders, **native new-order notification**,
  **share rider pickup OTP**, confirm/cancel; offline-resilient mirror.
- ☐ **P2** Sales Order vs Quotation; keyboard listing ↔ grid toggle.
- ☐ **P3** Sync status nudge; desktop update check + install.

## 6. Distributor — `/distributor` (W)
- ☐ **P1** Login → console/dashboard (heading tiles).
- ☐ **P2** Team + settings.
- ☐ **P2** Catalog browse; discovery + **favourites**.
- ☐ **P2** **Warehouse** management (locations = warehouses, not POS stores).
- ☐ **P2** **B2B ordering** — supply retailers (credit-limit checks); Model-B **packages** (pallet→box→piece).
- ☐ **P3** Audit log; RLS-scoped views.

## 7. Wholesaler — `/wholesaler` (W)
- ☐ **P1** Login → console/dashboard.
- ☐ **P2** Team/settings; catalog; discovery + favourites; warehouses.
- ☐ **P2** B2B ordering to retailers; Model-B packages; retailer↔wholesaler links per category.
- ☐ **P3** Audit.

## 8. Super Admin — `/admin` (W)
- ☐ **P1** Login → platform console.
- ☐ **P1** **Riders** — add (name + email + unique phone), activate/deactivate, email-notify toggle, queue depth.
- ☐ **P1** **Featured shops** — curate the marketplace catalog.
- ☐ **P1** **Desktop Releases** — publish version + release notes (terminals auto-update).
- ☐ **P2** Entities (all tiers) management; HSN-category **property templates**; units.
- ☐ **P2** **GST reports** — one-click monthly export.
- ☐ **P3** Audit logs; fraud/compliance views.

## 9. Cross-cutting (weave into the above)
- ☐ In-app **notifications** bell + per-user email prefs.
- ☐ GST 5% compliance surfaced on every sale/invoice.
- ☐ WhatsApp receipts/OTP (parked — record once a live sender is registered).

---

### Recording plan
1. One small spec per role area (`tour-customer`, `tour-rider`, `tour-pos`, `tour-desktop-*`,
   `tour-distributor`, `tour-wholesaler`, `tour-admin`) — keeps videos short + re-recordable.
2. Web tours: Playwright Docker + a `tour` project (`video:'on'`, `slowMo` ~800–1200ms).
3. Desktop tours: the Electron harness (xvfb) with `slowMo`.
4. Seed deterministic data per tour; type char-by-char; pause on each screen so it reads as a demo.
