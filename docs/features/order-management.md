# Feature: Order Management & Tracking

**Feature ID**: F-ORDER-001  
**Phase**: 2 (Core POS) + 4 (Supply Chain)  
**Status**: Scoped  
**Last Updated**: 2026-04-07

---

## Order Types

The system handles three distinct order types, each with its own lifecycle:

| Type | Parties | Channel | Phase |
|------|---------|---------|-------|
| **POS Sale** | Retailer → Consumer | POS Terminal (in-store) | Phase 2 |
| **Wholesale Order** | Retailer → Wholesaler | Admin Hub / POS restock | Phase 4 |
| **Marketplace Order** | Consumer → Retailer | Marketplace portal | Phase 5 |

---

## Order Lifecycle States

All three order types share the same state machine. Not all states apply to every type (noted per state).

```
DRAFT                    ← POS only: cart being built, not yet submitted
  ↓
PENDING_PAYMENT          ← Awaiting payment confirmation
  ↓
PAYMENT_VERIFYING        ← mBoB/mPay/RTGS verification in progress
  ↓
CONFIRMED                ← Payment verified, stock reserved
  ↓
PROCESSING               ← Wholesale/Marketplace: being picked & packed
  ↓
DISPATCHED               ← Wholesale/Marketplace: handed to Toofan/Rider
  ↓
DELIVERED                ← Confirmed receipt by buyer
  ↓
COMPLETED                ← Final state, GST locked, audit trail closed

--- Diverging paths ---

PENDING_PAYMENT → PAYMENT_FAILED   ← Payment verification failed
PAYMENT_FAILED  → PENDING_PAYMENT  ← Retry allowed (up to 3 attempts)
PAYMENT_FAILED  → CANCELLED        ← Max retries exceeded or user abandons

CONFIRMED → CANCELLATION_REQUESTED ← Buyer or Retailer initiates
DISPATCHED → CANCELLATION_REQUESTED ← Only allowed before delivery confirmed
CANCELLATION_REQUESTED → CANCELLED  ← Approved by authorized role
CANCELLATION_REQUESTED → CONFIRMED  ← Rejected, order resumes

DELIVERED → REFUND_REQUESTED       ← Buyer reports issue
COMPLETED → REFUND_REQUESTED       ← Within refund window only
REFUND_REQUESTED → REFUND_APPROVED ← Authorized role approves
REFUND_REQUESTED → REFUND_REJECTED ← Dispute resolved against buyer
REFUND_APPROVED → REFUND_PROCESSING
REFUND_PROCESSING → REFUNDED       ← Final state

REFUND_APPROVED → REPLACEMENT_REQUESTED  ← Instead of cash refund
REPLACEMENT_REQUESTED → REPLACEMENT_DISPATCHED
REPLACEMENT_DISPATCHED → REPLACEMENT_DELIVERED ← Final state
```

---

## Database Schema

### `carts` + `cart_items` tables
Cart state is persisted in the DB — not in memory or localStorage. A cart belongs to a store (`entity_id`) and is linked to a customer via Face-ID (`buyer_hash`) or WhatsApp number. When an order is confirmed, the originating cart is automatically marked `CONVERTED` via a DB trigger. Status: `ACTIVE` → `CONVERTED` or `ABANDONED`.

### `order_items` table
Normalized line-item table. Each row is one product line in an order with its own `status` (`ACTIVE` / `CANCELLED` / `REFUNDED` / `REPLACED`). The `orders.items` JSONB column is retained as an immutable receipt snapshot only — all operational queries use `order_items`.

### `order_cancellation_items` table
Records exactly which items and quantities were cancelled in a partial cancellation. Linked to `order_items` so stock is precisely restored per item, not for the whole order.

### Refund & Replacement Item Linking
`refunds.order_item_id` and `replacements.order_item_id` target specific line items — enabling partial refunds (e.g. refund 2 of 5 units of item X) and per-item replacements without affecting the rest of the order.

### `orders` table

