# Feature: WhatsApp Ordering (Marketplace → POS)

**Feature ID**: F-WA-ORDER-001
**Phase**: 6
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Customers can initiate orders from the marketplace portal via WhatsApp, or send a direct message to the btGST business number. The whatsapp-gateway service receives the incoming webhook, parses product names and quantities from the message, fuzzy-matches them against the store's catalog, and creates a DRAFT order on the POS. Store staff then review, adjust, and confirm the order. The entire loop is mediated through WhatsApp messages — no app install or login required on the customer side.

**Dependencies**: whatsapp-gateway service (Meta Cloud API), F-MARKET-001

---

## User Flows

### A. Marketplace-initiated order

1. Customer browses the marketplace portal and adds items to a cart.
2. Customer taps **"Order via WhatsApp"**.
3. A `wa.me` deep link opens WhatsApp with a pre-filled message addressed to the btGST business number. The message lists the selected products with quantities, and includes a hidden context payload identifying the store.
4. Customer sends the message.
5. Gateway receives the webhook and proceeds to the **common processing pipeline** (below).

### B. Direct message order (no marketplace)

1. Customer opens a WhatsApp chat with the btGST business number directly.
2. Customer types a free-form order message (e.g. "2x Druk 1104, 1x Red Bull").
3. Gateway receives the webhook.
4. If the message carries no store context, gateway replies with a list button asking "Which store are you ordering from?" populated with stores the phone number has previously ordered from, plus a searchable full list.
5. Customer selects a store.
6. Gateway proceeds to the **common processing pipeline**.

### C. Common processing pipeline

1. **Receive webhook** — Gateway extracts: customer phone number (E.164), message text, WhatsApp message ID, and optional store context from the `referral` or button-reply payload.
2. **Rate-limit check** — If this phone has already placed >= 10 orders today, reply with "Daily order limit reached. Please try again tomorrow." and stop.
3. **Parse order intent** — Gateway extracts product names and quantities from the message text. Accepted formats:
   - `2x Product Name`
   - `Product Name x2`
   - `2 Product Name`
   - `Product Name` (quantity defaults to 1)
   - Multi-line lists (one item per line)
4. **Fuzzy-match products** — Each extracted product name is matched against the target store's catalog via a Supabase query using trigram similarity (`pg_trgm`). Confidence threshold:
   - >= 70%: **matched** — linked to the `products` row, quantity populated.
   - < 70%: **unmatched** — stored as raw text in the order item, flagged for manual review.
5. **Customer identification** — The customer's WhatsApp phone number is stored as `buyer_phone` on the order. If the number matches an existing `consumer_accounts` record, the order is linked to that customer profile.
6. **Create DRAFT order** — Gateway inserts an order with `status = 'DRAFT'`, `order_source = 'WHATSAPP'`, and the `whatsapp_message_id` for audit linkage. Matched items become `order_items` rows. Unmatched items are included with a `matched = false` flag and raw text preserved in `notes`.
7. **Reply to customer** — Gateway sends a confirmation message:
   ```
   Order received! [Store Name] will confirm shortly.
   Your items:
   - [matched product] × [qty] ✓
   - [unmatched text] ❌ (not found)

   We'll message you once confirmed.
   ```
8. **DRAFT appears on POS** — The order shows in the POS orders list (both desktop and PWA) with a **"WhatsApp Order"** badge and the customer's phone number. Staff can see which items matched and which need manual resolution.
9. **Staff reviews** — Store staff checks stock levels, resolves unmatched items (search catalog, add substitute, or remove), adjusts quantities if needed.
10. **Staff confirms** — Staff clicks **Confirm Order**. Status moves to `CONFIRMED`. Stock is reserved.
11. **Gateway notifies customer** — WhatsApp message sent:
    ```
    Order confirmed!
    Total: Nu. [grand_total]
    [Items list with quantities and prices]

    Ready for pickup at [Store Name].
    ```
    If delivery is available, the message includes a delivery option link.
12. **Order proceeds through normal lifecycle** — `CONFIRMED → PROCESSING → DELIVERED → COMPLETED` following the standard state machine from F-ORDER-001.

---

## Multi-Store Routing

A single btGST business number may serve multiple stores. Routing determines which store's POS receives the order.

| Source | Routing mechanism |
|--------|-------------------|
| Marketplace "Order via WhatsApp" button | Store context embedded in the `wa.me` link as a referral parameter. Gateway extracts and resolves to `entity_id`. |
| Direct message (first time) | Gateway replies with an interactive list of stores. Customer selects one. Selection is cached for 24 hours. |
| Direct message (returning) | If the phone has ordered in the last 24 hours, gateway uses the last-selected store and replies "Ordering from [Store Name]. Reply CHANGE to switch stores." |
| Reply "CHANGE" | Resets the cached store and presents the store selection list again. |

