# Feature: Keyboard-First Checkout

**Feature ID**: F-KBD-001
**Phase**: 2
**Status**: Scoped
**Last Updated**: 2026-04-19

---

## Overview

Desktop-only keyboard-driven checkout flow for the POS terminal. The PWA (tablet/mobile) remains touch-first. This feature targets high-traffic retail counters where cashiers operate a keyboard and numpad for speed, never reaching for a mouse.

The entire checkout cycle -- search, unit selection, quantity, payment, and receipt -- is completable via keyboard alone. All shortcuts are discoverable through the F1 help overlay.

**Dependencies**: F-DESKTOP-001 (Electron shell required for global key capture outside browser focus)

---

## Scope and Constraints

- **Desktop only**. No keyboard shortcuts are registered on mobile/tablet PWA builds. The touch-first interface is unaffected.
- **No modal = search active**. When no modal or overlay is open, any alphanumeric keystroke is captured by the search bar. The user never needs to click into the search field.
- **Numpad assumed**. Physical numpad is expected on the checkout terminal. Number keys, Enter, and arithmetic operators are all numpad-bound.
- **Single-cashier session**. The keyboard registry belongs to one active terminal session. Multi-terminal environments each run their own Electron instance.

---

## Type-to-Filter Search

The search bar is always active when the terminal is in its default state (no modal open, no payment flow in progress).

| Action | Behaviour |
|--------|-----------|
| Type any alphanumeric character | Appends to search query; product list filters instantly via SQLite FTS5 |
| Arrow Up | Moves selection highlight up one row |
| Arrow Down | Moves selection highlight down one row |
| Enter | Adds the highlighted product to cart; triggers unit selection prompt |
| Escape | Clears search query and resets product list to default view |

### FTS5 Implementation

```sql
-- Virtual table for full-text search on product names and barcodes
CREATE VIRTUAL TABLE products_fts USING fts5(
  name,
  barcode,
  content='products',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER products_fts_insert AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, barcode) VALUES (new.rowid, new.name, new.barcode);
END;

CREATE TRIGGER products_fts_delete AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, barcode) VALUES('delete', old.rowid, old.name, old.barcode);
END;

CREATE TRIGGER products_fts_update AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, barcode) VALUES('delete', old.rowid, old.name, old.barcode);
  INSERT INTO products_fts(rowid, name, barcode) VALUES (new.rowid, new.name, new.barcode);
END;
```

Query (debounced at 50 ms):
```sql
SELECT p.*, rank
FROM products_fts f
JOIN products p ON p.rowid = f.rowid
WHERE products_fts MATCH ?
ORDER BY rank
LIMIT 50;
```

If the search query is numeric-only and 8+ characters, it is treated as a barcode scan -- skip FTS, do an exact `barcode = ?` lookup instead.

---

## Single-Key Unit Selection

After a product is added to cart via Enter, a unit prompt appears inline (not a modal). The prompt shows the available package variants from `product_packages` for that product.

| Key | Unit | Description |
|-----|------|-------------|
| 1 | Pcs | Single piece (base unit) |
| 2 | Pkt | Packet -- package smaller than a carton |
| 3 | Ctn | Carton / case |

Each product can have up to 3 package variants in `product_packages`. The mapping:

- **1** selects the variant where `name ILIKE '%pcs%'` or the variant with the smallest multiplier.
- **2** selects the variant where `name ILIKE '%pkt%'` or the mid-range multiplier.
- **3** selects the variant where `name ILIKE '%ctn%'` or the largest multiplier.

**Auto-skip rule**: If only one package variant exists for the product, skip the unit prompt entirely and add directly with that variant. The cashier sees a brief flash confirmation ("Added as Pcs") but no interruption.

If no variants exist in `product_packages` for the product, default to a single-unit (Pcs) entry.

After unit is confirmed, focus moves to quantity entry.

---

## Quantity Entry

After unit selection, a quantity input is active. The numpad is the input source.

| Input | Behaviour |
|-------|-----------|
| 1-999 (numeric keys) | Types the quantity |
| Enter | Confirms quantity; finalizes the cart line item |
| Backspace | Deletes last digit |
| Escape | Cancels quantity entry and removes the pending item from cart |

If Enter is pressed without typing any digits, the default quantity is **1**.

The cart line item is now finalized. Search bar re-activates automatically for the next item.

---

