# Web App Build Progress
**Last Updated**: 2026-04-26
**Strategy**: Web app first, Windows desktop app later. One feature at a time, in dependency order.

---

## Done
- [x] Phase 1 Foundation: Next.js 16, JS/JSDoc, Tailwind v4, Shadcn/UI, Royal Bhutan theme
- [x] Supabase schema: 29 migrations, all tables, RLS, JWT claims hook
- [x] Auth: Login page (email/password), connectivity gate, proxy route guard, WhatsApp OTP
- [x] Products: CRUD with Supabase, categories, batches, packages (BULK/BUNDLE/MIXED/PALLET)
- [x] Cart: Persisted to carts/cart_items tables, discounts, quantity management
- [x] Checkout: Order creation, stock deduction, digital signature, stock gate modal
- [x] Inventory: Stock adjustments, movement history, photo-to-stock (bill OCR), stock predictions
- [x] Orders: CRUD, cancellations, refunds, replacements, status timeline
- [x] Receipt PDF generation (jsPDF + html2canvas on order confirmation page)
- [x] Khata: Unified credit system (CONSUMER/RETAILER/WHOLESALER), account management, ledger, repayments
- [x] Marketplace: Public shop pages (`/shop/[slug]`) with WhatsApp ordering integration
- [x] Admin Hub: Wholesaler dashboard, team management, settings
- [x] Wholesale Ordering: Retailer restock UI, wholesaler catalog, purchase orders with CREDIT
- [x] Vendor Restock Modal: Full wholesale ordering flow in POS (wholesaler list → catalog → cart → order)
  - Restock button added to POS header (ShoppingBag icon) — MANAGER/OWNER only
  - Two-step flow: select wholesaler → browse catalog → add to cart → place order
  - Orders created with `payment_method=CREDIT`, automatically debiting retailer's khata with wholesaler
- [x] Flow Diagrams: Mermaid charts for wholesaler signup, admin dashboard, and vendor restock
  - `docs/flows/wholesaler-signup.mmd` — Wholesaler registration flow
  - `docs/flows/wholesaler-admin-dashboard.mmd` — Admin dashboard navigation and actions
  - `docs/flows/vendor-restock.mmd` — Retailer restock flow with role-based access control
- [x] E2E Tests: `v8-vendor-restock.spec.js` — Tests for role-based access, wholesaler selection, catalog browsing, cart management, order placement
  - Test data: `TEST_WHOLESALER`, `TEST_WHOLESALER_PRODUCTS`, `TEST_RETAILER_WHOLESALER`, `TEST_WHOLESALER_KHATA`
  - Page object: `RestockModal` with selectors for all UI components
  - [ ] Testing: Requires database seeding with wholesaler data + retailer-wholesaler connection

## In Progress
- [x] **Admin Hub (Wholesaler Dashboard)** — NEW
  - [x] Admin dashboard page (`app/admin/page.jsx`) with stats cards (team, products, orders, revenue)
  - [x] Admin sidebar navigation (`components/admin/admin-sidebar.jsx`)
  - [x] Admin header with sign out (`components/admin/admin-header.jsx`)
  - [x] Team management: list, create modal (`components/admin/create-team-member-modal.jsx`)
  - [x] API routes: `GET/POST /api/admin/team`, `PATCH/DELETE /api/admin/team/[id]`, `PATCH /api/admin/settings`
  - [x] Hook: `use-admin-auth.js` for auth guard
  - [x] RLS policies (migration 028): team read/create/update/delete, wholesaler entity update
  - [ ] Testing: requires admin role user + entity setup

- [x] **Wholesale Ordering System** — NEW
  - [x] Wholesaler signup page (`app/(auth)/signup/wholesaler/page.jsx`) with business + owner account creation
  - [x] API: `POST /api/auth/signup/wholesaler` — creates entity + auth user + user profile
  - [x] Wholesale catalog API: `GET /api/wholesale/catalog?wholesaler_id=X` — products for retailer restock
  - [x] Wholesale orders API: `POST /api/wholesale/orders` — creates WHOLESALE orders with CREDIT payment
  - [x] Hook: `use-wholesale-orders.js` for wholesaler order management
  - [x] Hook: `use-restock.js` for retailer restock operations
  - [x] Restock components: wholesaler-list, wholesaler-catalog, restock-cart
  - [x] Restock modal (`components/pos/restock/restock-modal.jsx`) — full vendor restock UI
  - [x] RLS policies (migration 029): buyer-side orders, order_items, status_log, retailer connections
  - [x] Restock trigger: auto-create RESTOCK movements for buyer on delivery
  - [ ] Testing: requires retailer-wholesaler connections + wholesaler products