---

## Rate Limiting

- **Limit**: 10 orders per phone number per calendar day (UTC).
- **Scope**: Counts DRAFT + CONFIRMED + PROCESSING orders with `buyer_phone` matching the sender.
- **Reset**: Daily at 00:00 UTC.
- **Response on limit**: Reply with a friendly message; do not create the order.
- **Implementation**: Supabase query counting orders by `buyer_phone` with `created_at >= current_date`. No separate rate-limit table needed.

---

## Database Changes

### `orders` table additions

```sql
-- Column: order source
ALTER TABLE orders ADD COLUMN order_source TEXT NOT NULL DEFAULT 'POS'
  CHECK (order_source IN ('POS', 'WHATSAPP', 'MARKETPLACE_WEB'));

-- Column: link to original WhatsApp message for audit trail
ALTER TABLE orders ADD COLUMN whatsapp_message_id TEXT;

-- Column: customer phone for WhatsApp-originated orders
ALTER TABLE orders ADD COLUMN buyer_phone TEXT;  -- E.164 format
```

### `order_items` table additions

```sql
-- Flag for items that could not be auto-matched
ALTER TABLE order_items ADD COLUMN matched BOOLEAN NOT NULL DEFAULT true;

-- Raw text from the customer's message (preserved for unmatched items)
ALTER TABLE order_items ADD COLUMN raw_request_text TEXT;

-- Match confidence score (0.0–1.0) from fuzzy matching
ALTER TABLE order_items ADD COLUMN match_confidence DECIMAL(3,2);
```

### `consumer_accounts` table (if not exists)

Minimal customer profile keyed by phone number. Created on first WhatsApp order if no match found.

```sql
CREATE TABLE IF NOT EXISTS consumer_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,           -- E.164 WhatsApp number
  display_name  TEXT,                            -- From WhatsApp profile, if available
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_order_at TIMESTAMPTZ
);
```

### Indexes

```sql
-- Fast rate-limit lookups
CREATE INDEX idx_orders_buyer_phone_date ON orders (buyer_phone, created_at)
  WHERE order_source = 'WHATSAPP';

-- Fast fuzzy-match queries (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
```

---

## WhatsApp Gateway Service Changes

### New webhook handler: `POST /webhook/whatsapp/messages`

Receives incoming message webhooks from Meta Cloud API. Responsibilities:

1. Verify webhook signature (HMAC-SHA256).
2. Extract sender phone, message text, message ID, and interactive reply payload.
3. Determine intent: **new order** vs. **store selection reply** vs. **CHANGE command**.
4. Route to the appropriate handler.

### New endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /webhook/whatsapp/messages` | Incoming message webhook (Meta → Gateway) |
| `POST /internal/orders/confirm` | POS confirms a WhatsApp order; gateway sends notification to customer |
| `POST /internal/orders/{id}/reply` | POS sends a custom reply to the customer (e.g. "Out of stock, substitute okay?") |

### Message templates

Gateway uses WhatsApp Message Templates (pre-approved by Meta) for structured replies. Two templates required:

1. **order_received** — Sent when order is parsed and DRAFT created. Body: order summary with matched/unmatched items.
2. **order_confirmed** — Sent when store confirms the order. Body: final item list, total amount, pickup/delivery info.

For interactive store selection, the gateway uses the WhatsApp Interactive List message type (no template required).

---

## Fuzzy-Match Algorithm

Product matching uses PostgreSQL `pg_trgm` similarity against the store's active product catalog.

```sql
SELECT id, name, similarity(name, $1) AS score
FROM products
WHERE entity_id = $2
  AND active = true
  AND similarity(name, $1) >= 0.7
ORDER BY score DESC
LIMIT 1;
```

**Matching rules:**
- Threshold: `similarity >= 0.7` (70%).
- If multiple products score above threshold, the highest-scoring match wins.
- If no product meets the threshold, the item is flagged as unmatched.
- Unit variants (e.g. "Coke 500ml" vs "Coke 1L") are treated as separate products — the customer's text must disambiguate. If ambiguous, the lower-priced variant is selected and staff can adjust.

---

## POS UI Changes

### Orders list

- New filter pill: **"WhatsApp"** — shows only `order_source = 'WHATSAPP'` orders.
- Badge: Orders from WhatsApp show a green WhatsApp icon badge in the list row.
- Unmatched items indicator: If any `order_items.matched = false`, show a warning icon with count.

### Order detail panel

- **Customer section**: Shows buyer phone number (tappable to open WhatsApp chat). If linked to `consumer_accounts`, shows display name.
- **Items section**: Matched items shown normally. Unmatched items highlighted in amber with the raw request text and a **"Search catalog"** button to manually link or substitute.
- **Actions**: Additional **"Reply to customer"** button that opens a text input to send a free-form WhatsApp message via the gateway.

