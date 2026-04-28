# Feature: Customer Checkout & Post-Delivery Payment Flow

**Feature ID**: F-CHECKOUT-001
**Phase**: 3
**Status**: Planned
**Last Updated**: 2026-04-29

---

## Overview

Completes the consumer purchase loop that begins at the cart. A customer whose cart contains products from one or more vendors proceeds through a checkout review page, places all vendor orders in a single action, and pays **after delivery** by uploading a payment screenshot via a WhatsApp link.

Key principles:
- **One `MARKETPLACE` order per vendor** is created from the cart at checkout.
- **Payment is deferred** — the customer pays after the goods arrive, not upfront.
- **Rider controls the delivery status** — Toofan/Rider webhooks drive `DISPATCHED` and `DELIVERED` transitions. The vendor only controls `CONFIRMED → PROCESSING` (invoice creation).
- **Payment link is auto-sent** when the rider marks the order `DELIVERED`.
- **OCR verification** of the payment screenshot closes the order as `COMPLETED`.

---

## Prerequisites

- Customer is authenticated via WhatsApp OTP (F-AUTH-001). All `/shop/*` pages require an active session; unauthenticated visitors are redirected to `/login?redirect=<current_path>`.
- The payment upload page (`/pay/[orderId]`) lives **outside** the auth-guarded `/shop` layout — it is accessed via a WhatsApp link and authenticated only by the `payment_token` query parameter.

---

## Order Status Flow

```
CONFIRMED   ← customer places order; stock deducted via DB trigger
  ↓ vendor generates invoice
PROCESSING  ← invoice created; rider auto-assigned via logistics-bridge
  ↓ rider picks up package from vendor (Toofan/Rider webhook: PICKED_UP)
DISPATCHED  ← rider has collected package, en route to customer
  ↓ rider delivers to customer (Toofan/Rider webhook: DELIVERED)
DELIVERED   ← customer has received goods
             ↓ AUTO: WhatsApp payment link sent to customer
  ↓ customer uploads payment screenshot + OCR verify
COMPLETED   ← payment verified; order closed
```

### Role per transition

| Transition | Actor | Mechanism |
|------------|-------|-----------|
| → CONFIRMED | Customer (checkout) | `POST /api/shop/checkout` |
| → PROCESSING | Vendor (invoice creation) | `PATCH /api/shop/orders/[id]` |
| Rider assigned | System | logistics-bridge on PROCESSING |
| → DISPATCHED | Rider | Toofan/Rider webhook: `PICKED_UP` |
| → DELIVERED | Rider | Toofan/Rider webhook: `DELIVERED` → payment link auto-sent |
| → COMPLETED | Customer (OCR upload) | `POST /api/shop/pay/[orderId]` |

**Vendor fallback**: Until Toofan is fully integrated, vendor can manually `PATCH` to `DISPATCHED` and `DELIVERED`. The payment link is auto-sent on `DELIVERED` regardless of whether the trigger came from the webhook or the vendor.

---

## Database Changes (Migration 046)

### `orders` table additions

| Column | Type | Purpose |
|--------|------|---------|
| `payment_token` | TEXT | 64-char hex token for payment link authentication |
| `payment_token_expires_at` | TIMESTAMPTZ | 7-day expiry from order creation |
| `delivery_address` | TEXT | Required free-text address from customer at checkout |
| `delivery_lat` | DECIMAL(10,7) | GPS latitude (browser Geolocation API) |
| `delivery_lng` | DECIMAL(10,7) | GPS longitude |

Sparse index on `payment_token`:
```sql
CREATE INDEX idx_orders_payment_token ON orders(payment_token)
WHERE payment_token IS NOT NULL;
```

No new `order_type`, `order_source`, or `payment_method` values needed — `MARKETPLACE`, `MARKETPLACE_WEB`, and `CREDIT` already exist in migrations 007 and 025.

### Existing trigger interactions

| Trigger | Migration | Effect on MARKETPLACE orders |
|---------|-----------|------------------------------|
| `deduct_stock_on_confirm` | 012 | Stock deducted immediately on INSERT at CONFIRMED |
| `cart_converted_on_confirm` | 011 | `carts.status = 'CONVERTED'` when order CONFIRMED and `cart_id IS NOT NULL` |
| `log_order_status_change` | 007 | Appends every transition to `order_status_log` |
| `restore_stock_on_cancel` | 012 | Restores stock if cancelled before DELIVERED |

---

## API Routes

### `POST /api/shop/checkout`

Creates all per-vendor MARKETPLACE orders from the customer's active carts. Each vendor order is independent (partial success acceptable — if one fails, others proceed).

**Auth**: Cookie-based session (pattern from `app/api/cart/route.js`). Service role client for DB.

