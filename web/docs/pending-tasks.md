# NEXUS BHUTAN — Open / Pending Tasks (session handoff)

**Last updated:** 2026-07-09

### 2026-07-09 session (merged to `main`, PR #46)
- **Rider delivery queue** — replaced the one-rider-one-order model with even, location-aware
  auto-dispatch (least-loaded on-shift rider, GPS-proximity tiebreak, backlog drain); rider works a
  queue in any order. **Email-OTP rider login** (+ unique-phone registration); `getRiderContext` fix
  (riders have no `user_profiles`, so the shared `getAuthContext` had 401'd every rider API).
  **Undeliverable** orders surfaced to customer/vendor + customer self-cancel. Vendor order email now
  carries full customer details. Migrations **102** (queue/geo) + **103** (dispatch_state).
- **Desktop online-order management (v1.3.0)** — terminal now manages incoming marketplace orders
  (cloud `GET/POST /api/sync/orders` on the terminal token), mirrors them into local PB (`online_orders`,
  PB migration 017), fires **native notifications**, and shares the **rider pickup OTP** from the
  counter, with confirm/cancel. Installer build + Releases publish still to do (operator).

## Shipped since (2026-06 → 2026-07, on `feat/web-pos-ui-overhaul`, web live)
- POS-core batch (web + desktop): optional shifts, invoice discount pre-GST, per-line rate tier,
  per-line salesperson, **web weighed-goods full parity**. Desktop parity released **v1.1.4**.
- Consumer marketplace: public/unauthenticated `/shop` + marketing, **featured-only catalog**,
  vendor onboarding (per-vendor `delivery_mode` rider bypass), self-serve **Excel product import**,
  manager **order cancel (full/partial) + stock return**. See `features/marketplace-vendor.md`.
- **AI product enrichment** (z.ai/GLM): metadata + default images + video + **admin HSN-category
  property templates**. See `features/product-ai-enrichment.md`.
- **Email via SendGrid**: GoTrue auth mail + order receipts + vendor order/low-stock alerts
  (`noreply@app.pelbu.com`, domain-authenticated `app.pelbu.com`).
- WhatsApp gateway gained a **Twilio** provider (env-gated, parked pending creds); `MOCK_WHATSAPP` for OTP testing.

### 2026-07-07 session (merged to `main`, PRs #40–#43)
- **Public marketing site** — `/` home + `/features` hub & 4 deep-dives + `/sell`/`/about`/`/contact`/`/terms`,
  shared nav/footer, AI-generated imagery (`public/marketing`), **attributed to Innovates Bhutan**
  (team/contact/company from innovates.bt); contact form → their inbox. Marketplace shares the header;
  nav is auth-aware.
- **Sell-side fold** — the POS is the single sell-side entry; `/salesorder` retired. Alt+Q "Save as draft"
  → **Sales Order** or **Quotation** (`orders.is_quotation`, migration 098) on **keyboard + touch**.
  POS complete-sale stays the Sales Invoice.
- **Buy-side** — PO cancel-with-reason, editable PO line cost, and **per-line + bill discounts on the
  Purchase Invoice** (net landed cost → stock valuation; net → khata). PO carries no batch info; batch +
  cost captured at receipt (PI); one PO → many partial PIs.
- **Credit identity → email** — consumer khata keyed by `debtor_email` (migration 099), check-only
  `/api/auth/email-otp/check`, `CustomerOtpModal` verifies by email, both POS credit flows resolve khata
  by email. Fixed CREDIT purchase-invoice confirm (migration 100) + legacy khata email backfill (migration 101).
- **Desktop v1.2.0** — Sales Order vs Quotation parity (PB migration 016 `is_quotation` + sync mapping);
  `desktop/CHANGELOG.md` added. (Salesperson/rate-tiers/discounts already at parity.)
- Nav: Orders & Purchases as separate left-nav items; redundant POS header logos removed; touch top-bar
  trimmed to actions; **WhatsApp sales sub-tab removed** (WhatsApp parked); rider login-home fixed.

## New follow-ups from this work
- 🟠 **Desktop `is_quotation` runtime-verify** — migration 016 on terminal startup + live offline→cloud
  sync of the flag need a real Electron/PocketBase build before publishing v1.2.0. See
  `desktop/docs/pelbu-desktop-parity-plan.md` (P5).
- 🟠 **Production WhatsApp sender** — register a Twilio WhatsApp sender + approved templates (gateway ready).
- 🟠 **Point `pelbu.com` DNS at the box**, then set `SITE_URL`/`API_EXTERNAL_URL` to the real domain
  (email links + OTP redirects still use the `nip.io` staging host). Also activates Google/Facebook OAuth.
- 🟢 **Legacy khata email** — 6 of 13 consumer khata accounts had no linkable email (migration 101 did 7);
  they stay phone-resolvable and need manual `debtor_email` association.
- 🟢 **Marketing:** confirm `bhutaninnovates@gmail.com` (search-sourced) is the right contact; add a
  Privacy Policy page (the Terms references one); set `CONTACT_TO` for the contact form.
- 🟢 Web-side barcode-label printing (label maker is desktop-only today).
- 🟢 POS-counter low-stock alert trigger (low-stock email currently fires only on marketplace checkout).
- 🟢 Delete the full-access SendGrid key (keep the restricted `mail.send` key); add a DMARC record.

### ✅ Cleared this session
- Web weighed-goods touch parity, marketplace + AI enrichment + SendGrid email (all shipped earlier and
  now live on `main`). CREDIT purchase-invoice confirm bug — **fixed** (migration 100).

---
_Original 2026-06-09 handoff below._

**Original last updated:** 2026-06-09
**Baseline:** `origin/main` @ `ad938b0` (+ local hygiene commits since).

This session shipped (all on `main`): Supabase migration consolidation, super-admin + per-role
consoles, retailer-desktop **licensing + provisioning + bootstrap**, **weighed goods + label
maker**, `pocketbase.exe` packaging (+ NSIS installer), and the desktop↔web **parity/sync-contract
fixes**. The full activate → bootstrap → POS flow was verified on screen.

This file records what's **not** yet done. Detailed designs live in the per-area plan docs
(linked per section). Priority: 🔴 launch-blocker / security · 🟠 important · 🟢 deferred / nice-to-have.

---

## A. Operational & deployment
> **Deployment model — SINGLE INSTANCE, in production testing.** This box is the only running
> environment (there is **no** separate staging/prod): self-hosted Supabase + web + WhatsApp/logistics
> services in Docker, with terminals syncing to it. `supabase.pelbu.com` routes to this box's Kong. So
> "the DB" = this box's `supabase-db`; there is nowhere else to promote to. **Currently under
> end-to-end testing — not yet live to real customers.**
- 🔴 **Rotate + purge the committed prod Supabase secrets.** The `service_role` key + DB password were
  committed earlier (P0-7). Rotate them in Supabase and purge from history. *(Never touched/used by the assistant.)*
- ✅ **Migrations are applied directly to this instance.** App `public` migrations run against this box's
  `supabase-db` via raw `psql` (there is no `supabase db push`/`schema_migrations` tracking table — only
  GoTrue/realtime keep their own). The DB is current through `103_orders_dispatch_state.sql`. Apply any
  new migration here; note `102` carries a one-time data `UPDATE`, so verify object-by-object rather than
  blindly re-running a file.
- 🟠 **Test data cleanup — deferred until go-live.** During testing, seed/test data is intentionally
  kept (e.g. the 20 `rider01–20@demo.bt` riders + `MKT-2026-*` test marketplace orders). Purge it only
  once everything works end-to-end without failure, right before going live.
- 🟠 **Set the production cloud URL on both sides** before building/shipping:
  - Web: `NEXT_PUBLIC_APP_URL` = real cloud domain (the license issuer derives the ingest URL from it).
  - Desktop: `DEFAULT_CLOUD_URL` in `desktop/electron/config.js` = same domain, then `npm run electron:build:win`.
    *(Dev override: `NEXUS_CLOUD_URL` env var.)*
- 🟠 **Convert the desktop-release CI to GitHub OIDC** — `.github/workflows/desktop-release.yml` currently
  authenticates to S3 with the `edgepos-ci-releases` IAM user's long-lived access keys (GitHub secrets
  `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`). Replace with an IAM OIDC provider + role (web-identity trust
  scoped to this repo) and `configure-aws-credentials` `role-to-assume` so no keys are stored. Reuse the same
  least-priv S3 policy (`/home/ubuntu/ci-releases-policy.json`). **Until then: rotate the current key** — it
  was shared in plaintext during setup.

