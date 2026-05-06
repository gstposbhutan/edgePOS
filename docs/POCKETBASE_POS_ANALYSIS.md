# PocketBase Offline POS — Architecture Analysis & Implementation Plan

**Branch**: `feat/pocketbase-offline-pos`  
**Date**: 2026-04-26  
**Scope**: Focused offline-first POS terminal replacing the Supabase-dependent architecture.

---

## 1. Executive Summary

We are pivoting the POS terminal to a **focused, offline-first architecture** using **PocketBase** as the backend. Instead of the sprawling multi-pillar ecosystem (WhatsApp marketplace, taxi dispatch, accounting SaaS), this branch builds a **single-store POS that works without internet** and optionally syncs to a central PocketBase when online.

**Key Principle**: The POS must be usable in a rural Bhutanese shop with zero connectivity. Internet is a luxury, not a requirement.

---

## 2. Why PocketBase?

| Requirement | How PocketBase Delivers |
|-------------|------------------------|
| **Single binary backend** | One `pocketbase` executable (Go, ~20MB) — no Docker, no Postgres setup |
| **Built-in SQLite database** | Local ACID transactions, zero config, survives crashes |
| **Built-in auth** | User management, login sessions, role fields — no Clerk/Supabase Auth needed |
| **Built-in file storage** | Product images, receipt PDFs stored locally with S3-compatible API |
| **Real-time subscriptions** | Live UI updates for stock changes, order status |
| **Admin UI** | `/_/admin` gives store owners a raw data view without building dashboards |
| **JS SDK** | Works in browser — `pb.collection('products').subscribe('*', ...)` |
| **Extensible via Go hooks** | Business rules (stock deduction, GST calc) in Go backend hooks |
| **Sync-capable** | Two PocketBase instances can exchange data via REST API |

---

## 3. Architecture

### 3.1 Local-First Model

```
┌─────────────────────────────────────────┐
│         POS TERMINAL (Next.js)          │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  React UI   │◄─┤  PocketBase JS  │   │
│  │  (browser)  │  │  SDK (localhost)│   │
│  └─────────────┘  └─────────────────┘   │
│         ▲                    │          │
│         │     HTTP/WebSocket │          │
│         └────────────────────┘          │
└─────────────────────────────────────────┘
                   │
           ┌───────▼────────┐
           │ PocketBase     │
           │ (localhost:8090)│
           │  - SQLite DB   │
           │  - File storage│
           │  - Auth        │
           │  - Go hooks    │
           └───────┬────────┘
                   │
         ┌─────────▼──────────┐
         │  Optional: Online  │
         │  sync to central   │
         │  PocketBase server │
         └────────────────────┘
```

### 3.2 Deployment Modes

| Mode | Setup | Use Case |
|------|-------|----------|
| **Standalone** | Run `pocketbase serve` on the POS machine, open `http://localhost:8090` | Single terminal, no internet |
| **Desktop App** | Bundle PocketBase + Next.js in Electron/Tauri (future) | Dedicated POS hardware |
| **LAN Hub** | One PocketBase on a shop PC, tablets connect via local WiFi | Multi-terminal shop |

### 3.3 Offline Strategy

- **No connectivity gate**. The app assumes PocketBase on localhost is always available.
- **All reads/writes** hit local PocketBase. Sub-10ms response time.
- **Sync is background**: When a central server URL is configured, a background worker pushes local transactions and pulls product catalog updates. If the server is unreachable, sync pauses gracefully.
- **Conflict resolution**: Last Write Wins for product metadata. Manual flag for financial transactions.

---

## 4. Data Model (PocketBase Collections)

Simplified from the Supabase schema. PocketBase uses collections instead of tables.

### `users` (built-in, extended)
PocketBase already has a `users` collection. We extend it:

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Display name |
| `role` | select | `owner`, `manager`, `cashier` |
| `avatar` | file | Profile photo |

### `settings` (store profile)
Single-row collection for store configuration.

| Field | Type | Notes |
|-------|------|-------|
| `store_name` | text | Shop name on receipts |
| `store_address` | text | Multi-line address |
| `tpn_gstin` | text | Bhutan Taxpayer Number |
| `phone` | text | Contact number |
| `receipt_header` | text | Custom header text |
| `receipt_footer` | text | Custom footer text |
| `gst_rate` | number | Default 5% |

