# Pelbu Desktop POS — Changelog

Offline-first Electron + PocketBase retail terminal. Versions are the
`package.json` version shipped to terminals via the cloud update check
(`/api/desktop/releases/latest`); release notes are also entered in the
admin **Releases** console at publish time.

## 1.3.0 — Online order management on the terminal
- **Incoming online (marketplace) orders now surface on the terminal** — a new
  **Online Orders** screen (and toolbar badge) lists this store's marketplace
  orders, pulled from the cloud with the terminal's own sync token.
- **Native new-order notifications** — the terminal pops an OS notification when
  a new online order arrives (polled ~45s; the debounced sales push is separate).
- **Rider pickup-OTP sharing** — each order shows the pickup code to read to the
  rider at collection, plus the rider's name and dispatch state (finding a
  rider / no rider available / out for delivery).
- **Confirm / cancel from the counter** — the shopkeeper can confirm an order
  (→ Processing, which assigns a rider) or cancel it (with a reason), scoped to
  their own store; mirrors the web vendor actions.
- **Offline-resilient** — orders are mirrored into local PocketBase
  (`online_orders`, PB migration 017), so the last-known list + OTPs stay
  visible during a brief internet outage.

## 1.2.0 — Sales Order vs Quotation
- **Save as draft now offers both** — Alt+Q lets the cashier save the cart as a
  committed **Sales Order** or a non-binding **Quotation** (both DRAFT
  `SALES_ORDER`, no payment, no stock move).
- New `orders.is_quotation` flag (PB migration 016) distinguishes them and syncs
  to the cloud (carried through the terminal→cloud order sync).
- Reaches parity with the web sell-side fold (the POS is the single sell entry).

## 1.1.4 — Per-line salesperson + retail-default rates
- Salesperson is assigned per line (F8); product rates default to retail.

## 1.1.3 — Per-line rate tier
- Retail / Wholesale / Distributor rate per line via the product-search toggle.

## 1.1.2 — Invoice discount
- Invoice-level discount applied pre-GST on the net bill.

## 1.1.1 — Single-instance lock
- Only one terminal instance runs at a time.

## 1.1.0 — Sync durability
- Removed the vestigial PouchDB/sync-worker leftovers; added a sync durability
  backstop.

## 1.0.9 — Sync correctness + near-live sync
- Order signatures use the provisioned TPN so cloud verification passes;
  debounced near-live push after each sale + periodic re-pull.

## 1.0.8 — Cash drawer
- Kick the cash drawer on cash sales.

## 1.0.7 — POS-only scope
- Trimmed the terminal to a POS register (back-office lives on the web); added a
  sync-drift nudge.

## 1.0.6 — Clean uninstall
- Uninstall wipes the local DB; "Clear & Re-sync" enforces a full local wipe.

## 1.0.5 — Prod PB hooks
- Load the bundled PocketBase hooks in production; owner "Clear & Re-sync".

## 1.0.4 — Shortcut footer
- Tappable, uniform-width shortcut footer.

## 1.0.0–1.0.3 — Initial terminal
- Offline POS (cart, checkout, shifts, cash registers, audit log), retailer
  licensing + activation + provisioning bootstrap, weighed-goods checkout +
  barcode label maker, bundled `pocketbase.exe` + signed NSIS installer, and the
  PocketBase boot fix (partial-index parser). See git history for detail.
