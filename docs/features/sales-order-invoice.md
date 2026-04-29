# Feature: Sales Orders & Sales Invoices

**Feature ID**: F-SALES-001  
**Phase**: 3  
**Status**: Complete

---

## Overview

Two-step sales lifecycle separating the customer's request from the vendor's fulfilment:

- **SALES_ORDER** (`SO-YYYY-XXXXX`): Customer's request. No stock impact. Vendor reviews and fulfils via one or more invoices.
- **SALES_INVOICE** (`SI-YYYY-XXXXX`): Vendor creates against a Sales Order, picks specific batches. Stock deducted on creation. Multiple invoices per order (partial fulfilment supported).

---

## Order Status Flow

```
SALES_ORDER:   DRAFT → PARTIALLY_FULFILLED → CONFIRMED
SALES_INVOICE: (created directly at) CONFIRMED
```

---

## Creating a Sales Order (`/salesorder`)

- Keyboard-first layout matching the POS: any key opens product search
- Product search queries `product_batches` directly with `entity_id` — results are deduped by product with aggregated stock
- Customer WhatsApp phone required
- Creates `SALES_ORDER` via `POST /api/shop/orders` with `order_type = SALES_ORDER`, `status = DRAFT`
- No stock change at this point

---

## Creating a Sales Invoice (full-screen overlay)

Opened via F3 or "Create Sales Invoice" button on the SO detail page.

**Layout**: Left panel (invoice metadata + line status) + Right panel (batch assignment table) + ShortcutBar

**Per line item**:
- Batch dropdown — shows vendor's active batches for that product, FEFO order
- Qty input — caps at `batch.quantity - qty_used_by_sibling_rows`; red warning if over
- Unit price — auto-filled from `batch.selling_price`
- `+ Batch` button for split delivery across batches
- X to remove extra batch rows

**Validation**:
- Sum of sub-batch qtys must equal SO line qty for every line
- All batch selectors must be filled
- Server-side: remaining qty = SO qty − already invoiced across non-cancelled invoices

**On submit** (`POST /api/sales/[id]/invoice`):
1. `SALES_INVOICE` inserted at `CONFIRMED`
2. `deduct_stock_on_sales_invoice` trigger fires on `AFTER INSERT`
3. SALE `inventory_movements` created per line (with `batch_id`)
4. `sync_batch_quantity` decrements `product_batches.quantity`
5. `auto_deplete_batch` sets batch `status = DEPLETED` if quantity reaches 0
6. If `CREDIT`: khata account created/updated, DEBIT transaction inserted
7. SO status → `CONFIRMED` (all lines) or `PARTIALLY_FULFILLED` (some remain)

---

## Success Screen

After invoice creation the overlay transitions to a success screen showing:
- Confirmation banner with invoice number and SO fulfilment status
- Full printable invoice preview (product lines, batch numbers, GST breakdown, digital signature)
- **Download PDF** button (jsPDF + html2canvas)
- **Back to Order** button

---

## Partial Fulfilment

If the SO is `PARTIALLY_FULFILLED`, the "Create Sales Invoice" button remains on the SO detail page. The next invoice only needs to cover the remaining quantities. The server validates against already-invoiced quantities.

---

## Orders List Navigation

`/pos/orders` defaults to the **Sales** tab (Sales Orders sub-tab). Back navigation from order detail restores the correct section and tab via `?section=SALES&tab=SO` (or `SI`, `MKT`, `WA`, `POS`) query params.

---

## Payment Methods

`ONLINE`, `CASH`, `CREDIT` — legacy `MBOB`/`MPAY`/`RTGS` migrated to `ONLINE`.

---

## Database (migrations 058, 059, 062)

| Object | Description |
|--------|-------------|
| `orders.order_type` | Added `SALES_ORDER`, `SALES_INVOICE` |
| `orders.status` | Added `PARTIALLY_FULFILLED` |
| `orders.sales_order_id` | FK linking invoice → originating SO |
| `orders.invoice_ref` | Vendor's own invoice reference |
| `deduct_stock_on_sales_invoice` | AFTER INSERT OR UPDATE trigger on orders |
| `guard_stock_on_confirm` | BEFORE INSERT OR UPDATE — checks batch stock |

---

## Files

| File | Purpose |
|------|---------|
| `app/salesorder/page.jsx` | Create Sales Order page |
| `app/pos/orders/page.jsx` | Orders list (Sales tab first, breadcrumb, tab-aware back nav) |
| `app/pos/orders/[id]/page.jsx` | Order detail + full-screen invoice overlay + success/print screen |
| `app/api/sales/[id]/invoice/route.js` | POST: convert SO → SI with batch validation |
| `app/api/shop/orders/route.js` | POST: create SALES_ORDER |