### Marketplace "Order via WhatsApp" button

- Generates a `wa.me/{business_number}?text={encoded_message}` link.
- Message format:
  ```
  Hi! I'd like to order:
  - [Product Name] × [qty]
  - [Product Name] × [qty]
  ...
  Ref: [store_slug]
  ```
- The `Ref:` line is used by the gateway to route to the correct store.

---

## Error Handling

| Scenario | Gateway response | Order state |
|----------|-----------------|-------------|
| Store context invalid / store not found | Reply: "Sorry, that store is no longer available. Please visit the marketplace to find active stores." | No order created |
| All items unmatched (0 matches) | Reply: "We couldn't match any of your items. Please try with exact product names or browse the marketplace." | DRAFT created (all items unmatched) — visible to staff |
| Rate limit exceeded | Reply: "You've reached the daily order limit (10). Please try again tomorrow." | No order created |
| Supabase unavailable | Reply: "Sorry, we're experiencing technical issues. Please try again in a few minutes." | No order created |
| WhatsApp API error (send failure) | Log error. Retry up to 3 times with exponential backoff. If all fail, mark order with `whatsapp_delivery_failed = true` for staff to follow up manually. | DRAFT created |
| Partial match (some items matched, some not) | Reply with mixed ✓/❌ list as described in the flow | DRAFT created |

---

## Implementation Checklist

- [ ] Add `order_source`, `whatsapp_message_id`, `buyer_phone` columns to `orders` table
- [ ] Add `matched`, `raw_request_text`, `match_confidence` columns to `order_items` table
- [ ] Create `consumer_accounts` table
- [ ] Create `pg_trgm` extension and trigram index on `products.name`
- [ ] Create rate-limit index on `orders(buyer_phone, created_at)`
- [ ] Implement webhook signature verification in whatsapp-gateway
- [ ] Implement message parser (product name + quantity extraction)
- [ ] Implement fuzzy-match query against store catalog
- [ ] Implement rate-limit check (10/day per phone)
- [ ] Implement DRAFT order creation with WhatsApp source
- [ ] Implement customer reply message (matched/unmatched summary)
- [ ] Implement store routing: context extraction from `wa.me` referral
- [ ] Implement store routing: interactive list for direct messages
- [ ] Implement store selection caching (24h per phone)
- [ ] Implement CHANGE command handler
- [ ] Implement order confirmation notification to customer
- [ ] Implement POS reply-to-customer endpoint
- [ ] Submit `order_received` message template to Meta for approval
- [ ] Submit `order_confirmed` message template to Meta for approval
- [ ] Add WhatsApp order badge and filter to POS orders list
- [ ] Add unmatched item warning indicator to POS order list rows
- [ ] Add unmatched item resolution UI (search catalog, substitute, remove) to POS order detail
- [ ] Add customer phone + reply button to POS order detail panel
- [ ] Implement marketplace "Order via WhatsApp" button with `wa.me` deep link generation
- [ ] Add error handling for all failure scenarios listed above
- [ ] Write integration tests for the full order pipeline (message → DRAFT → confirm → notify)
- [ ] Write unit tests for message parser (various formats, edge cases)
- [ ] Write unit tests for fuzzy-match thresholds (70% boundary cases)

---

## Resolved Decisions

| # | Decision |
|---|----------|
| 1 | Orders are always created as DRAFT — never auto-confirmed. Staff must explicitly review and confirm every WhatsApp order. |
| 2 | Product matching uses PostgreSQL `pg_trgm` similarity (server-side). No external NLP service to minimize latency and cost. |
| 3 | Match confidence threshold is **70%**. Below that, item is flagged unmatched for manual resolution. Adjustable per store in future. |
| 4 | Rate limit is **10 orders/day/phone**. Prevents spam without blocking legitimate use. Counted against DRAFT + CONFIRMED + PROCESSING orders. |
| 5 | Customer identification is **phone-number-based only**. No WhatsApp login or OAuth required. Phone is the universal key. |
| 6 | Multi-store routing uses **referral context** from marketplace links. Direct messages use an **interactive list** with 24-hour cache. |
| 7 | `orders.order_source` uses a CHECK constraint (`POS`, `WHATSAPP`, `MARKETPLACE_WEB`) — not a free-text field — to guarantee clean filtering. |
| 8 | Unmatched items are **not discarded**. They are preserved in the DRAFT as flagged rows so staff can resolve them. This prevents lost orders. |
| 9 | The `consumer_accounts` table is minimal (phone + display_name). Rich profiles are a future concern. Table is created only if it does not already exist. |
| 10 | WhatsApp Message Templates (`order_received`, `order_confirmed`) must be pre-approved by Meta. Development can use test-mode messages until approved. |