## Global Keyboard Shortcuts

These shortcuts work at all times unless a modal has higher-priority bindings (see Shortcut Registry below).

| Shortcut | Action |
|----------|--------|
| F1 | Help overlay -- shows all shortcuts in a searchable grid |
| F2 | New transaction -- clears cart, resets to blank state |
| F3 | Hold/Suspend cart -- saves current cart to held-carts list |
| F4 | Recall held cart -- opens held-carts list for selection |
| F5 | Payment -- initiates payment flow for current cart |
| F6 | Print receipt -- prints receipt for last completed transaction |
| F7 | Void last item -- removes the most recently added item from cart |
| F8 | Open cash drawer -- triggers cash drawer relay (hardware) |
| F9 | Search products -- focuses search bar explicitly |
| F10 | Discount -- opens discount entry for selected cart item (or whole cart) |
| F11 | Full screen toggle -- switches between windowed and fullscreen |
| F12 | Lock terminal -- locks POS, requires PIN/biometric to resume |
| Escape | Cancel / Go back -- context-dependent: closes modal, clears search, or exits payment |
| Tab | Switch focus between product panel and cart panel |
| Delete | Remove selected cart item |
| Ctrl+Z | Undo last action -- restores voided item or reversed action |

### F1 Help Overlay

Pressing F1 opens a semi-transparent overlay listing every shortcut. The overlay is dismissed by pressing F1 again, Escape, or Enter. It does not block the underlying UI from rendering.

Layout:

```
+---------------------------------------------------+
|  KEYBOARD SHORTCUTS                    [F1 close]  |
|---------------------------------------------------|
|  F1   Help                F7   Void last item      |
|  F2   New transaction     F8   Open cash drawer    |
|  F3   Hold cart           F9   Search products     |
|  F4   Recall cart         F10  Discount            |
|  F5   Payment             F11  Fullscreen          |
|  F6   Print receipt       F12  Lock terminal       |
|---------------------------------------------------|
|  Enter   Confirm          Tab    Switch panel      |
|  Esc     Cancel/Back      Del    Remove item       |
|  Ctrl+Z  Undo             Arrows Navigate results  |
+---------------------------------------------------+
```

---

## Manual Denomination Tiles (CASH Payment)

When the payment method is CASH, the payment screen shows large denomination tiles alongside the numpad.

### Available Denominations

| Tile | Value (Nu.) |
|------|-------------|
| Nu. 10 | 10 |
| Nu. 50 | 50 |
| Nu. 100 | 100 |
| Nu. 500 | 500 |
| Nu. 1000 | 1000 |

### Interaction

- **Click/Touch a tile**: Adds that denomination to the "received" total.
- **Numpad key + Ctrl**: Adds the corresponding denomination (Ctrl+1 = Nu. 10, Ctrl+2 = Nu. 50, Ctrl+3 = Nu. 100, Ctrl+4 = Nu. 500, Ctrl+5 = Nu. 1000).
- **Custom amount**: Type any number on the numpad and press Enter to set the received amount directly (overrides running total).

### Quick Actions

| Key / Button | Action |
|-------------|--------|
| E | "Exact" -- sets received amount equal to grand total |
| R | "Round" -- rounds received to nearest Nu. 5 (Bhutan has no coins below Nu. 1, rounding avoids cent fractions) |

### Change Calculation

```
change = received - grand_total
```

Displayed prominently in emerald green when change > 0. If received < grand_total, the remaining balance is shown in tibetan (red) and the cashier is prompted to enter more.

The "Complete" button (or Enter when received >= grand_total) finalizes the transaction.

---

## Keyboard Shortcut Registry

A global hook system that captures all keyboard events on the desktop terminal and routes them by priority.

### Architecture

```
Keyboard Event
    │
    ▼
┌──────────────────────┐
│  Priority Dispatcher  │
├──────────────────────┤
│ 1. Modal shortcuts    │  ← active modal captures first
│ 2. Cart shortcuts     │  ← when cart panel has focus
│ 3. Global shortcuts   │  ← F-keys, Escape, Tab always available
└──────────────────────┘
    │
    ▼
  If captured: event.preventDefault() + event.stopPropagation()
  If not captured: bubble to browser default
```

### Implementation Pattern