### `products`

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Product name |
| `sku` | text | Internal code |
| `barcode` | text | EAN/UPC for scanner |
| `qr_code` | text | Custom QR identifier |
| `hsn_code` | text | GST category code |
| `unit` | text | pcs, kg, ltr, etc. |
| `mrp` | number | Maximum retail price |
| `cost_price` | number | Purchase price |
| `sale_price` | number | Selling price (can differ from MRP) |
| `current_stock` | number | Real-time stock level |
| `reorder_point` | number | Alert threshold |
| `image` | file | Product photo |
| `is_active` | bool | Show in POS grid |
| `category` | relation | → `categories` |

### `categories`

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Category name |
| `color` | text | UI color hint |

### `customers` (optional, for khata/credit)

| Field | Type | Notes |
|-------|------|-------|
| `name` | text | Customer name |
| `phone` | text | WhatsApp/phone number |
| `credit_limit` | number | Max credit allowed |
| `credit_balance` | number | Current outstanding |

### `carts` (active session)

| Field | Type | Notes |
|-------|------|-------|
| `status` | select | `active`, `converted`, `abandoned` |
| `customer` | relation | → `customers` (optional) |
| `created_by` | relation | → `users` (cashier) |

### `cart_items`

| Field | Type | Notes |
|-------|------|-------|
| `cart` | relation | → `carts` |
| `product` | relation | → `products` |
| `name` | text | Snapshot of product name |
| `quantity` | number | Qty in cart |
| `unit_price` | number | Price at time of add |
| `discount` | number | Per-unit discount |
| `gst_amount` | number | Computed GST |
| `total` | number | Line total |

### `orders` (confirmed transactions)

| Field | Type | Notes |
|-------|------|-------|
| `order_no` | text | Human-readable: `POS-2026-00001` |
| `status` | select | `confirmed`, `cancelled`, `refunded` |
| `items` | json | Immutable snapshot of line items |
| `subtotal` | number | Before GST |
| `gst_total` | number | Total GST |
| `grand_total` | number | Final amount |
| `payment_method` | select | `cash`, `mbob`, `mpay`, `credit`, `rtgs` |
| `payment_ref` | text | Transaction ID / journal no |
| `customer` | relation | → `customers` |
| `customer_name` | text | Snapshot |
| `customer_phone` | text | Snapshot |
| `cashier` | relation | → `users` |
| `digital_signature` | text | SHA-256 hash |
| `receipt_pdf` | file | Generated PDF |

### `inventory_movements`

| Field | Type | Notes |
|-------|------|-------|
| `product` | relation | → `products` |
| `type` | select | `sale`, `restock`, `adjustment`, `return` |
| `quantity` | number | Positive or negative |
| `order` | relation | → `orders` (for sales) |
| `notes` | text | Reason |

### `khata_transactions` (credit ledger)

| Field | Type | Notes |
|-------|------|-------|
| `customer` | relation | → `customers` |
| `type` | select | `debit` (purchase), `credit` (repayment), `adjustment` |
| `amount` | number | |
| `order` | relation | → `orders` (for debits) |
| `notes` | text | |

---

## 5. Full POS Business Flow

### 5.1 Authentication
1. Cashier opens POS URL (`http://localhost:8090` or deployed app)
2. Login screen → PocketBase `authWithPassword()`
3. JWT token stored in memory/localStorage
4. Role (`owner`/`manager`/`cashier`) determines UI capabilities

### 5.2 Product Selection (3 Methods)

**A. Grid Browse**
- Products displayed in category-filtered grid
- Active products only (`is_active = true`)
- Stock shown as badge (red if `current_stock <= reorder_point`)

**B. Search / Type-to-Filter**
- Real-time filter on `name`, `sku`, `barcode`
- Desktop: type → arrow keys → Enter to add
- Mobile: tap search bar, type, tap result

**C. Barcode / QR Scan**
- Click "Scan" button → camera modal opens
- Uses `html5-qrcode` library (browser-based, no native app needed)
- Scans EAN-13, UPC-A, QR codes
- On match: auto-add product to cart
- On no match: prompt to create product or manual entry