```sql
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type        TEXT NOT NULL CHECK (order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE')),
  order_no          TEXT UNIQUE NOT NULL,        -- e.g. POS-2026-00142, WHL-2026-00021
  status            TEXT NOT NULL DEFAULT 'DRAFT',
  seller_id         UUID NOT NULL REFERENCES entities(id),
  buyer_id          UUID REFERENCES entities(id), -- NULL for anonymous POS consumer
  buyer_hash        VECTOR(512),                  -- Face-ID for loyalty (POS only)
  items             JSONB NOT NULL,               -- [{sku, name, qty, rate, discount, gst_5, total}]
  subtotal          DECIMAL(12,2) NOT NULL,
  gst_total         DECIMAL(12,2) NOT NULL,
  grand_total       DECIMAL(12,2) NOT NULL,
  payment_method    TEXT CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT')),
  payment_ref       TEXT,                         -- Bank/gateway reference number
  payment_verified_at TIMESTAMPTZ,
  ocr_verify_id     TEXT,                         -- Gemini vision verification ID
  retry_count       INT DEFAULT 0,                -- Payment retry attempts
  max_retries       INT DEFAULT 3,
  whatsapp_status   TEXT DEFAULT 'PENDING' CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  digital_signature TEXT,                         -- SHA-256 of inv_no + grand_total + seller_tpn
  created_by        UUID REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT
);
```

### `order_status_log` table
Every state transition is recorded — immutable append-only log.

```sql
CREATE TABLE order_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID REFERENCES user_profiles(id),  -- NULL = system transition
  actor_role  TEXT,
  reason      TEXT,
  metadata    JSONB,   -- e.g. { error_code, gateway_response, retry_attempt }
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `payment_attempts` table
Tracks every payment attempt — successes and failures.

```sql
CREATE TABLE payment_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  attempt_number  INT NOT NULL,
  payment_method  TEXT NOT NULL,
  gateway         TEXT,                -- 'MBOB' | 'MPAY' | 'RTGS' | 'MANUAL'
  amount          DECIMAL(12,2) NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED')),
  gateway_ref     TEXT,                -- Reference from payment gateway
  gateway_response JSONB,             -- Full raw response for debugging
  failure_code    TEXT,               -- Standardized internal error code
  failure_reason  TEXT,               -- Human-readable reason
  initiated_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);
```

### `refunds` table

```sql
CREATE TABLE refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id),
  refund_type     TEXT NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  refund_method   TEXT NOT NULL,       -- Must match original payment method
  amount          DECIMAL(12,2) NOT NULL,
  gst_reversal    DECIMAL(12,2) NOT NULL,
  reason          TEXT NOT NULL,
  requested_by    UUID NOT NULL REFERENCES user_profiles(id),
  approved_by     UUID REFERENCES user_profiles(id),
  status          TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  gateway_ref     TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `replacements` table

```sql
CREATE TABLE replacements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id     UUID NOT NULL REFERENCES orders(id),
  replacement_order_id  UUID REFERENCES orders(id),  -- New order created for replacement
  reason                TEXT NOT NULL,
  requested_by          UUID NOT NULL REFERENCES user_profiles(id),
  approved_by           UUID REFERENCES user_profiles(id),
  status                TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'DELIVERED')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Transaction Failure Handling

### Payment Failure Flow
```
Payment attempt initiated
  → Gateway timeout (>30s) → status: TIMEOUT → auto-retry after 10s
  → Gateway decline       → status: FAILED  → show failure reason to cashier
  → Network error         → status: FAILED  → retry prompt shown

Retry logic:
  retry_count < max_retries (3) → allow retry with same or different payment method
  retry_count = max_retries     → order moves to PAYMENT_FAILED
                                → cashier prompted: Abandon or Escalate
  Abandon → order CANCELLED, stock released
  Escalate → order held in PAYMENT_FAILED, manager notified via WhatsApp
