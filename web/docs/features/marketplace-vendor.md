# Marketplace Vendor & Public Catalog

How a shop lists on the consumer marketplace, how fulfilment (rider vs pickup) is chosen, how
products are bulk-imported, and how the public catalog is curated. Shipped 2026-07 on
`feat/web-pos-ui-overhaul`.

## Vendor model
A marketplace vendor is just a **RETAILER** `entity` (no separate role). It appears on the public
catalog only when a **SUPER_ADMIN features it**.

- `entities.is_featured` (migration 090) — only featured shops show in the public `/shop` listing.
  Toggle at **/admin → Entities → "Feature on marketplace"**.
- `entities.delivery_mode` (migration 088) = `DELIVERY | PICKUP | NONE` — per-vendor fulfilment.
  Set on the vendor's **Store Settings** page (`/pos/settings`, shared `entity-profile-form`).
- Marketplace profile fields on `entities`: `shop_slug`, `marketplace_bio`, `marketplace_logo_url`.

## Fulfilment (rider enable/bypass)
`/api/shop/checkout` reads the seller's `delivery_mode`:
- **DELIVERY** — auto-assigns a rider (existing flow); a delivery address is required.
- **PICKUP / NONE** — **no rider**; address not required; order stamped `fulfilment_mode=PICKUP`
  (migration 089). Buyer collects in person.

## Public / unauthenticated catalog
- `/shop` is browsable **without login** (`web/app/shop/layout.jsx` only gates `/shop/checkout` +
  `/shop/orders`). Logged-out visitors see a marketing hero + WhatsApp sign-in CTA.
- `/api/shop/products` returns **only featured shops** and their `is_active`, in-stock products.
- **Cart + checkout require login/signup** (WhatsApp OTP auto-creates the CUSTOMER).

## Self-serve product + opening-stock import
Vendors import their catalog from an Excel template (Products page → **Import**).
- Spec + template + parser: `web/lib/marketplace/product-import.js` (uses `exceljs`).
- `GET /api/products/import/template` → styled `.xlsx` (condition dropdown, instructions sheet).
- `POST /api/products/import` (`?dryRun=1` validates + previews; all-or-nothing insert). One row per
  product; the **Quantity** column is opening stock → creates the product + an opening batch + a
  RESTOCK movement. Columns include name, price, MRP, condition, description, category, HSN, video, etc.
- `products.condition` + `products.description` added in migration 088.
- **Multi-tenant:** `/api/products/catalog` (the management list) is scoped to `created_by = entityId`,
  so a vendor only ever sees/edits their own catalog.

## Order cancellation (manager/owner) with stock return
`POST /api/pos/orders/[id]/cancel`:
- **Full** — status → CANCELLED; the `orders_restore_stock_cancel` trigger returns every active
  line's quantity to stock (RETURN movements).
- **Partial** — body `items: [{ id, quantity }]`; returns just those quantities (RETURN movements),
  shrinks/closes those lines, recomputes the order total. If nothing active remains → CANCELLED.
- Stock model: inserting an `inventory_movements` row auto-adjusts `current_stock` + batch
  (`inventory_movement_apply`); SALE is negative, RETURN/RESTOCK positive.
- UI: `cancel-modal.jsx` (Whole-order / Selected-items toggle + per-line qty).

## E2E
`web/e2e/specs/catalog-vendor.spec.js` (playwright `catalog` project): import → isolation →
public catalog → checkout gate. Silver Pines (`bsptours.treks@gmail.com`) is the demo vendor
(seeded out-of-band, not in the repo seed).

Related: `product-ai-enrichment.md`, `weighed-goods-labels.md`, `rider-system.md`, `vendor-signup.md`.