### 5.3 Cart Management
- Add product → increment qty if already in cart
- Quantity stepper (+/-) or keyboard input
- **Discount**: per-unit discount (role-gated: manager/owner only)
- **Price override**: change unit price (manager/owner only)
- **Remove**: swipe or delete button
- **Clear cart**: abandon current cart, start fresh

### 5.4 Customer Identification
- Optional: attach customer to cart
- Search existing customers by name/phone
- Create new customer on-the-fly
- For credit (`khata`) sales: customer is **mandatory**

### 5.5 Payment

| Method | Flow |
|--------|------|
| **Cash** | Enter amount tendered → auto-calculate change → print receipt |
| **mBoB / mPay** | Cashier confirms payment received on their own phone → enter reference number → optional: snap screenshot for OCR verification |
| **Credit / Khata** | Hard-block if customer has no khata account or exceeds credit limit. Owner can override. |
| **RTGS** | Enter bank reference number |

### 5.6 Checkout (Confirm Order)
1. Validate stock for all items
2. Validate customer (if credit payment)
3. Create `order` record with immutable `items` JSON snapshot
4. Deduct stock → create `inventory_movement` rows (SALE)
5. If credit: create `khata_transaction` (DEBIT), update `customer.credit_balance`
6. Generate `digital_signature` = SHA-256(`order_no` + `grand_total` + `tpn_gstin` + `timestamp`)
7. Generate receipt PDF (jsPDF)
8. Print receipt (browser print dialog for now; ESC/POS later)
9. Clear cart → new active cart ready

### 5.7 Post-Sale Operations

**Refund** (same day, before Z-close)
- Find order → "Refund" → select items/qty → reason
- Creates `inventory_movement` (RETURN) restoring stock
- If credit: creates `khata_transaction` (CREDIT)
- Generates refund receipt

**Cancel**
- Before payment: simply clear cart
- After confirm: owner/manager only → restore stock → mark order `cancelled`

### 5.8 End-of-Day (Z-Report)
- Aggregates all orders for the day
- Breakdown by payment method
- Total GST collected
- Total refunds
- Cash discrepancy check (expected vs actual)
- Export to CSV/PDF

### 5.9 Inventory Management
- View all products with stock levels
- Low-stock / out-of-stock filtering
- Manual adjustment: restock, loss, damaged → with reason
- Movement history per product

---

## 6. Barcode & QR Scanning Strategy

### Technology: `html5-qrcode`
- Pure JavaScript, no backend required
- Supports camera selection (front/back)
- Formats: QR Code, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39
- Works in all modern browsers

### UX Flow
```
Click "Scan Barcode" in POS header
  → Camera modal opens (request permission on first use)
  → Live camera feed with red scan line overlay
  → On successful decode:
      → Lookup product by barcode field
      → If found: flash green, auto-add to cart, close modal
      → If not found: flash amber, show "Create Product?" with barcode pre-filled
  → "Cancel" button or click outside to close
```

### Product Barcode Assignment
- Each product has `barcode` (string) and `qr_code` (string)
- Can be auto-generated (Code 128 from SKU) or scanned from physical packaging
- Unique index on `barcode` within the collection

---

## 7. Offline-First Implementation

### 7.1 Local PocketBase = Always Available
Since PocketBase runs on the same machine (localhost), **the POS never loses database access**. The only dependency is the machine being powered on.

### 7.2 Optional Central Sync
For multi-store or backup scenarios:

```
Local POS PocketBase          Central Server PocketBase
        │                               ▲
        │  POST /api/sync/orders        │
        │  POST /api/sync/movements     │
        │  GET  /api/sync/products      │
        └───────────────────────────────┘
        (when internet is available)
```

- **Push**: New orders, inventory movements, customers → central
- **Pull**: Product catalog updates, price changes, new products → local
- **Frequency**: Every 5 minutes when online, plus manual "Sync Now" button
- **Queue**: Failed syncs are retried with exponential backoff

