# Web App Build Progress
**Last Updated**: 2026-04-25
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

## Pending (Web Build Order)

### 1. Product Packaging UI — [F-PKG-001](features/product-packaging.md)
- Schema exists (migrations 017-019)
- Need: Packages tab in POS products, `addPackage()` in cart, package cards in grid, bundle line display

### 2. Consumer Khata (Unified Credit) — [F-KHATA-001](features/consumer-khata.md)
- New tables: `khata_accounts`, `khata_transactions`, `khata_repayments`, `khata_alerts`
- Removes old `retailer_wholesalers` credit columns and `consumer_accounts` tables
- POS: Credit/Khata payment method, limit enforcement, account management sidebar
- Admin Hub: Wholesaler credit dashboard for retailers

### 3. WhatsApp Gateway — [F-AUTH-001](features/auth-role-based.md)
- Replace `services/whatsapp-gateway/src/index.ts` stub with working Meta Cloud API
- Endpoints: send-receipt, send-otp, send-alert, webhook receiver
- Message templates: receipt, OTP, stock alert, credit reminder

### 4. WhatsApp Receipt Delivery
- After gateway is live: wire receipt PDF → WhatsApp template send on order CONFIRMED
- Update `orders.whatsapp_status` tracking

### 5. Photo-to-Stock — [F-PHOTO-001](features/photo-to-stock.md)
- PWA-primary: camera capture of wholesale bill → Gemini Vision OCR → draft purchase
- New tables: `draft_purchases`, `draft_purchase_items`
- Fuzzy product matching against catalog

### 6. Stock Prediction — [F-PREDICT-001](features/stock-prediction.md)
- Uses existing `inventory_movements` data
- New tables: `stock_predictions`, `supplier_lead_times`
- Daily pg_cron job, dashboard, WhatsApp alerts

### 7. Marketplace Page — [F-MARKET-001](features/marketplace-page.md)
- Per-store Aman-style page at `[shopname].innovates.bt`
- New columns: `products.visible_on_web`, `entities.shop_slug`
- "Order via WhatsApp" button

### 8. WhatsApp Ordering — [F-WA-ORDER-001](features/whatsapp-ordering.md)
- Marketplace WhatsApp button → gateway → DRAFT order in POS
- Gateway parses incoming messages, fuzzy product match
- New columns: `orders.order_source`, `orders.whatsapp_message_id`

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