```

### Failure Codes (Standardized)
| Code | Meaning |
|------|---------|
| `PAY_001` | Gateway timeout |
| `PAY_002` | Insufficient funds |
| `PAY_003` | Invalid account / wrong credentials |
| `PAY_004` | Daily limit exceeded |
| `PAY_005` | Network error (client-side) |
| `PAY_006` | Gateway unavailable |
| `PAY_007` | Max retries exceeded |
| `PAY_008` | OCR verification failed (screenshot unreadable) |
| `PAY_009` | Duplicate payment reference detected |
| `ORD_001` | Insufficient stock at time of confirmation |
| `ORD_002` | Credit limit exceeded (wholesale orders) |
| `ORD_003` | Entity suspended |

### Idempotency
Every payment attempt carries an idempotency key (`order_id + attempt_number`) sent to the gateway. Prevents double-charges on network retries.

---

## Cancellation Rules

| Order Type | Status | Who Can Cancel | Stock Released | Refund Triggered |
|------------|--------|----------------|----------------|-----------------|
| POS Sale | PENDING_PAYMENT | Cashier, Manager | Yes | No (not charged) |
| POS Sale | CONFIRMED | Manager, Owner | Yes | Yes (if paid) |
| POS Sale | COMPLETED | — | No | Refund process only |
| Wholesale | Any pre-DISPATCHED | Retailer Owner, Wholesaler | Yes | Yes (if paid) |
| Wholesale | DISPATCHED | Wholesaler Owner only | No | Case by case |
| Marketplace | Pre-DISPATCHED | Consumer, Retailer | Yes | Yes |
| Marketplace | DISPATCHED | Retailer Owner only | No | Refund + return |

### Cancellation Approval Tiers
- **CASHIER**: Cannot cancel confirmed/paid orders
- **MANAGER**: Can cancel up to CONFIRMED state
- **OWNER**: Can cancel up to DISPATCHED state
- **SUPER_ADMIN**: Can cancel at any state with mandatory reason

---

## Refund Policy & Flow

### Refund Windows
| Order Type | Window |
|------------|--------|
| POS Sale | Same day only (before end-of-day reconciliation) |
| Wholesale Order | 48 hours after delivery |
| Marketplace Order | 7 days after delivery |

### Refund Approval Tiers
| Amount | Approver Required |
|--------|------------------|
| < Nu 500 | Manager |
| Nu 500 – Nu 5,000 | Owner |
| > Nu 5,000 | DISTRIBUTOR or SUPER_ADMIN |

### GST Handling on Refunds
- Full refund → full GST reversal recorded in `refunds.gst_reversal`
- Partial refund → proportional GST reversal
- ITC adjustment created for B2B wholesale refunds
- GST report excludes refunded transactions from monthly totals

### Refund Method Rules
- Refund must be issued via the same payment method as original
- Exception: CASH payments may be refunded via mPay if cashier approves
- CREDIT order refunds reduce the buyer's outstanding credit balance

---

## Replacement Flow

```
Buyer requests replacement (within refund window)
  → Reason captured (wrong item / damaged / expired)
  → Manager or Owner approves
  → New replacement order created (linked to original via replacements table)
  → Stock reserved for replacement item
  → Dispatched via same logistics channel
  → On REPLACEMENT_DELIVERED: original order marked COMPLETED with replacement flag
  → No cash movement — original payment stands
