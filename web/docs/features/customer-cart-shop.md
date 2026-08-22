# Feature: Customer Cart & Multi-Store Shop

**Feature ID**: F-SHOP-001
**Phase**: 3
**Status**: Code Complete
**Last Updated**: 2026-04-29

---

## Overview

A cart-based consumer shopping experience built into the main Next.js app. Customers browse products from all active retailers on a single discovery page, or drill into a specific store's page. Products can be added to a persistent cart (one cart per retailer), reviewed in a slide-out drawer, and checked out.

This replaces the earlier per-store editorial page (`/shop/[slug]`) which used a WhatsApp-only ordering flow with no cart. The new experience supports authenticated customers (WhatsApp OTP login) with cart state persisted in Supabase.

**URL patterns**:
- `/shop` — multi-store product discovery grid
- `/shop/store_[id]` — single store product grid filtered by retailer UUID

---

## Authentication Model

Cart operations require a logged-in customer. Unauthenticated users can browse but are redirected to `/login?redirect=<current-page>` when they attempt to add to cart. Login uses WhatsApp OTP (see F-AUTH-001); on success the CUSTOMER role redirects back to `/shop`.

Customer identity is tracked by `entities.whatsapp_no` (E.164 phone number from JWT `user_metadata.phone`). This is how carts are associated to a customer without exposing UUID-based IDs to the client.

---

## Cart Data Model

### `carts` table

One cart per customer per retailer. Status is `ACTIVE` while shopping, transitions to `ORDERED` or `ABANDONED` on checkout or expiry.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `entity_id` | UUID FK | Retailer who owns this cart's products |
| `customer_whatsapp` | TEXT | E.164 phone, links cart to customer |
| `status` | TEXT | `ACTIVE` / `ORDERED` / `ABANDONED` |
| `created_by` | UUID FK | auth.users.id of the customer |
| `created_at` | TIMESTAMPTZ | |

### `cart_items` table

Line items within a cart. Prices snapshot at add-time so price changes don't silently alter existing carts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `cart_id` | UUID FK | Parent cart |
| `product_id` | UUID FK | |
| `sku` | TEXT | Snapshot |
| `name` | TEXT | Snapshot |
| `quantity` | INT | |
| `unit_price` | NUMERIC | MRP at add-time |
| `gst_5` | NUMERIC | `unit_price × 0.05 × quantity` |
| `total` | NUMERIC | `unit_price × quantity × 1.05` (GST-inclusive) |
| `added_at` | TIMESTAMPTZ | |

GST is pre-calculated and stored. `total` is always GST-inclusive. The cart drawer derives the ex-GST subtotal as `total / 1.05`.

---

## API Routes

### `GET /api/cart`

Returns all ACTIVE carts for the authenticated customer, with items and computed subtotals.

```json
{
  "carts": [
    {
      "id": "...",
      "entity_id": "...",
      "entities": { "id": "...", "name": "Demo Store", "whatsapp_no": "+975..." },
      "items": [...],
      "itemCount": 3,
      "subtotal": 315.00
    }
  ]
}
```

`subtotal` is the sum of `item.total` values — i.e. GST-inclusive. The drawer displays it correctly by back-calculating `subtotal / 1.05` for the ex-GST line.

### `POST /api/cart`

Adds a product to the cart. Finds or creates the ACTIVE cart for the customer+retailer pair, then upserts the cart item (increments quantity if already present).

```json
// Request
{ "productId": "uuid", "quantity": 1 }

// Response
{ "success": true }
```

Validates: product exists, `is_active`, sufficient stock.

### `PATCH /api/cart/[itemId]`

Updates quantity on an existing cart item. Recalculates `gst_5` and `total`. If `quantity = 0`, deletes the item.

```json
{ "quantity": 2 }
```

### `DELETE /api/cart/[itemId]`

Removes a cart item. Verifies the item belongs to the authenticated customer before deletion.

---

## CartContext (`lib/cart-context.js`)

React context wrapping all cart state. Provided at root layout so the cart badge and drawer are available on every page.

```js
const { carts, itemCount, isOpen, setIsOpen, addToCart, updateQuantity, removeItem, fetchCart } = useCart()
```

`addToCart` returns `{ success, unauthorized, error }`. Callers check `unauthorized` to redirect to login.

---

## Pages

### `/shop` (`app/shop/page.jsx`)

- Loads all `is_active` products with `current_stock > 0` from Supabase (anon client, public data)
- Horizontally scrollable store carousel at the top linking to `/shop/store_[id]`
- Product grid (2 cols mobile, 4–5 cols desktop)
- Cart badge in header showing `itemCount`
- `ProductDetailModal` on card click with full product info and Add to Cart CTA
- Redirects to login on cart add if unauthenticated

### `/shop/store_[id]` (`app/shop/store_[id]/page.jsx`)

- Loads single retailer's products via `created_by = storeId`
- Store info banner (name, TPN, WhatsApp number)
- Same product grid + cart + modal pattern as main shop page
- Login redirect includes `?redirect=/shop/store_[id]` for seamless return

---

## Components

### `CartDrawer` (`components/shop/cart-drawer.jsx`)

Slide-up bottom sheet on mobile, fixed sidebar on desktop. Shows carts grouped by store with quantity controls and item removal. Footer shows:

```
Subtotal (ex-GST):  Nu. XXX.XX
GST (5%):           Nu. XX.XX
Total:              Nu. XXX.XX
[Checkout (N items)]
```

### `ProductDetailModal` (`components/shop/product-detail-modal.jsx`)

Full-screen modal with product image, stock badge, price, store info, HSN/SKU, specifications, batch/expiry, and Add to Cart button.

---

## Scope Boundaries

This feature explicitly does **not** include:

- **Checkout / payment processing.** The Checkout button is a placeholder. Payment flow is a future feature.
- **Order creation.** Cart → Order conversion is not yet wired up.
- **Inventory reservation.** Stock is not held while in cart; validation happens at checkout.
- **Guest cart.** Cart requires authentication. Unauthenticated users are redirected to login.
- **Cart expiry / abandonment.** ACTIVE carts persist indefinitely until checked out or manually cleared.

---

## Implementation Checklist

- [x] `carts` and `cart_items` tables (migration 011)
- [x] RLS policies for cart tables (migration 039)
- [x] CUSTOMER role in entities/user_profiles constraints (migration 041)
- [x] Service role bypass for customer signup (migrations 042/043)
- [x] `GET /api/cart` — fetch carts with items
- [x] `POST /api/cart` — add to cart with upsert
- [x] `PATCH /api/cart/[itemId]` — update quantity
- [x] `DELETE /api/cart/[itemId]` — remove item
- [x] `CartProvider` + `useCart` context
- [x] `CartDrawer` component with quantity controls and GST breakdown
- [x] `ProductDetailModal` component (shop variant)
- [x] `/shop` page — multi-store product grid
- [x] `/shop/store_[id]` page — single store product grid
- [x] Unauthenticated redirect to login with return URL
- [x] Fixed Next.js 15 async params in `[itemId]` route handlers
- [ ] Checkout / payment flow
- [ ] Cart expiry / abandonment handling
- [ ] Order creation from cart
