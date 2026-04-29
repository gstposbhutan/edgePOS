# Web App Build Progress
**Last Updated**: 2026-04-29 (rev 2)
**Strategy**: Web app first, Windows desktop app later. One feature at a time, in dependency order.

---

## Done
- [x] Phase 1 Foundation: Next.js 16, JS/JSDoc, Tailwind v4, Shadcn/UI, Royal Bhutan theme
- [x] Supabase schema: 29 migrations, all tables, RLS, JWT claims hook
- [x] Auth: Login page (email/password), connectivity gate, proxy route guard, WhatsApp OTP
- [x] Products: CRUD with Supabase, categories, batches, packages (BULK/BUNDLE/MIXED/PALLET)
- [x] **HSN Master & Category Integration** — [F-HSN-001](features/hsn-master-integration.md) ✅ CODE COMPLETE
  - Migration 033: `hsn_master` table seeded from BTC 2022 (Bhutan Trade Classification)
  - Migration 034: `hsn_master_id` FK on products/entity_products, category sync trigger
  - Migration 035: `category_properties` HSN columns, `get_hsn_properties()` DB function
  - Migration 036: Fix HSN trigger to fire on `hsn_code` column update
  - `GET /api/hsn` (search) + `POST /api/hsn` (details by code)
  - `HsnCodeSelector` with autocomplete, category path, and tax summary display
  - `useHsnCodes` + `useHsnChapters` hooks
  - Admin categories page + `PropertyConfigModal` for SUPER_ADMIN / DISTRIBUTOR
- [x] **Product Specifications (HSN-Driven)** — [F-SPEC-001](features/product-specifications.md) ✅ CODE COMPLETE
  - Migration 032: `entity_product_specifications` table
  - `GET /api/entity-products/[id]/specifications` + `POST /api/admin/entity-products/[id]/specifications`
  - `EntityProductSpecifications` — dynamic form (5 data types: text, number, unit, datetime, multi)
  - `ProductSpecificationsDisplay` — compact + expanded read-only variants
  - `useEntityProductSpecifications` hook
  - Specs wired into POS product detail modal (read-only) and shop product detail modal
- [x] Cart: Persisted to carts/cart_items tables, discounts, quantity management
- [x] Checkout: Order creation, stock deduction, digital signature, stock gate modal
- [x] Inventory: Stock adjustments, movement history, photo-to-stock (bill OCR), stock predictions
- [x] Orders: CRUD, cancellations, refunds, replacements, status timeline
- [x] Receipt PDF generation (jsPDF + html2canvas on order confirmation page)
- [x] Khata: Unified credit system (CONSUMER/RETAILER/WHOLESALER), account management, ledger, repayments
- [x] Marketplace: Public shop pages (`/shop/[slug]`) with WhatsApp ordering integration (superseded below)
- [x] **Customer Cart & Multi-Store Shop** — [F-SHOP-001](features/customer-cart-shop.md) ✅ CODE COMPLETE
  - Cart-based discovery at `/shop` (multi-store grid) and `/shop/store_[id]` (single retailer)
  - Persistent cart per customer per retailer (`carts` + `cart_items` tables)
  - `CartDrawer` (bottom sheet / sidebar) with quantity controls and GST breakdown
  - `CartProvider` context at root layout, `useCart()` hook
  - Login redirect on unauthenticated add-to-cart with return URL
  - Fixed Next.js 15 async params in `PATCH`/`DELETE` `/api/cart/[itemId]` handlers
  - [x] Checkout / payment flow wired (see F-CHECKOUT-001 below)