**Request body**:
```json
{
  "delivery_address": "House 12, Norzin Lam, Thimphu",
  "delivery_lat": 27.4728,
  "delivery_lng": 89.6390
}
```

**Per cart (per vendor)**:
1. Recalculate totals from `cart_items` server-side (never trust client totals)
2. Generate `MKT-YYYY-XXXXX` order number (sequential global counter)
3. Generate digital signature: `SHA-256(orderNo:grandTotal:tpn_gstin)` via Node.js `crypto`
4. Generate `payment_token = randomBytes(32).toString('hex')`, expires 7 days
5. INSERT `orders` at `status = 'CONFIRMED'`, `order_type = 'MARKETPLACE'`, `payment_method = 'CREDIT'`
6. INSERT `order_items` (same shape as POS: sku, name, qty, unit_price, gst_5, total)
7. DB trigger deducts stock and converts cart automatically

**Response**:
```json
{
  "orders": [
    { "id": "uuid", "order_no": "MKT-2026-00001", "seller_name": "Demo Store", "grand_total": 315.00, "status": "CONFIRMED" },
    { "id": null, "seller_name": "Other Store", "error": "Insufficient stock" }
  ]
}
```

### `GET /api/shop/orders`

Customer's MARKETPLACE orders, ordered by `created_at DESC`. Filtered by `buyer_whatsapp = customerPhone AND order_type = 'MARKETPLACE'`. Enriched with `seller_entity.name`.

### `GET /api/shop/orders/[id]`

Single order for the customer. Validates ownership via `buyer_whatsapp`. Returns order + `order_items` + `order_status_log` + seller name. Returns `payment_token` **only when `status = 'DELIVERED'`**.

### `PATCH /api/shop/orders/[id]`

Vendor status update. Validates `seller_id = auth_entity_id`.

Vendor-controlled transitions only:
```js
CONFIRMED  → [PROCESSING, CANCELLED]
PROCESSING → [CANCELLED]
// Fallback only (when Toofan not live):
DISPATCHED → [DELIVERED]
DELIVERED  → [COMPLETED]
```

**On `PROCESSING`**: fires `POST /api/dispatch-delivery` to logistics-bridge (fire-and-forget) to assign rider.

**On `DELIVERED`** (fallback): reads `payment_token`, builds `/pay/[id]?token=...`, fires `POST {GATEWAY}/api/send-payment-link`.

### `GET /api/shop/pay/[orderId]`

Public (no session). Validates `token` query param against `orders.payment_token` + expiry. Returns `{ order_no, grand_total, seller_name, status }`.

### `POST /api/shop/pay/[orderId]`

Public — token is the credential.

1. Validate token + expiry + `status === 'DELIVERED'`
2. Call `verifyPaymentImage()` from `lib/vision/server-payment-ocr.js`
3. Track attempts in `payment_attempts` table (max 3)
4. On verified: `UPDATE orders SET status='COMPLETED', payment_token=null, payment_ref=referenceNo, ocr_verify_id=verifyId, completed_at=NOW(), payment_method=<OCR-detected>`
5. Fire-and-forget: `POST {GATEWAY}/api/send-receipt`
6. Return `{ success, order_no, referenceNo }` or `{ verified: false, reason, attemptsLeft }`

---

## Logistics Bridge — Toofan/Rider Webhooks

`services/logistics-bridge/src/index.ts` handles two events:

**`POST /webhooks/toofan` — `PICKED_UP`**:
1. `UPDATE orders SET status = 'DISPATCHED'`
2. DB trigger logs transition

**`POST /webhooks/toofan` — `DELIVERED`**:
1. `UPDATE orders SET status = 'DELIVERED'`
2. Read `payment_token`, `buyer_whatsapp`, `grand_total`, `order_no`
3. Build `paymentUrl = ${APP_URL}/pay/${orderId}?token=${payment_token}`
4. `POST {GATEWAY}/api/send-payment-link` (fire-and-forget)

`POST /webhooks/rider` follows identical logic.

`POST /api/dispatch-delivery` is called by the Shop API when vendor moves to PROCESSING — assigns the rider.

---

## Payment Token Security

- `randomBytes(32).toString('hex')` — 256 bits entropy, cryptographically random
- Stored in plaintext on the order row (single-use, short-lived, scoped to one order)
- Cleared (`payment_token = null`) on successful payment — link immediately invalidated
- 7-day expiry. If expired, vendor can regenerate from the order detail page
- Never returned by `GET /api/shop/pay/[orderId]` — only used server-side for validation

---

## WhatsApp Notifications

Three new endpoints added to `services/whatsapp-gateway/src/index.ts`:

| Endpoint | When | Recipient | Content |
|----------|------|-----------|---------|
| `POST /api/send-order-confirmation` | After checkout | Customer | All order numbers + total + "Pay after delivery" |
| `POST /api/send-order-notification` | After checkout | Each vendor | New order alert + item count + customer phone |
| `POST /api/send-payment-link` | On DELIVERED | Customer | Delivery confirmed + payment URL + 7-day deadline |

All follow the existing pattern: try `sendTemplateMessage` first, fall back to `sendTextMessage`.

---

## Shared OCR Module (`lib/vision/server-payment-ocr.js`)

Extracts Zhipu/Gemini OCR logic from `app/api/payment-verify/route.js` into a server-only shared module. Both `app/api/payment-verify/route.js` (POS) and `app/api/shop/pay/[orderId]/route.js` (marketplace) import it.

```js
export async function verifyPaymentImage({ imageBase64, mimeType, expectedAmount })
// Returns: { verified, amount, referenceNo, verifyId, provider, rawResponse }
```

---

## Components

### `CheckoutSummary` (`components/shop/checkout-summary.jsx`)
Stateless. Renders one section per vendor with items + subtotal, combined grand total with `grandTotal / 1.05` GST breakdown, delivery address textarea, and GPS button.

### `CustomerPaymentUpload` (`components/shop/payment-upload.jsx`)
```html
<input type="file" accept="image/*" capture="environment">
```
`capture="environment"` opens phone camera directly but also allows gallery. Reads file as base64, POSTs to `/api/shop/pay/[orderId]`. States: idle → verifying → success / failed (retry, max 3).

### `CartDrawer` change
```jsx
<Button onClick={() => { setIsOpen(false); router.push('/shop/checkout') }}>
  Checkout ({totalItems} items)
</Button>
```

---

## Pages

### `/shop/layout.jsx` — Auth Guard
Checks `supabase.auth.getSession()` on mount. Redirects to `/login?redirect=<pathname>` if no session.

### `/shop/checkout` — Checkout Review
Reads `carts` from `useCart()`. Renders `<CheckoutSummary>`. Address + GPS input. Place Order → `POST /api/shop/checkout` → navigate to `/shop/orders`.

### `/shop/orders` — Order History
Uses `hooks/use-shop-orders.js`. Tabs: ALL / ACTIVE / AWAITING PAYMENT / COMPLETED / CANCELLED. Reuses `OrderStatusBadge`.

### `/shop/orders/[id]` — Order Detail
Reuses `OrderTimeline`. Shows Pay Now button when `status === 'DELIVERED'` → `/pay/[orderId]?token=...`.

### `/pay/[orderId]` — Payment Upload (Public, outside `/shop/` auth layout)
Validates token via `GET /api/shop/pay/[orderId]?token=...`. Renders `<CustomerPaymentUpload>`. On success: confirmation screen.

---

## Scope Boundaries

- **Toofan/Rider full integration** — logistics-bridge webhook is implemented functionally. Full fare, driver assignment, real-time tracking = Phase 5.
- **PostGIS routing** — GPS coordinates stored but not used for nearest-driver logic yet.
- **Marketplace refunds** — 7-day return window is a future enhancement.
- **Guest checkout** — WhatsApp OTP login required. No anonymous checkout.
- **Multiple delivery addresses** — single address per checkout for all vendors.

---

## Implementation Checklist

- [ ] Migration 046: `payment_token`, `delivery_address`, `delivery_lat`, `delivery_lng` on orders
- [ ] `lib/vision/server-payment-ocr.js` — extract OCR from `/api/payment-verify/route.js`
- [ ] `app/api/shop/checkout/route.js`
- [ ] `app/api/shop/orders/route.js`
- [ ] `app/api/shop/orders/[id]/route.js` (GET customer + PATCH vendor)
- [ ] `app/api/shop/pay/[orderId]/route.js` (GET validate + POST OCR)
- [ ] WhatsApp gateway: `send-order-confirmation`, `send-order-notification`, `send-payment-link`
- [ ] Logistics bridge: `PICKED_UP` → DISPATCHED + `DELIVERED` → DELIVERED + payment link
- [ ] `app/shop/layout.jsx` — auth guard
- [ ] `app/shop/checkout/page.jsx` + `components/shop/checkout-summary.jsx`
- [ ] `app/shop/orders/page.jsx` + `app/shop/orders/[id]/page.jsx`
- [ ] `app/pay/[orderId]/page.jsx` + `components/shop/payment-upload.jsx`
- [ ] `hooks/use-shop-orders.js`
- [ ] `components/shop/cart-drawer.jsx` — wire Checkout button
- [ ] `app/pos/orders/page.jsx` — add MARKETPLACE filter tab