```

---

## Logging Strategy

### What Gets Logged
Every state transition → `order_status_log` (append-only, no updates/deletes)  
Every payment attempt → `payment_attempts` (full gateway response stored in JSONB)  
Every refund action → `refunds` + `audit_logs`  
Every cancellation → `order_status_log` with mandatory reason  
Every WhatsApp notification → `orders.whatsapp_status` updated + `audit_logs` entry  

### What Never Gets Deleted
`order_status_log` and `payment_attempts` are compliance records. No DELETE policies. Soft-archive only via a `archived_at` column if needed for performance.

### Log Visibility by Role
| Log Type | Cashier | Manager | Owner | Distributor | Super Admin |
|----------|---------|---------|-------|-------------|-------------|
| Order status | Own orders | All store | All store | Their retailers | All |
| Payment attempts | None | Current order | All | All retailers | All |
| Refund log | None | Own approved | All | All | All |
| Raw gateway response | Never | Never | Never | Never | Yes |

---

## WhatsApp Notifications (Order Events)

| Event | Recipient | Message Type |
|-------|-----------|-------------|
| CONFIRMED | Consumer (if phone known) | Receipt PDF |
| DISPATCHED | Consumer | Tracking link + rider name |
| DELIVERED | Consumer | Delivery confirmation |
| CANCELLED | Consumer + Retailer | Cancellation notice |
| REFUND_APPROVED | Consumer | Refund details + timeline |
| REFUNDED | Consumer | Confirmation + amount |
| PAYMENT_FAILED (max retries) | Owner/Manager | Alert with order details |
| Stock reserved for replacement | Retailer | Replacement dispatch notice |

---

## Implementation Checklist

### Database
- [ ] Create `orders` table with state machine constraints
- [ ] Create `order_status_log` (append-only, no RLS delete)
- [ ] Create `payment_attempts` table
- [ ] Create `refunds` table
- [ ] Create `replacements` table
- [ ] DB trigger: auto-insert into `order_status_log` on every `orders.status` update
- [ ] DB trigger: auto-update `inventory_movements` on CONFIRMED and CANCELLED
- [ ] DB trigger: auto-update `updated_at` on orders

### POS Terminal
- [ ] Cart → DRAFT order creation
- [ ] Payment method selector with retry UI
- [ ] Payment failure screen (failure code + reason + retry/abandon options)
- [ ] Max retry gate (escalate to manager flow)
- [ ] Cancellation confirmation modal (with reason input)
- [ ] Same-day refund flow for cashier/manager

### Admin Hub
- [ ] Order list with status filter and search
- [ ] Order detail view with full status timeline
- [ ] Refund approval workflow UI
- [ ] Replacement approval and dispatch UI
- [ ] Payment attempts log view (Manager+)
- [ ] Bulk order export for reconciliation

### Notifications
- [ ] WhatsApp trigger on each status transition
- [ ] Failed notification retry (3 attempts, then flag in audit_logs)

---

## Resolved Decisions

**Q: How is CREDIT payment tracked and reconciled?**  
A: A dedicated credit ledger exists per buyer (consumer or retailer). Rules:
- Credit limit set by **Retailer for their consumers**, **Wholesaler for their Retailers**
- Each CREDIT order draws down the buyer's available credit balance
- Repayments are **recorded as separate transactions** in the credit ledger (not edits to existing orders)
- **Late payment alerts** sent via WhatsApp when due date passes without repayment
- **Credit freeze** automatically applied when buyer exceeds their limit — no new CREDIT orders allowed until balance is cleared
- See `F-CREDIT-001` (to be scoped) for full credit ledger feature

**Q: How are anonymous POS transactions handled?**  
A: **Anonymous transactions are not allowed.** Every transaction requires consumer identification via one of two methods:
- **Primary**: Face-ID match (opt-in, QR consent flow)
- **Fallback**: Cashier manually enters consumer's WhatsApp number before checkout can complete
- Transaction cannot be confirmed without one of the two — the POS blocks progression until a consumer is identified
- This ensures every receipt has a delivery destination and every transaction is attributable

**Q: Do marketplace refunds require physical item return?**  
A: **Yes — physical return is mandatory before refund is approved.** Rules:
- Consumer initiates return request in Marketplace portal
- Rider/Toofan agent is dispatched for **reverse logistics** — consumer hands item back to agent
- Retailer or Authorized Representative physically receives and inspects the item
- Refund is only approved **after confirmed physical receipt** — no honour-based approvals
- Return shipment is tracked as a reverse order in the logistics system (linked to original order)
- If item is not returned within 48 hours of return request, request expires and must be re-initiated