- [x] **Customer Checkout & Post-Delivery Payment** — [F-CHECKOUT-001](features/customer-checkout-flow.md) ✅ CODE COMPLETE
  - Multi-vendor order splitting: one MARKETPLACE order per vendor per checkout
  - `/api/shop/checkout` — customer self-checkout with delivery address + GPS
  - `/api/shop/orders` — GET customer orders + POST vendor creates order on behalf of customer
  - `/api/shop/orders/[id]` — GET customer detail + PATCH vendor status transitions
  - `/api/shop/pay/[orderId]` — public token-validated OCR payment upload
  - Payment token (64-char hex, 7-day expiry) stored on orders; cleared on payment completion
  - WhatsApp gateway: `send-order-confirmation`, `send-order-notification`, `send-payment-link`
  - Logistics bridge: `PICKED_UP` → DISPATCHED + `DELIVERED` → payment link auto-sent
  - Customer shop pages: `/shop/checkout`, `/shop/orders`, `/shop/orders/[id]`, `/pay/[orderId]`
  - `CustomerOtpModal` — WhatsApp OTP required for every CREDIT sale; auto-creates khata account
  - Migration 046: `payment_token`, `delivery_address`, `delivery_lat/lng` on orders
  - Migration 051: Fixed `khata_debit_on_confirm` trigger — MARKETPLACE orders now use CONSUMER party_type
- [x] **Multi-Cart (Hold & Switch)** — [F-CART-002](features/multi-cart.md) ✅ CODE COMPLETE
  - Up to 9 simultaneous ACTIVE carts per terminal
  - `useCart` rewritten to manage `carts[]` array; all ops target `carts[activeIndex]`
  - Touch POS: cart tab bar with `+` (hold), switch tabs, `✕` (cancel)
  - Keyboard POS: F4 (new cart), F6 (cancel), Tab/Shift+Tab (cycle), Ctrl+1–9 (jump to cart N)
- [x] **Rider System** — [F-RIDER-001](features/rider-system.md) ✅ CODE COMPLETE
  - Migration 047: `riders` table + `pickup_otp`, `delivery_otp`, `rider_id` on orders
  - Phone + PIN login at `/rider/login`; session via magic link
  - Assignment: logistics-bridge sends WhatsApp accept/reject link to rider
  - Pickup OTP: sent to vendor on accept; rider inputs at collection → DISPATCHED + delivery OTP sent to customer
  - Delivery OTP: sent to customer on DISPATCHED; rider inputs at doorstep → DELIVERED + payment link
  - `/rider` web app: dashboard, order detail, OTP modals, history, change PIN
  - `/admin/riders` — SUPER_ADMIN creates riders with initial PIN
- [x] **Vendor Signup (Retailer & Wholesaler)** — [F-SIGNUP-001](features/vendor-signup.md) ✅ CODE COMPLETE
  - `/signup/retailer` → RETAILER entity + OWNER user → `/pos`
  - `/signup/wholesaler` → WHOLESALER entity + OWNER user → `/admin`
  - Unified `/api/auth/signup/vendor` endpoint with `role` parameter
  - `user_metadata` stores role/sub_role/entity_id (not `app_metadata`)
- [x] **Multi-Store Owner Management** — [F-MSTORE-001](features/multi-store.md) ✅ PARTIAL
  - Migration 050: `owner_stores` junction table
  - POS header store selector dropdown (2+ stores)
  - `/admin/stores` — owner creates/views all owned stores
  - `proxy.js` — RETAILER+OWNER allowed through to `/admin/*`
  - Admin sidebar role-filtered by role (OWNER sees Stores/Team/Settings only)
  - Team management: OWNER can add MANAGER/CASHIER/STAFF, transfer ownership, remove members
  - [ ] Stock transfers between stores (pending)
- [x] **Sales Order Page** (`/salesorder`) ✅ CODE COMPLETE
  - Keyboard-first two-column layout: customer details left, order table right
  - Fullscreen product search modal (identical to keyboard POS: 1–9, ↑↓, Esc, barcode)
  - Auto-creates khata account if customer is new before placing order
  - F5 to place order; navigates to success screen with order number
  - Replaces `CreateMarketplaceOrderModal` — "New Order" in `/pos/orders` now navigates here
