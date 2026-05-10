# Feature: Multi-Cart (Hold & Switch)

**Feature ID**: F-CART-002
**Phase**: 3
**Status**: Code Complete
**Last Updated**: 2026-04-29

---

## Overview

The vendor POS supports multiple simultaneous carts per terminal. A cashier can hold the current customer's cart (e.g. while waiting for the customer to decide), open a blank cart for the next customer, and switch back when the first customer is ready. Up to 9 carts can be open concurrently.

---

## Behaviour

- **Hold & New** — creates a new blank ACTIVE cart while keeping the current one open. Touch POS: `+` button in cart tab bar. Keyboard POS: `F4`.
- **Switch** — tap any cart tab or press `Ctrl+1`–`9` on the keyboard POS.
- **Cancel/Clear** — deletes all items in a cart and marks it `ABANDONED`. If it was the only cart, a fresh blank cart is created automatically. Touch: `✕` on the tab. Keyboard: `F6`.
- **Tab cycling** — `Tab` / `Shift+Tab` cycles through open carts on the keyboard POS.

## DB

Each held cart is a separate `ACTIVE` row in the `carts` table scoped to the entity. The existing `carts` schema supports this without any migration — the `useCart` hook previously limited queries to `.limit(1)`, which was removed.

## Keyboard Shortcuts (keyboard POS)

| Key | Action |
|-----|--------|
| `F4` | New cart (hold current, open blank) |
| `F6` | Cancel/clear active cart |
| `Tab` / `Shift+Tab` | Cycle carts |
| `Ctrl+1`–`9` | Jump to cart by number |

---

## Implementation

- `hooks/use-cart.js` — rewritten to manage `carts[]` array with `activeIndex`. All item operations target `carts[activeIndex]`.
- `components/pos/cart-panel.jsx` — cart tab bar with hold button, switch tabs, cancel `✕`
- `app/pos/keyboard/page.jsx` — keyboard shortcuts wired to `holdCart`, `switchCart`, `cancelCart`
