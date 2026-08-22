# Feature: Rider Login & Delivery Management

**Feature ID**: F-RIDER-001
**Phase**: 3
**Status**: Planned
**Last Updated**: 2026-04-29

---

## Overview

A mobile-first rider web app at `/rider` that allows delivery agents to manage assigned orders, confirm pickup via OTP, and confirm delivery via OTP. No native app install required — opens in any mobile browser.

Both pickup and delivery use OTP verification to ensure physical handover is confirmed:
- **Pickup OTP**: generated at PROCESSING → sent to vendor → rider inputs at collection point → DISPATCHED
- **Delivery OTP**: generated at DISPATCHED → sent to customer → rider inputs at doorstep → DELIVERED → payment link auto-sent to customer

---

## Rider Account & Auth

### Account Creation
Rider accounts are created by **SUPER_ADMIN only** in the Admin Hub (`/admin/riders`). Fields:
- Name (required)
- WhatsApp number (required — E.164, used for notifications)
- PIN (4–6 digits, set by admin, rider can change on first login)
- Linked entity (optional — can be assigned to a specific vendor or unassigned/platform-wide)

Riders are stored in the `riders` table (new) with `role = 'RIDER'` and a bcrypt-hashed PIN.

### Authentication — Phone + PIN
Rider logs in at `/rider/login`:
1. Enter WhatsApp number
2. Enter PIN
3. Session established via Supabase auth (same JWT flow as vendors/customers)

PIN login does not use OTP — it is credential-based. Rider can change their PIN from their profile page.

---

## Order Assignment Flow

```
Vendor generates invoice → PROCESSING
  ↓ logistics-bridge: find available riders
  ↓ Send WhatsApp to rider #1: "New delivery — accept or reject"
    → Rider accepts via WhatsApp link → vendor notified with rider name
    → Rider rejects → system tries next rider
  ↓ Once accepted:
    - Order assigned: riders.current_order_id = order.id
    - Pickup OTP generated (6 digits) → stored on order
    - Pickup OTP sent to vendor WhatsApp
    - Pickup OTP displayed on sales invoice
```

---

## Pickup OTP Flow

```
Rider arrives at vendor store
Vendor reads pickup OTP from:
  - Invoice printout / PDF
  - WhatsApp message received earlier

Rider opens their web app → assigned order → "Confirm Pickup"
Rider inputs the 6-digit OTP
  → System verifies against orders.pickup_otp
  → On match: order → DISPATCHED
             pickup_otp → null (consumed)
             Delivery OTP generated → sent to customer WhatsApp
```

---

## Delivery OTP Flow

```
Rider arrives at customer address
Customer receives 6-digit delivery OTP on WhatsApp (sent on DISPATCHED)

Rider opens their web app → assigned order → "Confirm Delivery"
Rider inputs the 6-digit OTP from customer
  → System verifies against orders.delivery_otp
  → On match: order → DELIVERED
             delivery_otp → null (consumed)
             Payment link auto-sent to customer (same as before)
             Rider's order assignment cleared
```

---

## Database Changes (Migration 047)

### New `riders` table

```sql
CREATE TABLE riders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  whatsapp_no      TEXT NOT NULL UNIQUE,
  pin_hash         TEXT NOT NULL,           -- bcrypt hash of PIN
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_available     BOOLEAN NOT NULL DEFAULT true,  -- available to accept orders
  current_order_id UUID REFERENCES orders(id),     -- currently assigned order
  auth_user_id     UUID REFERENCES auth.users(id), -- Supabase auth user
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
```

### New columns on `orders`

```sql
ALTER TABLE orders
  ADD COLUMN pickup_otp          TEXT,        -- 6-digit OTP for pickup confirmation
  ADD COLUMN pickup_otp_expires_at TIMESTAMPTZ,
  ADD COLUMN delivery_otp        TEXT,        -- 6-digit OTP for delivery confirmation
  ADD COLUMN delivery_otp_expires_at TIMESTAMPTZ,
  ADD COLUMN rider_id            UUID REFERENCES riders(id),
  ADD COLUMN rider_accepted_at   TIMESTAMPTZ;
```

---

## API Routes