- [x] **Keyboard POS** — [F-KBD-002](features/vendor-keyboard-ui.md) ✅ CODE COMPLETE
  - Default route `/pos`; touch POS moved to `/pos/touch`
  - Cart table: Batch column (blue batch#, expiry) + Stock column (available_qty)
  - Product search: entity-scoped `product_batches` queries (one row per batch, FEFO order)
  - Barcode lookup: entity-scoped (batch barcode → SKU fallback)
  - Payment methods simplified to Online / Cash / Credit (legacy MBOB/MPAY/RTGS → ONLINE, migration 064)
  - Breadcrumb navigation on all POS pages; back button restores correct orders tab
  - Sales Order / Sales Invoice / Purchase Order / Purchase Invoice all converted to keyboard-first full-screen overlays
  - See feature spec for full details
- [x] **Sales Orders & Sales Invoices** — [F-SALES-001](features/sales-order-invoice.md) ✅ CODE COMPLETE
  - `/salesorder` creates SALES_ORDER (DRAFT, no stock change)
  - Sales invoice creation: full-screen overlay with batch picker per line, qty capped at batch stock
  - Partial fulfilment: multiple invoices per SO, server validates remaining qty
  - Success screen with printable invoice preview + PDF download
  - `/pos/orders` defaults to Sales tab; tab-aware back navigation
  - Migration 058: SALES_ORDER/SALES_INVOICE order types, PARTIALLY_FULFILLED status, sales_order_id FK
  - Migration 062: deduct_stock triggers fire on INSERT OR UPDATE (fixes SALES_INVOICE direct-CONFIRMED insert)
- [x] **Purchase Orders & Purchase Invoices** ✅ CODE COMPLETE
  - Convert to invoice: full-screen overlay (matches sales invoice UI)
  - product search scoped to `product_batches` with entity_id — only products vendor has received
  - Flow diagram: `docs/flows/vendor-purchase-order-invoice.mmd`
- [x] **Batch Stock Management** ✅ CODE COMPLETE
  - Migration 060: `auto_deplete_batch` BEFORE UPDATE trigger — sets status=DEPLETED when qty ≤ 0
  - Migration 061: `sellable_products` view uses `auth_entity_id()` INNER JOIN — entity-scoped
  - Migration 062: all stock deduction/guard triggers handle INSERT OR UPDATE; SECURITY DEFINER
  - Product validation in `/api/shop/orders` now checks `product_batches` by entity_id (not `created_by`)
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
| `marketplace-page.md` | F-MARKET-001 | Web (editorial WhatsApp-only, superseded by F-SHOP-001) |
| `customer-cart-shop.md` | F-SHOP-001 | Web — cart-based multi-store shop |
| `customer-checkout-flow.md` | F-CHECKOUT-001 | Web — checkout, post-delivery payment, OCR |
| `vendor-keyboard-ui.md` | F-KBD-002 | Web — keyboard/desktop POS layout + dense vendor pages |
| `sales-order-invoice.md` | F-SALES-001 | Web — Sales Order → Invoice with batch picking and partial fulfilment |
| `rider-system.md` | F-RIDER-001 | Web — rider login, OTP pickup/delivery, admin rider management |
| `hsn-master-integration.md` | F-HSN-001 | Both platforms — HSN master + category inheritance |
| `product-specifications.md` | F-SPEC-001 | Both platforms — dynamic HSN-driven specifications |
| `whatsapp-ordering.md` | F-WA-ORDER-001 | Web + gateway |
| `order-management.md` | F-ORDER-001 | Both platforms |
| `product-packaging.md` | F-PKG-001 | Both platforms |
| `distributor-role.md` | F-DIST-001 | Admin Hub |
| `multi-cart.md` | F-CART-002 | Web — hold/switch/cancel carts in POS |
| `vendor-signup.md` | F-SIGNUP-001 | Web — retailer + wholesaler signup pages |
| `multi-store.md` | F-MSTORE-001 | Web — owner store selector + creation (partial) |