```js
// useKeyboardRegistry.js
const handlers = {
  modal: [],   // registered by active modal/overlay
  cart: [],    // registered by cart panel
  global: [],  // always-on shortcuts (F-keys, Escape, Tab)
};

function registerShortcut(layer, keyCombo, handler) {
  handlers[layer].push({ keyCombo, handler });
  return () => {
    handlers[layer] = handlers[layer].filter(h => h.handler !== handler);
  };
}

function handleKeyEvent(event) {
  // Priority: modal > cart > global
  for (const layer of ['modal', 'cart', 'global']) {
    for (const { keyCombo, handler } of handlers[layer]) {
      if (matchesCombo(event, keyCombo)) {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
        return;
      }
    }
  }
  // Not captured -- let browser handle it
}
```

### Key Combo Matching

A key combo is defined as:

```js
{
  key: 'F5',            // KeyboardEvent.key value
  ctrl: false,
  shift: false,
  alt: false,
  meta: false
}
```

The `matchesCombo` function checks `event.key`, `event.ctrlKey`, `event.shiftKey`, `event.altKey`, and `event.metaKey` against the registered combo.

### Global Registration (Electron Main Process)

In the Electron shell (F-DESKTOP-001), F12 Lock Terminal must be captured even when the browser view does not have focus. This requires a global shortcut registration:

```js
// Electron main process
const { globalShortcut } = require('electron');

globalShortcut.register('F12', () => {
  mainWindow.webContents.send('shortcut:lock-terminal');
});
```

All other shortcuts are handled in the renderer process via the `useKeyboardRegistry` hook.

### Prevented Browser Defaults

The following browser defaults are suppressed when the POS is active:

| Key | Default Behaviour | Why Prevented |
|-----|-------------------|---------------|
| F1 | Browser help page | POS help overlay |
| F5 | Page reload | POS payment trigger |
| F11 | Fullscreen toggle | POS fullscreen toggle |
| F12 | DevTools | POS lock terminal |
| Tab | Focus next element | POS panel switch |
| Ctrl+Z | Browser undo | POS undo action |

DevTools access is remapped to `Ctrl+Shift+F12` in development mode only.

---

## State Machine: Checkout Flow

```
[Idle: Search Active]
       │
       │ Enter (product selected)
       ▼
[Unit Prompt] ──── (if single variant, auto-skip)
       │
       │ 1 / 2 / 3
       ▼
[Quantity Entry]
       │
       │ Enter (or default 1)
       ▼
[Cart Updated] ──→ back to [Idle: Search Active]
       │
       │ F5
       ▼
[Payment Flow]
       │
       │ Select method (ONLINE / CASH / CREDIT)
       ▼
  if ONLINE ──→ [Journal Number Entry] ──→ [Awaiting Confirmation]
  if CASH   ──→ [Cash Denomination Screen]
  if CREDIT ──→ [Customer OTP Verification]
       │
       │ Payment confirmed
       ▼
[Transaction Complete]
       │
       │ F6 (print) / F2 (new)
       ▼
[Idle: Search Active]
```

At any point, Escape moves one step back. From the top level, Escape does nothing (or prompts "Exit POS?" after a second press within 2 seconds).

---

## Edge Cases

- **Rapid keystrokes**: If Enter is pressed while a previous item is still being persisted to local DB, queue the action. Do not drop it. Show a subtle "saving..." indicator.
- **Search with no results**: Display "No products found" in the product panel. Typing more characters continues to filter (no result set). Escape clears.
- **Unit prompt with all 3 variants but only 1 in stock**: Show stock count next to each variant. If selected variant has 0 stock, show inline error "Out of stock" and keep prompt open.
- **Held cart limit**: Maximum 10 held carts per terminal. If limit reached, F3 shows warning and prompts to recall or discard one first.
- **Undo stack depth**: Ctrl+Z maintains a stack of the last 20 actions. Older actions are not recoverable.
- **F12 Lock in development**: In `NODE_ENV=development`, F12 opens DevTools instead. Lock terminal is remapped to `Ctrl+L`. This prevents developer workflow friction.

---

## Implementation Checklist

### Keyboard Registry
- [ ] `useKeyboardRegistry.js` hook with priority dispatcher (modal > cart > global)
- [ ] `registerShortcut(layer, keyCombo, handler)` API with cleanup return
- [ ] `matchesCombo(event, keyCombo)` matcher for key + modifier detection
- [ ] Global keydown listener attached on mount, detached on unmount
- [ ] Browser default prevention for captured keys (F1, F5, F11, F12, Tab, Ctrl+Z)

