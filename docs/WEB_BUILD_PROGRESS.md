# Web App Build Progress
**Last Updated**: 2026-04-26
**Strategy**: Web app first, Windows desktop app later. One feature at a time, in dependency order.

---

## Done
- [x] Phase 1 Foundation: Next.js 16, JS/JSDoc, Tailwind v4, Shadcn/UI, Royal Bhutan theme
- [x] Supabase schema: 20 migrations, all tables, RLS, JWT claims hook
- [x] Auth: Login page (email/password), connectivity gate, proxy route guard
- [x] Products: CRUD with Supabase, categories, batches
- [x] Cart: Persisted to carts/cart_items tables, discounts, quantity management
- [x] Checkout: Order creation, stock deduction, digital signature
- [x] Inventory: Stock adjustments, movement history
- [x] Orders: CRUD, cancellations, refunds, replacements, status timeline
- [x] Receipt PDF generation (jsPDF + html2canvas on order confirmation page)

## In Progress
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
- Desktop Shell (F-DESKTOP-001)
- Keyboard Checkout (F-KBD-001)
- Bank Reconciliation (F-BANK-001)
- Shift Management (F-SHIFT-001)
- Vision-to-Bill Audit (F-AUDIT-001)
- Offline Sync (F-SYNC-001)

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