## B. Licensing & provisioning hardening — `provisioning-and-licensing-plan.md`
- ✅ **Single-instance lock** — DONE (desktop v1.1.1): `app.requestSingleInstanceLock()` in
  `desktop/electron/main.js`; loser quits before booting PB/windows, winner focuses on `second-instance`.
- 🟠 **Authenticode signing** — installer is test-signed via the bundled `signtool`; ship with a real
  code-signing cert so SmartScreen/Defender don't block first run.
- 🟢 **Desktop online revocation** — `GET /api/license/status` exists; wire a periodic online
  revocation check into the terminal (offline signature + expiry + machine-lock enforced now).
- 🟢 **Per-shop seat / device limits** — `tier` (STANDARD/TRIAL/ENTERPRISE) is informational; nothing
  caps how many terminals can be licensed per entity. Enforce if commercially needed.
  *(Multi-shop itself is handled: each shop = its own entity → its own machine-locked `.lic` + sync token + bootstrap.)*

## C. Weighed goods & label maker — `desktop/docs/label-maker-plan.md`
- 🟠 **Web touch-POS weighed-checkout parity** — the weigh modal + `sold_by_weight` handling is on the
  **desktop** POS only; port it to `web/app/pos/touch` and expose `sold_by_weight` in `/api/products/sellable`.
