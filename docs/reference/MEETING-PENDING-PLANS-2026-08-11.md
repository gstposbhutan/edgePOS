# Pelbu — Implementation Plans for Pending Meeting Items

Detailed, actionable plans for every **not‑done** item from the 2026‑08‑11 meetings.
Companion to `MEETING-ACTIONS-2026-08-11.md` (the status list). Effort key: **S** ≤½ day · **M** 1–3 days · **L** ≥3 days / multi‑phase.

Ordered roughly by value ÷ effort (quick wins first).

---

## P1 — POS terminal cap: 3 per shop (D6)  ·  ✅ DONE (`86fde84`, migration 127)
**Shipped + verified live:** 3 terminals allowed, 4th → `409`, revoke frees a slot; entity‑level (null‑register) tokens excluded; re‑issue of an existing machine never blocked. `merchant_profiles.license_limit` (default 3) is the upgradable cap. The **1‑shop‑per‑owner** half of D6 rides with P2.

<details><summary>Original plan (for reference)</summary>

**Goal:** cap active licenses/terminals per shop at 3 (configurable, upgradable).
**Current state:** `POST /api/admin/licenses` mints a `terminal_tokens` row + `licenses` row per (entity, machine) with **no cap**. Super‑admin only.
**Approach:**
1. Migration: `pos.merchant_profiles.license_limit int NOT NULL DEFAULT 3` (thread through the `pos.entities` view + `entities_upd()` trigger, same pattern as `shifts_enabled`/`theme_*`).
2. In `POST /api/admin/licenses`, before minting: `count(*)` of **active** licenses for `entity_id` (`is_active = true`). If `>= license_limit`, return `409` `{ error: 'License limit reached (N). Upgrade to add more.' }`. Re‑issuing for an existing machine (adopt/reactivate path) must **not** count as new.
3. Surface the count + limit in the `GET` list so the issue form can show "2 / 3 used".
4. "Upgrade" = raise `license_limit` (super‑admin editable; later a billing hook).
**Files:** `apps/pos/app/api/admin/licenses/route.js`, new migration `127_license_limit.sql`.
**Acceptance:** 4th distinct‑machine license on a 3‑cap shop is blocked; bumping the limit unblocks; re‑issue for an existing machine still works.
</details>

## P2 — Admin‑only shop creation + 1 shop/owner (D7 + D6)  ·  ✅ DONE (`4fb8232`)
Shipped: `POST /api/admin/stores` was `SUPER_ADMIN or RETAILER` → **SUPER_ADMIN only** (this also enforces 1‑shop‑per‑owner, since owners can no longer add stores); the `/pos/stores` page hides the "Add Store" button + create‑first‑store copy for non‑admins; and `/api/auth/signup/vendor` (previously public, orphaned) now requires a super‑admin caller and no longer auto‑sessions as the vendor, so it doubles as the admin "create vendor + owner" tool. Verified live: retailer owner → 403, super‑admin create → 200, public signup → 403.

<details><summary>Original plan (for reference)</summary>