### 7.3 What Works Offline (Everything)
- Scanning products
- Adding to cart
- Applying discounts
- Checking stock
- Recording sales
- Printing receipts
- Refunds and cancellations
- Inventory adjustments
- Credit/khata transactions
- End-of-day reports

### 7.4 What Needs Internet (Optional)
- Syncing to central server
- Sending WhatsApp receipts (future)
- Downloading software updates

---

## 8. Implementation Phases

### Phase 1 — PocketBase Backend & Foundation (Week 1)
- [ ] Download and configure PocketBase
- [ ] Define all collections (schema migration via `pb_schema.json`)
- [ ] Write Go hooks for:
  - Auto-deduct stock on order confirm
  - Auto-generate order number (`POS-YYYY-NNNNN`)
  - Compute GST on cart/order
  - Enforce credit limits on khata sales
  - Append-only order status log
- [ ] Seed sample data (categories, products, test users)
- [ ] Create `pb_schema.json` for version-controlled schema

### Phase 2 — Auth & Shell (Week 1-2)
- [ ] Replace Supabase auth with PocketBase auth
- [ ] Login page (`/login`) → `pb.collection('users').authWithPassword()`
- [ ] Role-based UI gating (owner/manager/cashier)
- [ ] Settings page (store profile, TPN/GSTIN, receipt header/footer)

### Phase 3 — Product Catalog & Barcode Scanning (Week 2)
- [ ] Product grid with category filters
- [ ] Product CRUD (owner/manager)
- [ ] Barcode scanning via `html5-qrcode`
- [ ] Auto-add scanned product to cart
- [ ] Create product from unscanned barcode flow

### Phase 4 — Cart & Checkout (Week 2-3)
- [ ] Cart hook (`useCart`) ported to PocketBase SDK
- [ ] Add/remove/update quantity
- [ ] Discount & price override (role-gated)
- [ ] Customer selection / creation
- [ ] Payment method selector
- [ ] Checkout confirm → order creation
- [ ] Stock deduction hook
- [ ] Receipt generation (jsPDF)
- [ ] Browser print dialog

### Phase 5 — Inventory & Khata (Week 3)
- [ ] Inventory list with low-stock alerts
- [ ] Manual stock adjustment (restock/loss/damaged)
- [ ] Movement history
- [ ] Customer / Khata management
- [ ] Credit limit enforcement
- [ ] Repayment recording

### Phase 6 — Orders & Reports (Week 4)
- [ ] Order list with filters
- [ ] Order detail / reprint receipt
- [ ] Refund flow
- [ ] End-of-day Z-report
- [ ] Daily sales summary

### Phase 7 — Polish & Sync (Week 4-5)
- [ ] Keyboard shortcuts (desktop)
- [ ] Touch-optimized mobile view
- [ ] Background sync to central PocketBase
- [ ] Data export (CSV)
- [ ] Backup/restore SQLite DB

---

## 9. What's Reusable from Existing Code

| Existing File | Reuse Strategy |
|---------------|---------------|
| `hooks/use-cart.js` | Logic is 90% reusable — swap Supabase calls for `pb.collection('cart_items').create/update/delete()` |
| `hooks/use-product-catalog.js` | Same — swap SDK calls, simplify (remove packages for MVP) |
| `hooks/use-inventory.js` | Reusable with SDK swap |
| `hooks/use-orders.js` | Reusable — simplify status machine |
| `components/pos/receipt.jsx` | **100% reusable** — pure presentational component |
| `components/pos/cart-panel.jsx` | **95% reusable** — only data fetching changes |
| `components/pos/product-panel.jsx` | **95% reusable** — swap data source |
| `components/pos/pos-header.jsx` | Reusable — swap auth helper |
| `app/pos/page.jsx` | Reusable — swap hooks |
| GST calc logic | **100% reusable** — `calcItemTotals()` is pure math |
| Design system (Tailwind + Shadcn) | **100% reusable** |

### What We Drop (for this focused branch)
- Supabase client and RLS policies
- Clerk integration
- WhatsApp gateway / bot
- Face-ID / YOLO vision pipeline
- Marketplace app
- Admin hub
- Taxi / logistics
- Complex package/pallet hierarchy (MVP uses single products only)
- Google Drive integration