- 🟢 **A4 / sticker-sheet label mode** (single-label only today).
- 🟢 **Price-embedded EAN-13** for weighed goods (Code128-of-SKU today).
- 🟢 **Digital scale integration** (manual weight entry today).
- 🟢 **Persist generated barcodes** back to products; a "print labels for new products" batch.

## D. Supply-chain roles — `super-admin-console-plan.md`, `features/distributor-role.md`
- 🟠 **Distributor/wholesaler favourites/saved overlay** — broad-visibility browse + a saved list (the
  deferred distributor/wholesaler-scope console work; landing pages exist, the overlay doesn't).
- 🟠 **Warehouse management** for wholesaler/distributor (their locations are *warehouses*, not POS stores).
- 🟠 **Scoped RLS** for distributor/wholesaler (the policies in `distributor-role.md` aren't applied).
- 🟢 **Vendor-scoped licensing** — let distributors/wholesalers issue `.lic` to their downstream
  retailers (super-admin-only today; needs `licenses.vendor_id` + a scope resolver).
- 🟢 **Impersonation** (super-admin acting as an entity).
- 🟢 **Onboarding credential delivery** — WhatsApp vs email/temp-password (the gateway is a separate service).

## E. Sync follow-ups — `desktop-web-parity-fix-plan.md`
*(Terminal→cloud push + reconciliation for orders / order_items / inventory_movements / khata is built
and locally verified. Remaining:)*
- 🟠 **Signature verification on ingest** — verify `digital_signature` in the sync path (belongs in the
  ingest route / `sync-core`). *(Response already reports `ordersUnverified`.)*
- 🟠 **Synced credit-sale khata balance** — synced orders skip the cloud `khata_debit_on_confirm`
  trigger (origin-guard), so credit-sale balances need reconciling from the synced `khata_transactions`
  (a txn-driven balance, or the worker applying the delta).
- 🟢 **Shifts sync** + **`product_batches` (batch-level) stock** sync (terminal has no batch data yet).

## F. QA
- 🟠 **Packaged-build GUI pass** — `desktop/docs/qa-packaged-build.md`: install the NSIS, click through
  the (file-upload) activation, confirm POS + weigh modal + label printing on **real hardware**. The
  data/licensing/bootstrap flow is already automated-verified.

## G. Repo hygiene
- ✅ **Done (2026-06-09):** stopped tracking `pb/pb_data/*.db` (runtime DB) + gitignored.
- 🟢 **Delete** the redundant local branch `feat/desktop-licensing-and-platform` (== `main` after the FF merge).
- 🟢 **Remove** `web/supabase/_consolidation_backup/` (redundant with git history; left untracked).
- 🟢 **Linux `pb/pocketbase`** is still tracked; can be untracked (`git rm --cached`) + fetched via
  `npm run pb:fetch` for a fully binary-free repo.
- 🟢 **Dev note:** `:3000` collides with another local app; use `NEXUS_SERVE_BUILT=1` to serve the
  desktop dev UI from the built `out/` on `:3200`. Production is unaffected.

---

### Runbook reminders
- **Stand up dev:** local Supabase (`supabase start`) → web `npx next dev -p <port>` → desktop
  `npm run electron:dev` (or `NEXUS_SERVE_BUILT=1 NEXUS_FORCE_LICENSE=1 electron .` to exercise the gate).
- **Issue a `.lic`:** web super-admin (`admin@nexus.bt` / `test1234`) → **Licenses** → use the pending
  terminal → pick the RETAILER store → Issue (ingest URL auto-derived). Desktop activation → upload `.lic`.
- **Desktop POS login (local):** `admin@pos.local` / `admin12345`.