### `POST /api/rider/login`
Authenticate rider with WhatsApp number + PIN.
- Lookup `riders WHERE whatsapp_no = phone AND is_active = true`
- `bcrypt.compare(pin, pin_hash)`
- On success: sign in via Supabase auth (`signInWithPassword` with rider's auth user)
- Return session tokens

### `GET /api/rider/orders`
Rider's current assigned order + recent delivery history.
- Auth: rider session
- Returns: `{ current: order|null, history: order[] }`

### `POST /api/rider/orders/[id]/accept`
Rider accepts an assigned order.
- Marks `riders.is_available = false`, `riders.current_order_id = order.id`
- Generates pickup OTP (6 digits), stores on order with 2hr expiry
- Sends pickup OTP to vendor WhatsApp via gateway
- Notifies vendor of rider acceptance

### `POST /api/rider/orders/[id]/reject`
Rider rejects. System tries next available rider.

### `POST /api/rider/orders/[id]/pickup`
Rider confirms pickup by submitting vendor's OTP.
- Validates `pickup_otp` match + expiry
- Order → DISPATCHED, `pickup_otp = null`
- Generates delivery OTP (6 digits), sends to customer WhatsApp

### `POST /api/rider/orders/[id]/deliver`
Rider confirms delivery by submitting customer's OTP.
- Validates `delivery_otp` match + expiry
- Order → DELIVERED, `delivery_otp = null`
- Triggers payment link to customer (same gateway call as before)
- Clears `riders.current_order_id`, sets `is_available = true`

---

## WhatsApp Notifications (new gateway endpoints)

| Endpoint | When | Recipient | Message |
|----------|------|-----------|---------|
| `POST /api/send-rider-assignment` | Order assigned to rider | Rider | Order details + pickup address + accept/reject link |
| `POST /api/send-pickup-otp` | Rider accepts | Vendor | "Rider [Name] is coming. Pickup OTP: XXXXXX" |
| `POST /api/send-rider-accepted` | Rider accepts | Vendor | Rider name + ETA (stub) |
| `POST /api/send-delivery-otp` | Order DISPATCHED | Customer | "Rider is on the way. Your delivery OTP: XXXXXX. Share with rider on arrival." |

---

## Rider Web App Pages

### `/rider/login`
Phone number + PIN form. No OTP — direct credential login.

### `/rider` (dashboard)
- Current assigned order (if any) with pickup + delivery actions
- Accept/Reject pending assignment notification
- Quick stats: deliveries today, total this week

### `/rider/orders/[id]`
Order detail showing:
- Vendor address (pickup) with map link
- Customer address (delivery) with map link
- Order items summary
- **Confirm Pickup** button → OTP input modal
- **Confirm Delivery** button → OTP input modal (shown after pickup)
- Order status timeline

### `/rider/history`
Past completed deliveries — date, order number, amount, customer area.

### `/rider/profile`
Change PIN form.

---

## Admin Hub — Rider Management

### `/admin/riders`
- Table of all riders: name, WhatsApp, status (active/inactive), available, current order
- Add rider button → form (name, WhatsApp, initial PIN)
- Toggle active/inactive
- View rider's delivery history

---

## Scope Boundaries

- **No GPS tracking** — rider location is not tracked in real time. Addresses are shown as text with Google Maps deep links.
- **No fare calculation** — rider compensation is handled outside the system (Phase 5).
- **No multi-vendor riders** — a rider is platform-wide (admin-managed), not per-vendor.
- **OTP expiry** — pickup OTP: 2 hours. Delivery OTP: 4 hours. On expiry, vendor/customer can request a new one from their respective order detail page.

---

## Implementation Checklist

- [ ] Migration 047: `riders` table + `pickup_otp`, `delivery_otp`, `rider_id` columns on orders
- [ ] `POST /api/rider/login` — phone + PIN auth
- [ ] `GET /api/rider/orders` — current + history
- [ ] `POST /api/rider/orders/[id]/accept` — accept + generate pickup OTP + notify vendor
- [ ] `POST /api/rider/orders/[id]/reject` — reject + try next rider
- [ ] `POST /api/rider/orders/[id]/pickup` — validate pickup OTP → DISPATCHED + generate delivery OTP
- [ ] `POST /api/rider/orders/[id]/deliver` — validate delivery OTP → DELIVERED + payment link
- [ ] WhatsApp gateway: `send-rider-assignment`, `send-pickup-otp`, `send-rider-accepted`, `send-delivery-otp`
- [ ] Update logistics-bridge `/api/dispatch-delivery` to query available riders and send WhatsApp assignment
- [ ] `app/rider/login/page.jsx`
- [ ] `app/rider/page.jsx` (dashboard)
- [ ] `app/rider/orders/[id]/page.jsx`
- [ ] `app/rider/history/page.jsx`
- [ ] `app/rider/profile/page.jsx`
- [ ] `components/rider/otp-input-modal.jsx` (shared for pickup + delivery OTP)
- [ ] `app/admin/riders/page.jsx` + create rider form
- [ ] `hooks/use-rider.js`
- [ ] Update `app/pos/order/[id]/page.jsx` to display pickup OTP on invoice when status = PROCESSING
