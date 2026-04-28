# NEXUS BHUTAN POS Terminal — Architecture & Developer Reference

> Offline-first GST-compliant POS system for Bhutan.  
> **Stack**: Next.js 16 (App Router) · React 19 · PocketBase 0.37 · TanStack Query · Zustand · @base-ui/react · Tailwind v4

---

## Table of Contents

1. [Directory Structure](#1-directory-structure)
2. [Architecture Overview](#2-architecture-overview)
3. [Data Flow](#3-data-flow)
4. [State Management](#4-state-management)
5. [PocketBase Schema](#5-pocketbase-schema)
6. [API & Hooks Reference](#6-api--hooks-reference)
7. [Component Reference](#7-component-reference)
8. [Conventions](#8-conventions)
9. [External Dependencies](#9-external-dependencies)
10. [Keyboard Shortcuts](#10-keyboard-shortcuts)
11. [Running & Build Commands](#11-running--build-commands)

---

## 1. Directory Structure

```
pos-terminal/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (QueryProvider, Toaster)
│   ├── page.tsx                  # POS main screen (/)
│   ├── login/page.tsx            # Login page
│   ├── orders/page.tsx           # Order management
│   ├── inventory/page.tsx        # Inventory management
│   ├── customers/page.tsx        # Khata customer management
│   └── settings/page.tsx         # Store settings & config
├── components/
│   ├── pos/                      # POS business components
│   │   ├── product-grid.tsx      # Product browser with filters
│   │   ├── cart-panel.tsx        # Cart sidebar
│   │   ├── cart-item-row.tsx     # Single cart line item
│   │   ├── cart-totals.tsx       # Cart footer with checkout
│   │   ├── barcode-scanner.tsx   # Camera-based QR/barcode scanner
│   │   ├── payment-modal.tsx     # Payment method & tendering
│   │   ├── customer-modal.tsx    # Customer select/create
│   │   ├── receipt-modal.tsx     # Post-checkout receipt
│   │   ├── shift-modal.tsx       # Open/close shift dialog
│   │   ├── z-report-modal.tsx    # End-of-day Z-report
│   │   ├── held-carts-modal.tsx  # Parked/saved carts
│   │   ├── help-overlay.tsx      # Keyboard shortcuts reference
│   │   └── product-image.tsx     # Product thumbnail renderer
│   └── ui/                       # shadcn/@base-ui primitives
│       ├── button.tsx, input.tsx, dialog.tsx, badge.tsx
│       ├── card.tsx, table.tsx, label.tsx, separator.tsx
│       ├── select.tsx, avatar.tsx, progress.tsx, sonner.tsx
│       └── numpad.tsx            # Numeric keypad (0-9, backspace, confirm)
├── hooks/                        # Business logic hooks
│   ├── use-auth.ts               # PocketBase authentication
│   ├── use-cart.ts               # Active cart + cart_items CRUD
│   ├── use-checkout.ts           # Order confirmation orchestration
│   ├── use-customers.ts          # Khata customer accounts CRUD
│   ├── use-favorites.ts          # Product favorites (→ zustand)
│   ├── use-held-carts.ts         # Held/parked carts (→ zustand)
│   ├── use-keyboard-registry.ts  # Global shortcut registry (modal > cart > global)
│   ├── use-layout-preset.ts      # Layout preset (→ zustand)
│   ├── use-orders.ts             # Order list, cancel, refund
│   ├── use-platform.ts           # Electron vs web detection
│   ├── use-pos-context.tsx       # React Context provider (legacy, unused)
│   ├── use-pos-shortcuts.ts      # All F-key shortcuts registration
│   ├── use-products.ts           # Products + categories + realtime
│   ├── use-settings.ts           # Store settings
│   ├── use-shifts.ts             # Shift open/close/Z-report
│   └── use-undo.ts               # Undo action stack (→ zustand)
├── lib/                          # Utility modules
│   ├── constants.ts              # All enums, magic strings, config values
│   ├── date-utils.ts             # Date formatting (PB format: "YYYY-MM-DD HH:mm:ss.SSSZ")
│   ├── gst.ts                    # GST calculation, order signature, currency formatting
│   ├── pb-client.ts              # PocketBase client singleton + auth helpers
│   ├── print-utils.ts            # Browser/thermal print utilities
│   ├── query-client.ts           # TanStack Query client factory
│   ├── types.ts                  # Re-exports all major types
│   └── utils.ts                  # cn() — Tailwind class merge
├── stores/
│   └── pos-store.ts              # Zustand store (filters, preferences, held carts, undo)
├── providers/
│   └── query-provider.tsx        # TanStack Query provider wrapper
├── pb/
│   ├── pocketbase                # PocketBase 0.37.3 embedded binary
│   └── pb_migrations/            # PocketBase migration files
├── electron/                     # Electron main process & preload
├── public/                       # Static assets
├── setup-pb.js                   # PocketBase schema setup script
├── package.json
├── tsconfig.json
└── next.config.mjs
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser / Electron                           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ app/     │  │components│  │  hooks/  │  │  stores/         │   │
│  │ (pages)  │◄─┤ (UI)     │◄─┤(business)│──┤ (zustand)        │   │
│  └────┬─────┘  └──────────┘  └────┬─────┘  └──────────────────┘   │
│       │                           │                                 │
│       │              ┌────────────▼──────────┐                      │
│       │              │  TanStack Query Cache │  Server State        │
│       │              │  ┌─────────────────┐  │                      │
│       │              │  │ cart, products,  │  │                      │
│       │              │  │ orders, shifts,  │  │                      │
│       │              │  │ customers,       │  │                      │
│       │              │  │ settings         │  │                      │
│       │              │  └────────┬────────┘  │                      │
│       │              └───────────┼───────────┘                      │
│       │                          │                                  │
│       │              ┌───────────▼───────────┐                      │
│       │              │   lib/pb-client.ts    │                      │
│       │              │   (PocketBase SDK)    │                      │
│       │              └───────────┬───────────┘                      │
└───────┼──────────────────────────┼──────────────────────────────────┘
        │                          │
        │              ┌───────────▼───────────┐
        │              │  PocketBase Server    │
        │              │  (localhost:8090)     │
        │              │  Embedded SQLite DB   │
        │              └───────────────────────┘
```

**Two sources of truth:**

| Source | What It Holds | Library |
|--------|--------------|---------|
| **Server state** | PocketBase data (products, cart items, orders, shifts, customers, settings) | TanStack Query |
| **Client state** | UI filters, favorites, layout preset, tax exempt, held carts, undo stack, modals | Zustand |

No data is duplicated between them. Components call hooks directly — there is no intermediary context provider. Each hook independently manages its own TanStack Query cache or zustand subscription, eliminating cascade re-renders.

---

## 3. Data Flow

### Primary Flow: Click Product → Cart → Checkout → Receipt

```
1. User clicks product in ProductGrid
   → handleAddProduct(product)
   → useCart.addItem(product)                    [TanStack Query mutation]
   
2. addItem
   → Check if product already in cart (React Query cache)
   → If exists: UPDATE cart_item (increment qty, recalc GST)
   → If new:   CREATE cart_item (qty=1, calcItemTotals)
   → onSuccess: invalidateQueries(["cart-items", cartId]) → refetch

3. Cart UI re-renders with updated items
   → calcCartTotals() computes subtotal, GST, grand total

4. User presses F5 or clicks Checkout
   → handleCheckout():
      ├── Check activeShift exists (block + prompt if not)
      ├── validateStock() — verify stock for all items
      └── setShowPayment(true) → PaymentModal opens

5. User selects payment method & confirms
   → confirmPayment(method, ref, tendered):
      ├── generateOrderNo("POS-YYYYMMDD-NNNN")
      ├── generateOrderSignature() (SHA-256)
      ├── CREATE order record
      ├── For each item:
      │   ├── UPDATE product.current_stock (decrement)
      │   └── CREATE inventory_movement (SALE)
      ├── If credit: UPDATE khata_account, CREATE khata_transaction
      ├── clearCart() → DELETE cart_items, mark cart ABANDONED
      └── refreshProducts() → invalidate queries

6. ReceiptModal shows formatted order receipt
   → Auto-closes after 8s
```

### Shift Flow

```
Open Shift:  shift-modal → handleShiftAction → useShifts.openShift(userId, float)
Close Shift: shift-modal → handleShiftAction → useShifts.closeShift(id, userId, count)
             └── Aggregates CONFIRMED orders since shift.opened_at
             └── Calculates expected = opening_float + cashSales - refundTotal
             └── Calculates discrepancy = closingCount - expected

Z-Report:    z-report-modal → useShifts.getZReport(date)
             └── Queries CONFIRMED/CANCELLED/REFUNDED orders for date
```

### Scan Flow

```
User clicks Scan → BarcodeScanner opens → Camera captures barcode
  → onScan(barcode) → useProducts.findByBarcode(barcode)
  → If found → useCart.addItem(product)
```

---

## 4. State Management

### TanStack Query (Server State)

**QueryClient config:**
- `staleTime: 30s` (most queries)
- `retry: 1`
- `refetchOnWindowFocus: false`

**Query keys and what they fetch:**

| Query Key | Hook | PocketBase Collection |
|-----------|------|----------------------|
| `["cart"]` | useCart | `carts` (status=ACTIVE) |
| `["cart-items", cartId]` | useCart | `cart_items` (filter by cart) |
| `["products"]` | useProducts | `products` (is_active=true, expand category) |
| `["categories"]` | useProducts | `categories` |
| `["customers"]` | useCustomers | `khata_accounts` |
| `["settings"]` | useSettings | `settings` |
| `["orders", filter]` | useOrders | `orders` (filtered) |
| `["shifts", "active"]` | useShifts | `shifts` (status=active) |
| `["shifts", "history"]` | useShifts | `shifts` (status=closed) |

**Mutation pattern:** `mutationFn` → `onSuccess: invalidateQueries()`. No optimistic updates (local PocketBase response is fast enough).

### Zustand (Client State)

**Store:** `usePosStore` — single store with partial persistence.

| Slice | Fields | Persisted? |
|-------|--------|------------|
| Product Filters | `searchQuery`, `selectedCategory`, `selectedLetter`, `stockFilter`, `priceMin`, `priceMax`, `sortField`, `sortOrder` | No |
| Preferences | `layoutPreset`, `favorites`, `taxExempt` | Yes |
| UI | `activeModal` | No |
| Undo Stack | `undoStack` (max 20) | No |
| Held Carts | `heldCarts` (max 10) | Yes |

**Persistence key:** `nexus_pos_layout` (from `LS_KEYS.LAYOUT`)

---

## 5. PocketBase Schema

### Collection Overview

| Collection | Type | Key Fields |
|------------|------|------------|
| `users` | auth | email, password, name, `role` (owner/manager/cashier) |
| `entities` | base | name, tpn_gstin, shop_slug, is_active |
| `categories` | base | name, color |
| `products` | base | name, sku, barcode, mrp, sale_price, current_stock, is_active; `category` → categories |
| `khata_accounts` | base | debtor_name, debtor_phone, credit_limit, outstanding_balance |
| `carts` | base | status (ACTIVE/CONVERTED/ABANDONED), customer_whatsapp |
| `cart_items` | base | `cart` → carts, `product` → products; name, qty, unit_price, discount, gst_5, total |
| `orders` | base | order_no, status, items (json), subtotal, gst_total, grand_total, payment_method, digital_signature |
| `inventory_movements` | base | `product` → products, movement_type, quantity, `reference_id` → orders |
| `khata_transactions` | base | `khata_account` → khata_accounts, transaction_type (DEBIT/CREDIT), amount |
| `settings` | base | store_name, tpn_gstin, gst_rate, receipt_header/footer |
| `shifts` | base | `opened_by` → users, opening_float, status (active/closed), cash_sales, digital_sales, credit_sales |

**Access rules:** All collections use `@request.auth.id != ''` for list/view/create/update/delete.

**Seed data** (from setup-pb.js): Default admin user, 1 entity, 8 categories, 41 products, 3 demo khata accounts, 1 settings record.

### Database Seeding

The `setup-pb.js` script creates/updates the PocketBase schema. It:
1. Authenticates as superuser
2. Adds fields to existing collections (skips if already present)
3. Updates field properties if changed (e.g., `required: true → false`)
4. Sets access rules on all collections
5. Seeds a default admin user (`admin@pos.local / admin12345`)

Run: `npm run pb:setup`

---

## 6. API & Hooks Reference

### `useCart()`

Returns:
```ts
{
  cart: Cart | null          // Active cart record
  items: CartItem[]          // Cart items (with product expand)
  loading: boolean           // isFetching status
  subtotal: number           // Sum of item prices
  discountTotal: number      // Sum of all discounts
  taxableSubtotal: number    // Subtotal - discount
  gstTotal: number           // Total GST amount
  grandTotal: number         // Taxable + GST
  taxExempt: boolean         // GST exemption toggle (from zustand)
  setTaxExempt: (v: boolean) => void
  subtotalExTax: number      // Subtotal (no GST)
  gstTotalExempt: number     // 0 when exempt
  grandTotalExempt: number   // Subtotal when exempt
  addItem(product): Promise<OpResult>
  updateQty(itemId, qty): Promise<OpResult>
  applyDiscount(itemId, discountPerUnit): Promise<OpResult>
  overridePrice(itemId, newUnitPrice): Promise<OpResult>
  removeItem(itemId): Promise<OpResult>
  clearCart(): Promise<OpResult>
  setCustomer(customerId | null): Promise<OpResult>
  refresh(): void
}
```

### `useProducts()`

Returns:
```ts
{
  products: Product[]          // Filtered & sorted products
  allProducts: Product[]       // Unfiltered products
  categories: Category[]
  loading: boolean
  searchQuery, setSearchQuery
  selectedCategory, setSelectedCategory
  selectedLetter, setSelectedLetter
  availableLetters: string[]
  stockFilter, setStockFilter
  priceMin/Max, setPriceMin/Max
  sortField, setSortField
  sortOrder, setSortOrder
  findByBarcode(barcode): Promise<Product | null>
  findById(id): Promise<Product | null>
  createProduct(data): Promise<OpResult>
  updateProduct(id, data): Promise<OpResult>
  refresh(): void
  lowStockCount: number
  outOfStockCount: number
}
```

### `useCheckout(input)`

Input type: `{ pb, user, items, products, subtotal, gstTotal, grandTotal, taxExempt, grandTotalExempt, settings, selectedCustomer, clearCart, refreshProducts, clearUndoStack }`

Returns:
```ts
{
  validateStock(): boolean
  confirmPayment(method, ref, tendered?, onSuccess?): Promise<void>
}
```

### `useShifts()`

Returns:
```ts
{
  activeShift: Shift | null
  shiftHistory: Shift[]
  loading: boolean
  openShift(userId, openingFloat): Promise<OpResult & { shift? }>
  closeShift(shiftId, userId, closingCount): Promise<OpResult>
  getZReport(date?): Promise<ZReport | null>
  refresh(): void
}
```

### `useOrders()`

Returns:
```ts
{
  orders: Order[]
  loading: boolean
  filter: string               // "all" | "today" | "confirmed" | "cancelled" | "refunded"
  setFilter: (v: string) => void
  createOrder(data): Promise<OpResult & { order? }>
  cancelOrder(orderId, reason): Promise<OpResult>
  refundOrder(orderId, refundItems[], reason): Promise<OpResult>
  refresh(): void
}
```

### `useCustomers()`

Returns:
```ts
{
  customers: Customer[]
  loading: boolean
  createCustomer(data): Promise<OpResult & { record? }>
  updateCustomer(id, data): Promise<OpResult>
  recordRepayment(customerId, amount, method, notes?): Promise<OpResult>
  refresh(): void
}
```

### `useSettings()`

Returns:
```ts
{
  settings: Settings | null
  loading: boolean
  updateSettings(data): Promise<OpResult>
  refresh(): void
}
```

### `useAuth()`

Returns:
```ts
{
  user: PBUser | null
  loading: boolean
  login(email, password): Promise<{ success, error? }>
  signOut(): void
  hasRole(roles[]): boolean
  isOwner: boolean
  isManager: boolean
  isCashier: boolean
  isAuthenticated: boolean
}
```

### Zustand Store — `usePosStore()`

Usage: `const searchQuery = usePosStore(s => s.searchQuery)`

Selectors subscribe to individual fields — no context re-renders.

**Actions available:** `setLayout`, `toggleFavorite`, `isFavorite`, `clearFavorites`, `setTaxExempt`, `setActiveModal`, `pushUndo`, `undoAction`, `clearUndoStack`, `holdCart`, `recallCart`, `discardHeld`, `loadHeld`, plus all filter setters.

---

## 7. Component Reference

### POS Components

| Component | Props | Purpose |
|-----------|-------|---------|
| `ProductGrid` | `onAddProduct`, `onScan`, `highlightedIndex`, `setHighlightedIndex` | Full product browser: search, category tabs, A-Z filter, advanced filters (stock, price, sort), grid/list view, favorites |
| `CartPanel` | `customer`, `isManager`, `onCheckout`, `onSelectCustomer`, `noShift` | Cart sidebar with clear button, customer selector, item rows, totals |
| `CartItemRow` | `item`, `isManager`, `onUpdateQty`, `onRemove`, `onApplyDiscount`, `onOverridePrice` | Single cart line: qty +/- with numpad, discount, price override (manager) |
| `CartTotals` | `subtotal`, `discountTotal`, `taxableSubtotal`, `gstTotal`, `grandTotal`, `taxExempt`, `setTaxExempt`, `grandTotalExempt`, `loading`, `hasItems`, `onCheckout`, `noShift` | Footer: GST breakdown, tax exempt toggle, checkout button |
| `BarcodeScanner` | `open`, `onClose`, `onScan` | Camera-based barcode/QR scanner |
| `PaymentModal` | `open`, `onClose`, `grandTotal`, `customer`, `onConfirm` | Payment: cash (denominations), digital (mBoB/mPay/RTGS), credit (limit check) |
| `CustomerModal` | `open`, `onClose`, `customers`, `selectedCustomer`, `onSelect`, `onCreate` | Customer search/select + inline create |
| `ReceiptModal` | `open`, `onClose`, `onNewSale`, `order`, `settings` | Receipt display, thermal print (Electron), browser print |
| `ShiftModal` | `open`, `onClose`, `mode`, `onConfirm` | Open/close shift amount input |
| `ZReportModal` | `open`, `onClose` | End-of-day sales report |
| `HeldCartsModal` | `open`, `onClose`, `heldCarts`, `onRecall`, `onDiscard` | Saved/held carts list |
| `HelpOverlay` | `open`, `onClose` | Keyboard shortcut reference |
| `ProductImage` | `product`, `category?`, `className?` | Product thumbnail or color initials |

### UI Primitives (shadcn/@base-ui)

All components are in `components/ui/`. They use `@base-ui/react` primitives (Button, Input, Dialog, Select, Avatar, Progress) with Tailwind styling and CVA variants. Import via `@/components/ui/button`, etc.

---

## 8. Conventions

### Code Style
- **Language:** TypeScript (strict mode, `.ts` / `.tsx`)
- **Imports:** Path alias `@/` mapped to project root
- **Components:** `"use client"` directive where needed (all interactive components)
- **Naming:** PascalCase components, camelCase functions/variables, UPPER_SNAKE_CASE constants
- **No comments unless necessary** — code should be self-documenting
- **Tailwind classes:** Use `cn()` utility for conditional/merged classes

### Date Handling
**Always use `pbNow()` or `pbDate()` from `lib/date-utils.ts`** when sending date values to PocketBase.

PocketBase expects the format: `"YYYY-MM-DD HH:mm:ss.SSSZ"` (space separator, not ISO 8601 T-separator).

```ts
import { pbNow } from "@/lib/date-utils";

// ✅ Correct
await pb.collection("shifts").create({
    opened_at: pbNow(),  // "2026-04-27 12:34:56.789Z"
});

// ❌ Wrong
await pb.collection("shifts").create({
    opened_at: new Date().toISOString(),  // "2026-04-27T12:34:56.789Z"
});
```

### PocketBase Requests
Use `PB_REQ = { requestKey: null }` as the second argument to `getFullList`, `create`, `update`, `delete` to disable request auto-cancellation:

```ts
import { PB_REQ } from "@/lib/constants";
// or import { getPB, PB_REQ } from "@/lib/pb-client";

const records = await pb.collection("products").getFullList({ requestKey: null });
const record = await pb.collection("orders").create(data, PB_REQ);
await pb.collection("cart_items").update(id, changes, PB_REQ);
```

### State Management
- **Server data** (PocketBase) → TanStack Query hooks (`useQuery`, `useMutation`)
- **Client-only data** (UI state, preferences) → Zustand (`usePosStore`)
- **Never mix** server state into zustand or client state into TanStack Query

### Mutation Pattern
```ts
useMutation({
    mutationFn: async (input) => {
        // 1. Do the server operation
        return pb.collection("collection").create(data, PB_REQ);
    },
    onSuccess: () => {
        // 2. Invalidate related queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: ["key"] });
    },
});
```

### Component Props
Components receive data as props, not from context. They call hooks at the page level and pass down as props, or call hooks directly in leaf components for fine-grained subscriptions.

---

## 9. External Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.2.2 | React framework, App Router, static export |
| react / react-dom | 19.2.4 | UI library |
| pocketbase | 0.26.8 | PocketBase JS SDK — auth, CRUD, realtime |
| @tanstack/react-query | 5.17.0 | Server state management |
| zustand | 4.4.7 | Client-side state store |
| @base-ui/react | 1.3.0 | Headless UI primitives |
| lucide-react | 1.7.0 | Icon library |
| sonner | 2.0.7 | Toast notifications |
| shadcn | 4.1.2 | Design system / component theming |
| tailwindcss | 4 | CSS framework |
| tailwind-merge | 3.5.0 | Class merging (`cn()` utility) |
| class-variance-authority | 0.7.1 | Component variant management |
| clsx | 2.1.1 | Class name concatenation |
| next-themes | 0.4.6 | Dark/light mode |
| framer-motion | 11.0.0 | Animation library |
| html5-qrcode | 2.3.8 | Browser barcode/QR scanner |
| html2canvas | 1.4.1 | HTML-to-image capture |
| jspdf | 4.2.1 | PDF generation |
| escpos | 3.0.0-alpha.6 | Thermal printer commands |
| onnxruntime-web | 1.18.0 | Edge AI runtime |
| pouchdb / pouchdb-browser | 8.0.1 | Offline-first local database |
| zod | 3.22.4 | Schema validation |

---

## 10. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | Help overlay |
| F2 | New transaction (clear cart) |
| F3 | Hold/park current cart |
| F4 | Show held carts |
| F5 | Checkout |
| F6 | Print receipt |
| F7 | Void last item |
| F9 | Focus search input |
| F10 | Discount entry |
| F11 | Toggle fullscreen |
| Escape | Close modal / clear search |
| Tab | Toggle cart visibility |
| Ctrl+Z | Undo |
| Ctrl+C | Compact layout |
| Ctrl+S | Standard layout |
| Delete | Remove last item |
| **In Product Grid:** |
| ↑ ↓ ← → | Navigate products |
| Enter | Add highlighted product |
| Letters A-Z | Append to search query |
| Backspace | Remove last search character |

---

## 11. Running & Build Commands

```bash
# Development
npm run dev                    # Next.js dev server on port 3000

# PocketBase
npm run pb:serve              # Start PocketBase on port 8090
npm run pb:setup              # Initialize/update schema & seed data

# Build
npm run build                 # Production build (static export)

# Electron
npm run electron:dev          # Next.js + Electron in dev mode
npm run electron:build        # Build distributable Electron app

# Testing
npm test                      # Run vitest
npm run test:e2e              # Run Playwright e2e tests

# Linting
npm run lint                  # ESLint
```

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PB_URL` | `http://127.0.0.1:8090` | PocketBase server URL |
| `NEXT_PUBLIC_PB_URL` | `http://127.0.0.1:8090` | PocketBase URL exposed to client |

### PocketBase Admin

- URL: `http://127.0.0.1:8090/_/`
- Superuser: `admin@pos.local` / `admin12345`