- [x] **WhatsApp OTP Login** — [F-AUTH-001](features/auth-role-based.md) ✅ CODE COMPLETE
  - [x] Migration: `whatsapp_otps` table (021_whatsapp_otps.sql)
  - [x] API: `/api/auth/whatsapp/send` + `/api/auth/whatsapp/verify`
  - [x] Login page: WhatsApp tab UI with 6-digit OTP input
  - [x] Auth lib: `sendWhatsAppOtp()` + `signInWithWhatsApp()` in `lib/auth.js`
  - [x] Gateway: `POST /api/send-otp` with Meta Cloud API + text fallback
  - [ ] Testing: requires Supabase migration run + Meta API credentials
- [x] **Consumer Khata (Unified Credit)** — [F-KHATA-001](features/consumer-khata.md) ✅ CODE COMPLETE
  - [x] Migration: `khata_accounts`, `khata_transactions`, `khata_repayments`, `khata_alerts` (022_unified_khata.sql)
  - [x] Dropped old B2B credit tables + `retailer_wholesalers` credit columns
  - [x] DB triggers: debit on confirm, credit on cancel, repayment apply
  - [x] Hook: `useKhata()` with CRUD, payment, adjustment, lookup
  - [x] Khata pages: `/pos/khata` (account list), `/pos/khata/[id]` (ledger detail)
  - [x] Modals: create-account, record-payment, adjust-balance
  - [x] POS checkout: khata lookup, limit enforcement, owner override
  - [x] POS header: Khata nav button
  - [x] Cart panel: credit limit info when CREDIT selected
  - [ ] Testing: requires Supabase migration 022 run

## Pending (Web Build Order)

### 1. Product Packaging UI — [F-PKG-001](features/product-packaging.md) ✅ ALREADY COMPLETE
- Schema (migrations 017-019), `sellable_products` view, recursive stock deduction — all done
- Packages tab in products page with CRUD via `PackageForm`
- POS product grid shows packages with type badges (BULK/BUNDLE/MIXED/PALLET) and computed availability
- Cart handles package line items with component breakdown
- No gaps found

### 2. Consumer Khata (Unified Credit) — [F-KHATA-001](features/consumer-khata.md) ✅ CODE COMPLETE
- Unified credit for CONSUMER, RETAILER, WHOLESALER — replaces old B2B credit system
- See "In Progress" section above for details

### 3. WhatsApp Gateway — [F-AUTH-001](features/auth-role-based.md) ✅ CODE COMPLETE
- Full Meta Cloud API integration in `services/whatsapp-gateway/src/index.ts`
- Endpoints: `/api/send-otp`, `/api/send-receipt`, `/api/send-stock-alert`, `/api/send-credit-alert`
- Webhook receiver: `GET /api/webhook` (verification) + `POST /api/webhook` (delivery status, incoming messages)
- Template messages with text fallback for all endpoints
- Supabase integration for `orders.whatsapp_status` updates on delivery callbacks
- [ ] Testing: requires Meta API credentials + webhook URL configuration

### 4. WhatsApp Receipt Delivery ✅ CODE COMPLETE
- Auto-send receipt on order CONFIRMED via gateway (fire-and-forget in `app/pos/page.jsx`)
- Order confirmation page: WhatsApp button calls gateway, falls back to WhatsApp Web
- Button shows sent state after successful delivery
- `orders.whatsapp_status` updated by gateway webhook callbacks

### 5. Photo-to-Stock — [F-PHOTO-001](features/photo-to-stock.md) ✅ CODE COMPLETE
- Migration 026: `draft_purchases`, `draft_purchase_items` tables with RLS + `bill-photos` storage bucket
- `lib/vision/bill-ocr.js`: Gemini Vision OCR extraction + pg_trgm fuzzy matching (0.6 threshold)
- API: `POST /api/bill-parse` — photo in, OCR, fuzzy match, draft purchase created; SHA-256 duplicate detection
- API: `GET/PATCH/POST /api/draft-purchases` — list, edit items, confirm (RESTOCK inventory), cancel
- Hook: `useDraftPurchases()` with CRUD + standalone `parseBill()` for scan modal
- Scan Bill modal: camera capture (PWA) + file upload (desktop), obsidian theme with scan line animation
- Draft purchase review: editable items with confidence tiers (green/amber/yellow/red), product picker for unmatched
- Draft purchases list tab in inventory page with status badges
- Camera button in stock levels header for quick bill scanning
- Confirm draft creates `inventory_movements` (RESTOCK), existing trigger updates `products.current_stock`
- [ ] Testing: requires migration 026 + GEMINI_API_KEY + `bill-photos` storage bucket + sample bill images

### 6. Stock Prediction — [F-PREDICT-001](features/stock-prediction.md) ✅ CODE COMPLETE
- New tables: `stock_predictions`, `supplier_lead_times` (migration 023)
- DB function `calculate_stock_predictions(entity_id)` with weighted ADS, exclusion rules, threshold logic
- API route: `GET/POST /api/predictions` — fetch predictions + manual refresh
- Hook: `useStockPredictions()` with fetch, refresh, lead time management
- Prediction dashboard tab in Inventory page with summary cards, color-coded rows, search/filter
- Lead time modal for per-product supplier lead time configuration
- Gateway integration: stock alerts via `/api/send-stock-alert`
- [ ] Testing: requires Supabase migration 023 + seed inventory_movements data

