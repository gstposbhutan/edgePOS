# NEXUS BHUTAN — Open / Pending Tasks (session handoff)

**Last updated:** 2026-06-09
**Baseline:** `origin/main` @ `ad938b0` (+ local hygiene commits since).

This session shipped (all on `main`): Supabase migration consolidation, super-admin + per-role
consoles, retailer-desktop **licensing + provisioning + bootstrap**, **weighed goods + label
maker**, `pocketbase.exe` packaging (+ NSIS installer), and the desktop↔web **parity/sync-contract
fixes**. The full activate → bootstrap → POS flow was verified on screen.

This file records what's **not** yet done. Detailed designs live in the per-area plan docs
(linked per section). Priority: 🔴 launch-blocker / security · 🟠 important · 🟢 deferred / nice-to-have.

---

## A. Operational & deployment — do at production rollout
- 🔴 **Rotate + purge the committed prod Supabase secrets.** The production `service_role` key + DB
  password were committed earlier (P0-7). Rotate them in Supabase and purge from history. *(Never
  touched/used by the assistant.)*
- 🔴 **Apply the consolidated migrations to PROD Supabase** — `web/supabase/migrations/001_schema.sql`
  + `002_seed.sql` + `003_sold_by_weight.sql`. Verified on the **local** stack only; prod apply is
  operational/user-owned (per the no-prod-migrations rule).
- 🟠 **Set the production cloud URL on both sides** before building/shipping:
  - Web: `NEXT_PUBLIC_APP_URL` = real cloud domain (the license issuer derives the ingest URL from it).
  - Desktop: `DEFAULT_CLOUD_URL` in `desktop/electron/config.js` = same domain, then `npm run electron:build:win`.
    *(Dev override: `NEXUS_CLOUD_URL` env var.)*

## B. Licensing & provisioning hardening — `provisioning-and-licensing-plan.md`
- 🟠 **Single-instance lock** — add `app.requestSingleInstanceLock()` in `desktop/electron/main.js`;
  without it a 2nd instance clashes on the userData/cache dir (Chromium "cache Access denied").
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