**Goal:** only SUPER_ADMIN can create shops/entities; remove owner self‑service; enforce **1 shop per owner** (base package, upgradable) — the second half of the D6 cap.
**Current state:** self‑service signup at `/api/auth/signup/vendor` (and `/wholesaler`) creates an entity; admin paths exist at `/api/admin/stores` + `/api/admin/entities`.
**Approach:**
1. Decide policy: disable public vendor signup entirely, **or** make it create a *pending* request an admin approves (cleaner for onboarding). Recommend **pending‑request** to preserve a self‑serve funnel.
2. Gate any `entities`‑insert path behind `role === 'SUPER_ADMIN'` (mirror the license route's guard). Remove/hide the owner‑facing "create shop" UI entry points.
3. Audit for other entity‑creation routes (onboarding, admin/stores) and ensure the guard is uniform.
**Files:** `apps/pos/app/api/auth/signup/vendor/route.js` (+ wholesaler), `admin/stores`, `admin/entities`, related UI.
**Acceptance:** a non‑admin cannot create a shop via any route; admin still can; existing shops unaffected. **👤** Shawn.
</details>

## P3 — Product modal: tighter layout, no scroll pain  ·  ✅ DONE (`15710d9`)
Shipped: widened `sm:max-w-2xl` → `sm:max-w-3xl`; paired the sold‑by‑weight + GST‑exempt cards 2‑up on desktop (shorter form); Cancel/Save is now a sticky full‑bleed footer so it's always reachable without scrolling. **⚠ visual‑only — not browser‑verified; recommend a device/browser pass** (see the verification caveat in the handover).

<details><summary>Original plan (for reference)</summary>

**Goal:** kill the scrolling/navigation pain Fame flagged on the product modal.
**Current state:** #33/#34 already widened it (`sm:max-w-2xl`). Remaining complaint = mobile‑first layout forcing scroll on desktop.
**Approach:** review `product-form.jsx` / `package-form.jsx` layout — replace single‑column mobile stacking with a desktop grid (2‑col field groups), raise max‑height, ensure the footer/actions are sticky so Save is always reachable without scrolling.
**Files:** `apps/pos/components/pos/products/product-form.jsx`, `package-form.jsx`.
**Acceptance:** a full product create/edit fits without vertical scroll on a 768px+ screen; Save always visible. **👤** Shawn.
</details>

## P4 — Credit checkout: inline customer search/add  ·  ✅ DONE (`b8743f0`)
Shipped: the payment modal's CREDIT branch now searches the store's khata customers (mobile/name) + "Add new customer" inline; completing puts the sale on that account's khata (replacing the separate email-OTP step). Verified live: create khata customer → CREDIT sale → khata debited the bill exactly.

**Goal:** on the checkout screen, when CREDIT is chosen, search/add the customer inline (no separate step).
**Current state:** credit requires selecting credit → searching/entering the customer email/phone to link khata.
**Approach:** embed a customer typeahead (search existing `entities` by phone/name via `/api/pos/entities?phone=` / supplier‑style search) directly in the payment panel, with an "add new" affordance that creates the khata party inline. Reuse the existing `customer-id-modal` logic but inline.
**Files:** POS checkout/payment components (`apps/pos/app/pos/page.jsx`, payment panel, `customer-id-modal.jsx`).
**Acceptance:** cashier completes a credit sale to a new/existing customer without leaving the checkout screen. **👤** Shawn.

## P5 — AI screenshot / journal‑number validation  ·  ✅ DONE (`652478f`)
Shipped: the vision OCR now flags non‑payment images (`isPaymentConfirmation`), requires a valid‑format journal number (≥5 alphanumeric chars), and nulls the reference + returns a specific reason otherwise — so the scan modal rejects invalid screenshots. Verified live (banana photo → rejected) + 8/8 unit cases. Applies to POS + marketplace.

**Goal:** on payment‑screenshot upload, extract the journal/transaction number and reject screenshots that don't match the expected format.
**Current state:** GLM vision payment‑verify already exists (`lib/vision/server-payment-ocr.js`, now working post‑#38). It checks amount match; needs journal‑number extraction + format validation.
**Approach:** extend the vision prompt to also return the journal/reference number; validate against the expected NQRC/bank pattern; reject + surface a clear error when absent/invalid. Store the extracted ref on the payment for audit.
**Files:** `apps/pos/lib/vision/server-payment-ocr.js`, the payment‑verify route + UI.
**Depends on:** #38 (done). **Acceptance:** a valid payment screenshot passes with the journal no. captured; a random/invalid image is rejected with a reason. **👤** Shawn.

## P6 — Shop / user‑account creation failures (Fame bug)  ·  Effort: M (unknown until repro)
**Goal:** fix the two failing create flows Fame reported.
**Current state:** unreproduced. Likely candidates given this session: a missing‑in‑`pos` RPC (all 9 now re‑homed — may already be fixed by migration 125), or a validation/permission error in the create route.
**Approach:** get a repro (which screen, exact error) → check server logs (`docker logs pelbu-pos-1`) for the failing route → fix. Re‑test after migration 125 first — it may already be resolved.
**Depends on:** repro from Fame — **will provide; do last** (per Shawn 2026‑08‑13). **Acceptance:** create shop + create user both succeed. **👤** Shawn.

## P7 — F10 key + keyboard‑shortcut mapping  ·  Effort: S–M
**Goal:** F10 works; map legacy shortcuts (Ransap/Easy Cloud) for staff muscle memory.
**Current state:** F11 fullscreen fixed (desktop `02d2be1`). F10 behaviour unconfirmed.
**Approach:** confirm intended F10 action + repro; wire it in the desktop main‑process/renderer keymap (same layer as the F11 fix). Separately, gather the legacy shortcut list from Fame and map onto existing POS actions.
**Depends on:** Fame repro + legacy shortcut list — **will provide; do last.** **👤** Shawn.

## P8 — FEFO / FIFO inventory + batch price layering (D4)  ·  ✅ DONE + browser‑verified (web)
Full design + decisions: `docs/pelbu/FEFO-FIFO-DESIGN.md`. Shipped across `5333028`→`ab8cdda`
(migrations 129–131). **Key finding:** per‑batch pricing + deduction already worked (cart lines carry
`batch_id` + the batch's `selling_price`; `deduct_stock_on_confirm` draws per batch) — so old stock
already sold at its old price and the deduction never needed a rewrite. What shipped:
- **Per‑product rotation** `pos.products.stock_rotation` — **None / FIFO / FEFO** (3‑way toggle, retailer
  + vendor forms). FEFO ⇒ expiry required on every batch (DB triggers `enforce_fefo_batch_expiry` +
  `enforce_fefo_switch`; opening‑batch expiry shown as required in the UI). None = no policy, no warning.
- **Auto‑allocation** — `GET /api/pos/allocate` (FEFO: soonest‑expiry nulls‑last; FIFO: oldest‑received)
  splits a quantity across batches at add **and** on in‑cart qty‑increase (keyboard + touch), each
  sub‑line at its own batch price.
- **Older‑batch warning** — non‑blocking amber banner when a cashier bills a non‑oldest FEFO batch,
  on **all** add paths incl. barcode scan + touch.
- **Explicit batch‑override picker** — "⇄ change batch" per cart line → pick any batch (re‑prices to it).
- **Concurrency hardening** (migration 131) — atomic guarded stock decrement for SALE movements; the
  oversell race is closed (loser's confirm rolls back).
- **⬜ Desktop parity** the only remainder — `docs/pelbu/DESKTOP-PARITY.md`.

<details><summary>Original plan (for reference)</summary>

**Goal:** consume stock first‑expiry‑first‑out (when expiry set), else first‑in‑first‑out; segregate batches at purchase; a new batch's price never reprices older remaining stock.
**Approach:** audit deduction; implement `ORDER BY expiry NULLS LAST, received_at`; sale price from the consumed batch; partial‑batch + negative‑stock guards.
</details>

## P9 — Dev / production environment split (D5)  ·  Effort: M
**Goal:** Fame pushes to a dev environment; Shawn reviews + merges to prod; prod only updates after verification.
**Current state:** branch model — `travel-platform` = dev work, `main` = live SilverPine. One box.
**Approach:** stand up a dev stack (separate compose project + subdomain, e.g. `dev.pos.pelbu.com`, or a second box) that auto‑deploys the dev branch; keep prod deploy behind an explicit merge‑to‑`main` + manual `docker compose up`. Document the review/merge gate so Fame's pushes never hit prod directly.
**Ties into:** D8 (AWS). **Acceptance:** a Fame change lands on dev only; prod changes require Shawn's merge. **👤** Shawn.

## P10 — AWS migration (D8) + infra handover to Rajiv (#39)  ·  Effort: L
**Goal:** move production off the current box to AWS; per‑client VM/bucket billing; hand VM/domain ownership to the partner (Rajiv) after Innovates' card clears.
**Current state:** self‑hosted box (Caddy + Docker Supabase + apps). `#39` blocked on the credit card (~3 working days).
**Approach (phased):**
1. AWS account = **Shawn's existing account**, with the partner added as an IAM team member / co‑owner (confirmed 2026‑08‑13) — billing stays with Shawn; partner gets access. (Not a separate partner‑owned account.)
2. Provision: EC2 for the app + Supabase (self‑hosted) or managed Postgres; S3 for images (already using Supabase‑S3 / `img.pelbu.com`).
3. Migrate DB + storage; bring up the stack; DNS/Caddy cutover per subdomain.
4. Per‑client isolation model (VM + bucket) as clients onboard.
5. Hand VM/domain to Rajiv.
**Note:** AWS egress may also **restore the international `api.z.ai` endpoint** (currently TCP‑blocked from this box; bigmodel is the interim). **Depends on:** credit card (#39). **Acceptance:** prod serves from AWS; partner owns the account/domain. **👤** Shawn + Fame + Rajiv.

## P11 — Banking phase (#40)  ·  Effort: L  ·  ⛔ blocked
**Goal:** journal extraction → trial balance → reconciliation; money‑in = revenue, money‑out (incl. NQRC) = expenses; 5% repair‑allowance policy.
**Blocked on:** transaction data for **3 banks** (HTML statements, ~1 week after a transaction) from the partner — **requested, pending** (2026‑08‑13). Plan the HTML‑statement parser + double‑entry mapping once sample statements arrive. **👤** Shawn (needs data).

---

## Travel / Hotel side (mostly Fame‑owned)

## P12 — PDF itinerary size reduction  ·  Effort: S–M  ·  👤 Fame
40–50 MB PDFs. Lower the generator's output quality from max; pre‑resize/compress images (target ≤2000px, JPEG q≈0.7) before embedding; consider rasterising pages at a sane DPI rather than max. Target a few MB per itinerary.

## P13 — HTML itinerary for client "Miss Alishna" + servable endpoints  ·  Effort: S  ·  👤 Group
Generate the itinerary as HTML and publish it to the client‑servable endpoint(s) so it renders correctly (vs. the heavy PDF). One concrete client deliverable; also the pattern for shareable itinerary links.

## P14 — Travel/hotel platform (itemized from the 15:42 discussion)  ·  Effort: L (multi‑piece)
The marketplace is not one task — the transcript describes several discrete pieces. **Note:** this repo already has a travel app (`apps/travel`, incl. `admin/itineraries`) and a Hotel PMS (`apps/pms`); confirm which pieces are Shawn's (this monorepo) vs Fame's separate hotel software before building.

- **P14a — Itinerary builder / trip dashboard.** Guest names, transport pickup & drop‑off, travel themes, hotel selection, **day‑by‑day** itinerary, **shareable review link**. Likely enhances the existing `apps/travel/admin/itineraries`. Effort M–L. 👤 Shawn/Fame.
- **P14b — Operation deck: guides & drivers.** Select tour guides + drivers from a DB of ~2,300 registered individuals. Effort M. 👤 Fame/Shawn.
- **P14c — Live hotel room availability + hotel‑login link.** On hotel selection, show live availability and a link into the hotel's login (ties to `apps/pms`). Effort M. 👤 Shawn/Fame.
- **P14d — Automated itinerary pricing.** Auto‑calculate trip cost from variables (transport, hotel, etc.) instead of manual (the Nu 1,49,500 example). Effort M. 👤 Fame/Shawn.
- **P14e — Commission‑based marketplace billing.** Unified hotels + guests + guides; hotel manages the guest's charges/billing; platform takes commission. Effort L. 👤 Shawn/Fame.
- **P14f — Match the agreed hotel‑website aesthetic** for the storefront/marketplace. Effort S–M. 👤 Fame.

## P15 — POS profitability analytics  ·  Effort: M  ·  👤 Shawn
**Goal:** "most/least profitable items" analysis once transaction history exists (raised 15:42).
**Current state:** a reports area exists (`apps/pos/app/pos/reports`, `/api/pos/reports`, `/api/console/reports`) — verify whether item‑level margin/profitability is already there.
**Approach:** if absent, add a profitability view — per‑item margin = revenue − cost (from batch cost layers, see P8) over a period; rank best/worst sellers + margins. Depends on cost data being captured (product cost fields shipped in #33). **Acceptance:** owner sees top/bottom items by profit for a date range.

## P16 — Verify multi‑register + back‑office management  ·  Effort: S (verify)  ·  👤 Shawn
15:42: owners should manage **multiple** cash registers + back‑office systems under one account, of any type (POS or BACK_OFFICE). Licenses/terminals + the BACK_OFFICE mode already exist (and now the 3‑terminal cap, P1). **Action:** confirm the owner UI lets an owner see/manage all their registers of both types; close any gap. Mostly a verification pass.

---

## Cross‑cutting — resolved 2026‑08‑13
- **Partner identity** → **two partners** (Innovates = POS; Fame Digital = POS + travel).
- **License cap** → **1 shop + 3 terminals (any type)**; terminal cap ✅ done (P1); 1‑shop → P2.
- **AWS ownership** → **Shawn's account**, partner added as co‑owner.
- **Meeting‑notes transcripts** → leave untracked.

## Still open
- **Repros** for shop/user‑create (P6) + F10 (P7) — Fame to provide; **do last.**
- **3‑bank statement samples** (P11) — **requested, pending.**
- **Handover domain** (P10/#39) — confirm `pos.pelbu.com`.

*Generated 2026‑08‑13.*
