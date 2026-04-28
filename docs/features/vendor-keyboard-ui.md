# Feature: Vendor Keyboard/Desktop UI

**Feature ID**: F-KBD-002
**Phase**: 3
**Status**: Planned
**Last Updated**: 2026-04-29

---

## Overview

The existing POS and vendor-facing pages were designed touch-first for tablets. This feature adds a keyboard and non-touch monitor optimised experience for vendors who operate from a desktop workstation with a keyboard, mouse, and/or barcode scanner.

**Scope:**
- The **main POS** (`/pos`) gets two separate screens: the existing touch layout and a new keyboard/desktop layout. Vendor toggles between them per device.
- **All other vendor UI** (orders list, order detail, products, inventory, marketplace order creation) switches to a keyboard-dense design by default — no separate toggle needed.

**The customer-facing shop (`/shop/*`) is unaffected** — it stays mobile-first.

---

## POS: Two Separate Screens

The header gains a **Touch / Keyboard** toggle button. The selection is persisted in `localStorage` as `pos_layout_mode: 'touch' | 'keyboard'` per device.

| Mode | Route | Design |
|------|-------|--------|
| Touch (existing) | `app/pos/page.jsx` | Large tap targets, card grid, bottom cart |
| Keyboard (new) | `app/pos/keyboard/page.jsx` | 3-column dense layout, always-active search |

Both modes use the same hooks (`useCart`, `useProducts`, `useKhata`) and the same API layer. Only the layout and keyboard wiring differ.

---

## Keyboard POS Layout (`app/pos/keyboard/page.jsx`)

The keyboard POS has **one primary screen: the cart table**. There is no persistent product panel. Products only appear when the vendor actively searches for them via a popup modal.

### Main Screen — Cart Table

Full-width cart table occupying the entire workspace. This is what the cashier stares at all day:

```
┌─────────────────────────────────────────────────────────────────┐
│  NEXUS POS  [Store Name]  [Cashier]  [Customer: +97517XXXXXX]   │
│  ─────────────────────────────────────────────────────────────  │
│  #   Qty   Product Name          Unit Price   Discount   Total  │
│  ─────────────────────────────────────────────────────────────  │
│  1 ► [2]   Druk Milk 500ml           15.00       0.00    30.00  │
│  2   [1]   Bhutan Bread              12.00       0.00    12.00  │
│  3   [3]   Red Rice 1kg              45.00       0.00   135.00  │
│  ─────────────────────────────────────────────────────────────  │
│                               Subtotal:               168.57    │
│                               GST (5%):                 8.50    │
│                               Grand Total:           177.07    │
│                                                                  │
│  [F1 Help] [F2 New] [F3 Add Item] [F5 Pay] [F7 Void] [F9 Cust] │
└─────────────────────────────────────────────────────────────────┘
```

- **Cart row is selected** (highlighted) — `↑` / `↓` moves selection
- **Qty cell is editable** — press `Enter` on a selected row to edit qty inline; type number + `Enter` to confirm
- **`Delete`** removes the selected row
- **Status bar at bottom** shows assigned shortcut keys at all times

### Product Search — Popup Modal

Triggered by `F3`, `/`, or any printable keypress when cart is focused and no modal is open. Opens a full-screen-overlay modal:

```
┌─────────────────────────────────────────────────────┐
│  ADD PRODUCT                              [Esc close]│
│  ─────────────────────────────────────────────────  │
│  Search: [milk_____________]                         │
│  ─────────────────────────────────────────────────  │
│  #  ► Name               SKU       Stock   Price    │
│     ► Druk Milk 500ml    DM500     142     Nu. 15   │
│       Druk Milk 1L       DM1L       88     Nu. 25   │
│       Suja Milk 250ml    SM250      34     Nu. 10   │
│  ─────────────────────────────────────────────────  │
│  ↑↓ navigate   Enter add to cart   Esc close        │
│  Qty: [1__]   Unit: [1]Pcs [2]Pkt [3]Ctn           │
└─────────────────────────────────────────────────────┘
```

- Search input is **auto-focused** when modal opens
- Any keypress in the cart view that is a printable character opens this modal with the character pre-filled
- Barcode scanner: 8+ consecutive digits → skip search, exact `barcode = ?` lookup → add to cart directly without opening modal
- `↑` / `↓` navigate the results table
- **Qty and unit selected at bottom** before `Enter` adds to cart — default qty `1`, default unit = first variant
- `Enter` adds selected product + qty + unit to cart, closes modal, returns focus to cart
- `Escape` closes modal, returns focus to cart without adding anything

### Payment Modal (`F5`)

`F5` opens the payment modal overlay:

```
┌─────────────────────────────────────────────────────┐
│  PAYMENT                         Grand Total: 177.07 │
│  ─────────────────────────────────────────────────  │
│  Method: [1]CASH [2]MBOB [3]MPAY [4]RTGS [5]CREDIT  │
│                                                      │
│  (CASH selected)                                     │
│  Received:  [200.00_____]                            │
│  Nu. 10  Nu. 50  Nu. 100  Nu. 500  Nu. 1000          │
│  [E] Exact   [R] Round to Nu.5                       │
│  Change:  Nu. 22.93                                  │
│                                                      │
│  [Enter] Complete   [Esc] Cancel                     │
└─────────────────────────────────────────────────────┘
```

- `1–5` selects payment method instantly
- Denomination tiles clickable or keyboard-triggered (`Ctrl+1` through `Ctrl+5`)
- `E` sets received = grand total (exact)
- `R` rounds received up to nearest Nu. 5
- `Enter` completes when received ≥ grand total
- `Escape` cancels and returns to cart

### Full Shortcut Map

| Key | Context | Action |
|-----|---------|--------|
| Any printable char | Cart focused | Open product search modal with char pre-filled |
| `F1` | Always | Help overlay — full shortcut reference |
| `F2` | Always | New transaction (confirm if cart has items) |
| `F3` | Always | Open product search modal (empty search) |
| `F4` | Always | Assign / change customer (WhatsApp number) |
| `F5` | Cart has items | Open payment modal |
| `F6` | After completion | Print / send receipt for last transaction |
| `F7` | Cart focused | Void selected cart row |
| `F8` | Always | Open cash drawer (hardware relay — Electron only) |
| `F9` | Always | Toggle Touch / Keyboard mode |
| `F10` | Row selected | Apply discount to selected row |
| `F12` | Always | Lock terminal (Electron) / logout prompt (browser) |
| `↑` / `↓` | Cart focused | Move row selection |
| `Enter` | Row selected | Edit qty inline |
| `Enter` | Qty editing | Confirm qty |
| `Delete` | Row selected | Remove row from cart |
| `Escape` | Any modal | Close modal, return to cart |
| `Escape` | Qty editing | Cancel qty edit |
| `1–5` | Payment modal | Select payment method |
| `E` | CASH payment | Set received = exact total |
| `R` | CASH payment | Round received to nearest Nu. 5 |
| `Enter` | Payment modal | Complete transaction |

### Help Overlay (`F1`)

Semi-transparent overlay listing every shortcut. Dismissed by `F1`, `Escape`, or `Enter`. Does not block underlying cart from rendering.

---

## Keyboard Registry (`hooks/use-keyboard-registry.js`)

Priority-based dispatcher — same architecture specified in F-KBD-001:

```
Keyboard event
  → Modal shortcuts (highest priority)
  → Cart shortcuts
  → Global shortcuts (F-keys, Escape, Tab)
```

Used only in the keyboard POS layout. Not registered on touch mode or customer shop pages.

```js
export function useKeyboardRegistry() {
  // registerShortcut(layer, keyCombo, handler) → cleanup fn
  // Layers: 'modal' | 'cart' | 'global'
}
```

---

## All Other Vendor UI — Keyboard-Dense Defaults

These pages do **not** need a toggle. They are always keyboard/desktop-optimised because vendors operating at a workstation use them via mouse + keyboard, not touch.

### Design principles for keyboard-dense pages

- **Input sizes**: 32–36px height (not 44px touch targets)
- **Button sizes**: 32px height, compact padding
- **Table layouts** over card grids wherever data is list-like
- **Tab order**: logical flow through all interactive elements
- **No hover-only actions**: actions visible inline or on row hover + keyboard accessible
- **`Enter` submits** the primary action in any form or modal
- **`Escape` closes** any modal or cancels any form

### `/pos/orders` page

Replace the current card-per-order layout with a dense `<table>`:

```
Order No     Date        Customer        Status        Total      Actions
MKT-2026-001 29 Apr 2026 +97517123456   CONFIRMED     Nu. 315   [View] [Invoice]
MKT-2026-002 29 Apr 2026 +97517654321   PROCESSING    Nu. 180   [View]
```

- Arrow keys or Tab navigate rows
- `Enter` on a row opens order detail
- Filter tabs (ALL / MARKETPLACE / ACTIVE / COMPLETED) remain at top
- "New Customer Order" button: keyboard shortcut `N` when no input is focused

### `/pos/orders/[id]` page

Form-like layout. Status action buttons have clear Tab order. `Enter` on the primary action button (e.g. "Generate Invoice") submits.

### `/pos/products` page

Already table-based. Add:
- `N` shortcut to open Add Product form
- `E` on a selected row to open edit form
- Tab navigation through table rows
- Dense row height (36px vs current ~56px)