### Search
- [ ] SQLite FTS5 virtual table (`products_fts`) on `products.name` and `products.barcode`
- [ ] FTS sync triggers (INSERT, UPDATE, DELETE)
- [ ] Debounced (50ms) search query handler
- [ ] Barcode detection (numeric-only, 8+ chars) with exact-match lookup
- [ ] Arrow Up/Down highlight navigation in search results
- [ ] Enter to add highlighted product to cart
- [ ] Escape to clear search

### Unit Selection
- [ ] Inline unit prompt UI (not modal) showing available variants from `product_packages`
- [ ] Key 1/2/3 mapped to Pcs/Pkt/Ctn variants
- [ ] Auto-skip when product has only one package variant
- [ ] Stock count display per variant in prompt
- [ ] Out-of-stock guard on variant selection

### Quantity Entry
- [ ] Numpad quantity input (1-999)
- [ ] Enter to confirm (default 1 if empty)
- [ ] Backspace to delete last digit
- [ ] Escape to cancel and remove pending item

### Global Shortcuts
- [ ] F1: Help overlay with full shortcut grid, dismissible by F1/Escape/Enter
- [ ] F2: New transaction (clear cart, confirm if cart has items)
- [ ] F3: Hold/Suspend cart (save to held-carts list, max 10)
- [ ] F4: Recall held cart (list selection)
- [ ] F5: Initiate payment flow
- [ ] F6: Print receipt for last completed transaction
- [ ] F7: Void last cart item
- [ ] F8: Open cash drawer (hardware relay trigger)
- [ ] F9: Focus search bar
- [ ] F10: Discount entry (item or cart)
- [ ] F11: Fullscreen toggle
- [ ] F12: Lock terminal (Electron global shortcut)
- [ ] Escape: Context-dependent cancel/back
- [ ] Tab: Switch product panel / cart panel focus
- [ ] Delete: Remove selected cart item
- [ ] Ctrl+Z: Undo last action (20-deep stack)

### Cash Denomination Tiles
- [ ] Denomination tile grid: Nu. 10, 50, 100, 500, 1000
- [ ] Click to add denomination to received total
- [ ] Ctrl+1/2/3/4/5 keyboard shortcut for denominations
- [ ] Custom numpad entry with Enter to set received amount
- [ ] "E" key for Exact (received = total)
- [ ] "R" key for Round (to nearest Nu. 5)
- [ ] Change calculation display (emerald if positive, red if short)
- [ ] Enter to complete when received >= grand_total

### Electron Integration
- [ ] Global shortcut registration for F12 (lock terminal) in main process
- [ ] IPC bridge for `shortcut:lock-terminal` event
- [ ] Dev mode remapping: F12 -> DevTools, Ctrl+L -> Lock terminal

### Undo Stack
- [ ] Action history stack (max 20 entries)
- [ ] Push on: void item, discount apply, quantity change
- [ ] Pop on Ctrl+Z: reverse last action
- [ ] Clear on F2 (new transaction)

---

## Resolved Decisions

- **Desktop only**: Keyboard shortcuts are not registered on PWA/mobile builds. The touch interface is the canonical mobile experience.
- **Inline unit prompt, not modal**: A modal would steal keyboard focus and break the search flow. The inline prompt keeps the search context visible and allows Escape to cancel cleanly.
- **FTS5 over LIKE**: Full-text search provides sub-string matching, ranking, and better performance on large product catalogs. LIKE with wildcards cannot use indexes effectively.
- **50ms debounce**: Fast enough to feel instant, slow enough to avoid firing a query per keystroke on rapid typing.
- **Barcode detection at 8+ chars**: Bhutanese EAN-13 barcodes are 13 digits. Setting threshold at 8 avoids false-positive barcode lookups on short numeric searches (e.g., "123").
- **Max 10 held carts**: Prevents memory bloat on the terminal. 10 is sufficient for peak-hour operations where a cashier might hold carts for customers who forgot items.
- **20-deep undo stack**: Covers a reasonable session of corrections without consuming excessive memory. Longer sessions should use F2 to start fresh.
- **Nu. 5 rounding**: Bhutan does not circulate coins below Nu. 1. Rounding to Nu. 5 simplifies cash handling and avoids cent-fraction awkwardness at the counter.
