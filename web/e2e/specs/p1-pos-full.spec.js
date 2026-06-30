/**
 * P1 — POS Full Production E2E (PocketBase)
 *
 * STATUS: SKIPPED — wholesale surface drift (not selector drift).
 *
 * ROOT CAUSE: This spec was written against the OLD monolithic POS that lived
 * at the app root `/`. The Pelbu redesign replaced that surface entirely:
 *
 *   - app/page.jsx (`/`) is now a marketing/landing page ("Welcome to Pelbu",
 *     feature cards, demo table) — NOT a POS. proxy.js middleware redirects
 *     authenticated RETAILER users from `/` to `/pos`.
 *   - The POS moved to `/pos` (keyboard) + `/pos/touch` (touch). The keyboard
 *     `/pos` (app/pos/page.jsx + components/pos/keyboard/*) has a completely
 *     different structure: a cart TABLE (not product cards), type-to-search /
 *     F3 product-search modal, a payment modal with different labels, and
 *     "Pelbu" branding (the old spec asserts "NEXUS BHUTAN").
 *
 * Every selector in this file is stale:
 *   - `getByPlaceholder(/search products/i)`  → keyboard POS uses
 *     [data-testid="keyboard-product-search-input"] inside a modal opened by
 *     typing or F3; there is no always-visible search bar.
 *   - `getByRole('button', { name: /Coca Cola 1L/ })` → products are no longer
 *     rendered as clickable cards on the root; the keyboard cart is a table.
 *   - `getByText('Clear')`, `'Add customer'`, `'Amount Due'`, `'Tendered
 *     Amount'`, `'Select Customer'`, `'Opening Float'`, `'NEXUS BHUTAN'`,
 *     `'Cart is empty'` → none of these strings exist on the redesigned
 *     keyboard POS surface (branding is "Pelbu"; checkout is a payment modal;
 *     customer selection is the customer-panel-modal via F6).
 *   - `a[href="/settings"]`, `a[href="/customers"]` → nav moved into icon
 *     buttons in the keyboard header.
 *
 * COVERAGE: The Pelbu POS surfaces ARE covered elsewhere:
 *   - Keyboard /pos cart editing → v10-keyboard-cart-edit.spec.js
 *   - Touch /pos/touch full flow  → f5-pos-touch-flow.spec.js
 *   - Touch product/cart/checkout/GST/discounts/errors → v2a–v2h
 *
 * Resurrecting this file would mean rewriting every test against the keyboard
 * /pos page object (which does not yet exist as a dedicated PO) — that is a
 * new-feature task, not a drift fix. Skipping wholesale with the reason
 * recorded so the serial-verification run does not attempt these.
 *
 * Auth comes from the `pocketbase-pos` project's storageState (set up in
 * auth-setup.js). No per-test login.
 */
const { test } = require('@playwright/test')

const SKIP_REASON =
  'Drifted: targets the pre-Pelbu POS at /, which is now a landing page. ' +
  'The POS moved to /pos (keyboard) + /pos/touch; see v10, f5, and v2a–v2h ' +
  'for current coverage. Rewrite against the keyboard /pos page object to re-enable.'

// ── Auth (storage state covers most flows; logout/refresh need explicit handling) ──

test.describe('Auth', () => {
  test.skip('session persists after refresh', SKIP_REASON)
  test.skip('logout clears session', SKIP_REASON)
})

// ── Products ─────────────────────────────────────────────────────────────

test.describe('Products', () => {
  test.skip('product grid loads with seed data', SKIP_REASON)
  test.skip('search filters by name', SKIP_REASON)
  test.skip('all seed products render', SKIP_REASON)
})

// ── Cart ─────────────────────────────────────────────────────────────────

test.describe('Cart', () => {
  test.skip('add product to cart', SKIP_REASON)
  test.skip('quantity changes', SKIP_REASON)
  test.skip('clear cart removes items', SKIP_REASON)
  test.skip('cart panel shows correct structure', SKIP_REASON)
  test.skip('checkout opens payment modal', SKIP_REASON)
  test.skip('credit payment requires customer', SKIP_REASON)
})

// ── Customers ────────────────────────────────────────────────────────────

test.describe('Customers', () => {
  test.skip('customer modal opens from cart', SKIP_REASON)
  test.skip('seed customers appear in modal', SKIP_REASON)
  test.skip('customers page shows list', SKIP_REASON)
})

// ── Shifts ───────────────────────────────────────────────────────────────

test.describe('Shifts', () => {
  test.skip('open shift button visible', SKIP_REASON)
  test.skip('open shift modal works', SKIP_REASON)
})

// ── Settings ─────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test.skip('settings page accessible', SKIP_REASON)
  test.skip('settings has store profile section', SKIP_REASON)
})

// ── Receipt / Payment Modal ──────────────────────────────────────────────

test.describe('Receipt Modal', () => {
  test.skip('payment modal shows all methods', SKIP_REASON)
  test.skip('cash payment shows tendered input', SKIP_REASON)
})
