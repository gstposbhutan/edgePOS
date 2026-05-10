# Feature: Line-Item Discount (Flat / Percentage)

**Feature ID**: F-DISCOUNT-001
**Phase**: 5
**Status**: Implemented
**Last Updated**: 2026-05-06

---

## Overview

Allows vendor users to apply per-product discounts during POS checkout. Discounts can be entered as a flat Nu. amount or as a percentage. The system recalculates GST and totals automatically. An audit trail records every discount change on finalized order items.

---

## Discount Types

| Type | Input | Storage | Example |
|------|-------|---------|---------|
| **Flat** | Nu. amount per unit | `discount = value`, `discount_type = 'FLAT'` | Nu. 10 off → discount = 10.00 |
| **Percentage** | % of unit price | `discount = computed flat`, `discount_type = 'PERCENTAGE'` | 5% of Nu.100 → discount = 5.00 |

The `discount` column always stores the **computed flat amount** for consistent reporting and GST calculation. The original input is preserved in `discount_value`.

---

## Access Control

All POS roles can apply discounts:
- **CASHIER** — can discount during checkout
- **MANAGER** — can discount + override prices
- **OWNER** — full access

---

## Keyboard POS Flow

1. Add items to cart
2. Select a row with ↑/↓ arrow keys
3. Press **Ctrl+M** → discount modal opens
4. Choose **Flat (Nu.)** or **Percentage (%)** toggle
5. Enter discount value
6. Preview shows effective discount and price after discount
7. Press **Enter** or click **Apply** → discount applied, GST recalculated
8. Cart table shows discount column (green text)

### Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+M | Open discount modal on selected row |

---

## Touch POS Flow

1. Add items to cart
2. Tap the **Tag** icon on a cart item
3. Toggle between **Flat (Nu.)** / **Percent (%)**
4. Enter value and tap **OK**
5. Discount badge updates to show type (e.g. `−5%` or `−Nu.10.00`)

---

## GST Calculation

```
taxable_amount = unit_price − discount
gst_5 = taxable_amount × 0.05 × quantity
total = (taxable_amount + gst_5/unit) × quantity
```

The 5% GST is always calculated on the discounted price, ensuring tax compliance.

---

## Database Schema

### `cart_items` additions (Migration 070)

```sql
discount_type  TEXT NOT NULL DEFAULT 'FLAT' CHECK (discount_type IN ('FLAT', 'PERCENTAGE'))
discount_value DECIMAL(12,2) NOT NULL DEFAULT 0
```

### `order_items` additions (Migration 070)

```sql
discount_type  TEXT NOT NULL DEFAULT 'FLAT' CHECK (discount_type IN ('FLAT', 'PERCENTAGE'))
discount_value DECIMAL(12,2) NOT NULL DEFAULT 0
```

### Audit Trigger

Every update to `discount`, `discount_type`, or `discount_value` on `order_items` inserts a row into `audit_logs`:

```sql
-- Trigger: trg_order_item_discount_audit on order_items AFTER UPDATE
-- Records: table_name, record_id, operation='UPDATE',
--          old_values (discount, discount_type, discount_value),
--          new_values (discount, discount_type, discount_value),
--          actor_id, actor_role
```

---

## API

### `applyDiscount(itemId, { type, value })`

In `hooks/use-cart.js`. Accepts:
- `{ type: 'FLAT', value: 10 }` → 10 Nu. per unit
- `{ type: 'PERCENTAGE', value: 5 }` → 5% of unit price

Returns updated cart item with recalculated `gst_5` and `total`.

Legacy support: passing a flat number still works (`applyDiscount(itemId, 10)`).

---

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/070_discount_audit.sql` | DB columns + audit trigger |
| `hooks/use-cart.js` | `applyDiscount` with flat/percentage support |
| `components/pos/keyboard/discount-modal.jsx` | Ctrl+M modal for keyboard POS |
| `components/pos/keyboard/cart-table.jsx` | Discount column in cart table; Enter/Tab confirm qty edit |
| `components/pos/cart-panel.jsx` | Touch POS discount toggle UI |
| `app/pos/page.jsx` | Ctrl+M shortcut + discount modal wiring |
| `app/pos/orders/[id]/page.jsx` | Order detail shows discount type |

---

## Reporting

Sales reports can group by:
- `discount_type` — filter flat vs percentage discounts
- `discount_value` — original input for audit
- `discount` — computed flat amount for financial aggregation

All discount data flows from `cart_items` → `order_items` at checkout, preserving the full audit chain.