---

## 10. File Structure (Target)

```
pos-terminal/
├── pb/                          # PocketBase backend
│   ├── pocketbase               # Binary (gitignored, documented)
│   ├── pb_hooks/                # Go hooks for business logic
│   │   ├── main.pb.js           # Stock deduction, GST calc
│   │   └── order_no.pb.js       # Auto-increment order numbers
│   ├── pb_migrations/           # Schema migrations
│   │   └── 001_initial_schema.js
│   └── pb_data/                 # SQLite DB + uploads (gitignored)
├── src/
│   ├── app/
│   │   ├── layout.jsx
│   │   ├── page.jsx             # POS main page
│   │   ├── login/page.jsx       # PocketBase auth login
│   │   ├── inventory/page.jsx   # Stock management
│   │   ├── products/page.jsx    # Product CRUD
│   │   ├── orders/page.jsx      # Order history
│   │   ├── customers/page.jsx   # Customer / Khata
│   │   └── settings/page.jsx    # Store profile
│   ├── components/
│   │   ├── pos/
│   │   │   ├── cart-panel.jsx
│   │   │   ├── product-panel.jsx
│   │   │   ├── product-grid.jsx
│   │   │   ├── barcode-scanner.jsx    # html5-qrcode wrapper
│   │   │   ├── receipt.jsx
│   │   │   ├── payment-modal.jsx
│   │   │   ├── customer-modal.jsx
│   │   │   └── z-report-modal.jsx
│   │   ├── inventory/
│   │   │   ├── stock-table.jsx
│   │   │   └── adjust-stock-modal.jsx
│   │   └── ui/                  # Shadcn components (reuse existing)
│   ├── hooks/
│   │   ├── use-pb.js            # PocketBase instance + auth state
│   │   ├── use-cart.js          # Ported to PB
│   │   ├── use-products.js      # Ported to PB
│   │   ├── use-orders.js        # Ported to PB
│   │   ├── use-inventory.js     # Ported to PB
│   │   ├── use-customers.js     # Khata / credit
│   │   └── use-settings.js      # Store profile
│   ├── lib/
│   │   ├── pb-client.js         # Singleton PocketBase instance
│   │   ├── gst.js               # GST calculation utilities
│   │   └── utils.js             # Helpers (cn, formatCurrency, etc.)
│   └── styles/
│       └── globals.css
├── public/
├── next.config.js
├── package.json
└── README.md
```

---

## 11. Tech Stack (Locked for this Branch)

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 + React 19 + JavaScript (JSDoc) |
| **Styling** | Tailwind CSS v4 + Shadcn/UI (existing design tokens) |
| **Backend** | PocketBase (Go binary, SQLite) |
| **SDK** | `pocketbase` npm package (JS SDK) |
| **Barcode** | `html5-qrcode` |
| **Receipt PDF** | `jspdf` + `html2canvas` (reuse existing) |
| **Auth** | PocketBase built-in auth |
| **State** | React hooks (no external state manager needed) |

---

## 12. Risk Assessment

| Risk | Mitigation |
|------|-----------|
| PocketBase single-file DB corruption | WAL mode enabled; daily automated backups; backup button in settings |
| No multi-user concurrent access | Single-terminal POS for MVP; LAN mode (single PB instance, multiple clients) is future |
| Data loss if machine dies | Optional cloud sync; manual "Export DB" button; scheduled backups to USB |
| Barcode library fails on low-end camera | Test on target hardware; fallback to manual SKU entry |
| GST compliance audit | Immutable order snapshots (JSON `items`); append-only movement log; SHA-256 signatures |

---

## 13. Next Steps

1. **Approve this analysis** — confirm scope and phase plan
2. **Set up PocketBase** — download binary, initialize collections
3. **Port auth** — replace Supabase with PocketBase login
4. **Port product catalog & cart** — get the core sale flow working end-to-end
5. **Add barcode scanning** — integrate `html5-qrcode`
6. **Build inventory & khata** — complete the business loop
7. **Test offline** — disconnect network, verify all operations work

---

*This document is the source of truth for the `feat/pocketbase-offline-pos` branch. All development in this branch should align with this focused scope.*