### `/pos/inventory` page

Same compact table treatment as products.

### `CreateMarketplaceOrderModal` (`components/pos/create-marketplace-order-modal.jsx`)

Form-first from the start:
- WhatsApp number input is auto-focused on modal open
- Tab order: WhatsApp → Name → Address → product search → qty → submit
- `Enter` in the last field submits the form
- Product picker is a compact searchable dropdown, not a card grid

---

## New Files

| File | Purpose |
|------|---------|
| `app/pos/keyboard/page.jsx` | Keyboard POS — cart table as main screen |
| `hooks/use-keyboard-registry.js` | Priority keyboard shortcut dispatcher (modal > cart > global) |
| `components/pos/keyboard/cart-table.jsx` | Full-width cart `<table>` with inline qty editing, row selection |
| `components/pos/keyboard/product-search-modal.jsx` | Popup overlay: search input + results table + qty/unit selector |
| `components/pos/keyboard/payment-modal.jsx` | Payment overlay: method selector + denomination tiles + change calc |
| `components/pos/keyboard/shortcut-bar.jsx` | Bottom status bar showing active F-key shortcuts |
| `components/pos/keyboard/help-overlay.jsx` | F1 full shortcut reference overlay |

## Modified Files

| File | Change |
|------|--------|
| `components/pos/pos-header.jsx` | Add Touch/Keyboard toggle button; read/write `localStorage` |
| `app/pos/orders/page.jsx` | Replace card layout with `<table>`, add Tab nav + MARKETPLACE filter |
| `app/pos/orders/[id]/page.jsx` | Compact form layout, Tab-ordered action buttons |
| `app/pos/products/page.jsx` | Add keyboard shortcuts `N` (add) and `E` (edit), denser rows |
| `app/pos/inventory/page.jsx` | Denser table rows, Tab navigation |

---

## Relationship to F-KBD-001

F-KBD-001 (Keyboard Checkout) was scoped as **Electron/desktop-shell only** and depends on F-DESKTOP-001 (Electron wrapper). It specifies the full FTS5 SQLite search, global Electron shortcuts (F12 lock terminal), and hardware cash drawer relay.

F-KBD-002 (this feature) targets the **web browser POS** and covers:
- The web-based keyboard POS layout
- All vendor management pages (orders, products, inventory)
- No Electron dependency — runs in any desktop browser

F-KBD-001 remains the spec for the future Electron shell. When the Electron wrapper is built, it will host the keyboard POS layout from F-KBD-002 and add the hardware integrations from F-KBD-001.

---

## Scope Boundaries

- **No SQLite FTS5** in this feature — uses the existing Supabase product search API (debounced, same as touch POS)
- **No hardware cash drawer** relay — Electron-only (F-KBD-001)
- **No global F12 lock** — Electron-only (F-KBD-001)
- **No customer pages modified** — `/shop/*` stays mobile-first throughout
- **No hold/recall cart** — tracked in F-KBD-001, deferred to Electron phase

---

## Implementation Checklist

### Keyboard POS core
- [ ] `hooks/use-keyboard-registry.js` — priority dispatcher (modal > cart > global)
- [ ] `components/pos/pos-header.jsx` — Touch/Keyboard toggle, `localStorage` persistence (`pos_layout_mode`)
- [ ] `app/pos/keyboard/page.jsx` — cart table as main screen, global key capture on document
- [ ] `components/pos/keyboard/cart-table.jsx` — full-width `<table>`, row selection, inline qty editing
- [ ] `components/pos/keyboard/product-search-modal.jsx` — auto-focused search input, results table, qty/unit picker at bottom, barcode detection (8+ digits)
- [ ] `components/pos/keyboard/payment-modal.jsx` — `1–5` method select, denomination tiles, `E`/`R`, change calc, Enter to complete
- [ ] `components/pos/keyboard/shortcut-bar.jsx` — bottom status bar with active F-key labels
- [ ] `components/pos/keyboard/help-overlay.jsx` — F1 full shortcut grid

### Keyboard-dense vendor pages
- [ ] `app/pos/orders/page.jsx` — `<table>` layout, Tab nav, MARKETPLACE filter, `N` shortcut for new customer order
- [ ] `app/pos/orders/[id]/page.jsx` — compact form layout, Tab-ordered action buttons
- [ ] `app/pos/products/page.jsx` — `N` (add) / `E` (edit) shortcuts, denser 36px rows
- [ ] `app/pos/inventory/page.jsx` — denser rows, Tab navigation
- [ ] `components/pos/create-marketplace-order-modal.jsx` — auto-focus WhatsApp input, Tab order, Enter submits