### 7. Marketplace Page — [F-MARKET-001](features/marketplace-page.md) ✅ CODE COMPLETE
- Migration 024: `products.visible_on_web`, `entities.shop_slug`/`marketplace_bio`/`marketplace_logo_url`
- Public shop page at `/shop/[slug]` with luxury editorial layout (obsidian + gold)
- Products grouped by category with section dividers
- "Order via WhatsApp" gold button per product (wa.me deep link)
- API: `GET /api/marketplace/[slug]` — store + visible products
- "WEB" toggle in product management (gold badge when visible)
- ISR with 5-minute revalidation
- [ ] Testing: requires migration 024 + entity with shop_slug + products with visible_on_web=true

### 8. WhatsApp Ordering — [F-WA-ORDER-001](features/whatsapp-ordering.md) ✅ CODE COMPLETE
- Migration 025: `order_source`, `whatsapp_message_id`, `buyer_phone` on orders; `matched`, `raw_request_text`, `match_confidence` on order_items; `pg_trgm` + fuzzy_match RPC; `consumer_accounts` table
- Gateway: `order-parser.ts` extracts items from WhatsApp messages; `order-handler.ts` full pipeline (rate-limit, parse, fuzzy match, DRAFT order, customer reply)
- Incoming webhook messages routed to order handler
- POS orders page: WhatsApp filter tab, WA badge on WhatsApp-sourced orders, buyer phone display
- POS order detail: WhatsApp source badge, unmatched item warnings with amber styling, raw request text + match confidence
- [ ] Testing: requires migration 025 + Meta API credentials + products with pg_trgm index

---

## Desktop-Only (Future — Not in Web Build)
- Desktop Shell (F-DESKTOP-001) — Desktop app wrapper for Windows
- Keyboard Checkout (F-KBD-001) — Numpad-based checkout flow
- Bank Reconciliation (F-BANK-001) — OCR bank statement parsing, auto-match to khata repayments
- Shift Management (F-SHIFT-001) — Opening/closing floats, cashier handovers
- Vision-to-Bill Audit (F-AUDIT-001) — AI-powered bill verification and fraud detection
- Offline Sync (F-SYNC-001) — PouchDB + IndexedDB for offline operations

### Bank Reconciliation (F-BANK-001) — Pending Implementation
Desktop-only feature for wholesalers to upload mBoB/BNB bank statements and auto-match payments to retailer khata accounts.

**Planned Components:**
- `bank_statements` table — uploaded statement files tracking
- `bank_statement_rows` table — OCR-extracted transaction rows
- OCR pipeline using Gemini Vision (same infrastructure as payment screenshot verification)
- Auto-match engine: Journal Number + amount tolerance (+/- Nu. 1)
- Reconciliation dashboard with color-coded rows (Green/Matched, Yellow/Unmatched, Blue/Bank Only, Red/Mismatch)
- Manual actions: dismiss entries, link bank rows to orders, investigate unmatched
- WhatsApp end-of-day summary to owner

**Status:** Full spec in `docs/features/bank-reconciliation.md`, Phase 6 (Admin Hub & Marketplace)

---

## Feature Specs Directory
All specs in `docs/features/`. Each contains: overview, data model, implementation checklist, resolved decisions.

| Spec File | Feature ID | Status |
|-----------|-----------|--------|
| `auth-role-based.md` | F-AUTH-001 | WhatsApp OTP section added |
| `consumer-khata.md` | F-KHATA-001 | Unified (replaces old F-CREDIT-001) |
| `credit-ledger.md` | F-CREDIT-001 | **Deprecated** — merged into F-KHATA-001 |
| `desktop-shell.md` | F-DESKTOP-001 | Desktop only |
| `keyboard-checkout.md` | F-KBD-001 | Desktop only |
| `payment-ocr.md` | F-OCR-001 | Both platforms |
| `bank-reconciliation.md` | F-BANK-001 | Desktop only |
| `offline-sync.md` | F-SYNC-001 | Desktop only |
| `multi-store.md` | F-MSTORE-001 | Both platforms |
| `shift-management.md` | F-SHIFT-001 | Desktop only |
| `vision-bill-audit.md` | F-AUDIT-001 | Desktop only |
| `photo-to-stock.md` | F-PHOTO-001 | PWA primary |
| `stock-prediction.md` | F-PREDICT-001 | Both platforms |
| `marketplace-page.md` | F-MARKET-001 | Web |
| `whatsapp-ordering.md` | F-WA-ORDER-001 | Web + gateway |
| `order-management.md` | F-ORDER-001 | Both platforms |
| `product-packaging.md` | F-PKG-001 | Both platforms |
| `distributor-role.md` | F-DIST-001 | Admin Hub |
