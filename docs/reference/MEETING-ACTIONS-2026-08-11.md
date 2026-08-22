# Pelbu — Meeting Actions: Status & Plan (2026‑08‑11)

Consolidated, tracked list of every **decision** and **action item** from the two
stakeholder meetings on 2026‑08‑11, with current status. Fulfils the 15:42 action
item *"compile meeting notes into a formal list of actionable todo tasks."*

- **Meeting A — 14:00 IST, partner "Innovates"** — web‑POS training/validation
  (orders, discounts, multi‑cart, khata, quotations, riders, NQRC QR). Notes:
  `docs/Pelbu discussion  - 2026_08_11 14_00 IST - Notes by Gemini.md`.
- **Meeting B — 15:42 IST, partner "Fame Digital"** — broader: POS **and** the
  travel/hotel side. Notes: `docs/Pelbu discussion  - 2026_08_11 15_42 IST - Notes by Gemini.md`.

> **Two separate partners** (confirmed 2026‑08‑13): Innovates (A) = POS retail;
> Fame Digital (B) = POS + travel/hotel. Backlogs are tracked together here but owned separately.

_Status as of 2026‑08‑13. Legend: ✅ done · 🟡 in progress / partial · ⛔ blocked (external) · ⬜ not started · 👤 owner._

---

## 1. Decisions (aligned)

| # | Decision | Source | Status |
|---|----------|--------|--------|
| D1 | Cashier shifts + cash‑drawer reconciliation → **per‑vendor configurable**, off by default | A | ✅ shipped (#35) |
| D2 | Returns model: partial + full refunds, cancellation, **REPLACE** flow; **no exchange** (= cancel + new order) | A | ✅ shipped (#36) |
| D3 | **Vendor custom colour themes** for the POS UI | A | ✅ shipped (#37) |
| D4 | Inventory: **FEFO** when expiry exists, **FIFO** otherwise; batch segregation at **purchase** time; new‑batch price does **not** reprice old stock | B | ✅ shipped + **browser‑verified** (web) — per‑product None/FIFO/FEFO, auto batch allocation + per‑batch pricing, older‑batch warning, batch override, race‑safe deduction (P8, migrations 129–131). Desktop parity pending. |
| D5 | **Separate dev + production** environments; merge to prod only after dev verification | B | 🟡 partial (branch model in place; formal dev/prod split pending) |
| D6 | **POS licensing: 1 shop + 3 terminals combined (any type)** per owner; upgrade for more | B | ✅ terminal cap shipped (P1, migration 127); **1‑shop limit shipped (P2, `4fb8232`)** — owners can no longer add stores |
| D7 | **Shop creation → admin‑only** (remove owner self‑service) | B | ✅ shipped (P2, `4fb8232`) — `POST /api/admin/stores` + `/api/auth/signup/vendor` gated to SUPER_ADMIN; owner "Add Store" UI hidden. Verified live: owner→403, admin→200 |
| D8 | **Hosting → AWS** (off Vercel), ~$50/mo, per‑client VM/bucket billing | B | ⬜ not started (infra) |
| D9 | **Remove day/night mode** | B | ✅ shipped |

---

## 2. Meeting A action items (Innovates) — tasks #32–#42

| ID | Item | 👤 | Status | Reference |
|----|------|----|--------|-----------|
| #32 | Owner **batch deletion** in inventory UI | Shawn | ✅ | `eebca53` (DELETE /api/inventory/batches/[id]; reversing LOSS movement; owner‑only) |
| #33 | **Price/cost fields** on product create | Shawn | ✅ | `1b54b9c` |
| #34 | **Wider product modal** | Shawn | ✅ | `1b54b9c` (`sm:max-w-2xl`) — see also D‑B "remove mobile theming" (§4) |
| #35 | **Per‑vendor shifts/drawer toggle** (off by default) | Shawn | ✅ | `acd7976` + **migration 123** |
| #36 | **Returns** — refund / cancel / **replace** | Shawn | ✅ | `f6796f7` + `c143312`; **smoke‑tested** this session; partial‑refund stock bug fixed `4719543` (**migration 126**) |
| #37 | **Vendor colour themes** | Shawn | ✅ | `2df1364` + **migration 124** (6 presets + custom brand colour, flash‑free) |
| #38 | **GLM/ZAI key swap** | Shawn/Fame | ✅ | account funded; `ZAI_BASE_URL`→bigmodel (api.z.ai blocked from box); image retry `bc87544`. Enrichment + image‑gen + vision all verified live |
| #39 | **Infra handover to Rajiv** (VM/domain ownership) | Shawn/Rajiv | ⛔ | after Innovates' credit card clears (~3 working days). ❓ confirm domain (`pos.pelboo.app`?) |
| #40 | **Banking phase** — journal extraction / trial balance / reconciliation | Shawn | ⛔ | needs transaction data for **3 banks** (HTML statements ~1wk post‑txn); 5% repair‑allowance policy |
| #41 | **Desktop owner‑login** | Shawn | ✅ server‑side | root cause = **migration 122** (RPCs → pos schema). Full license→activate→bootstrap→login chain verified from the box; owner mirrored with bcrypt web password. ⬜ *remaining:* Fame click‑confirm on the Electron client |
| #42 | zhipuai default‑export crash (payment‑verify + bill‑OCR) | Shawn | ✅ | `ad75f63` |

**Bonus fixes this cycle:** `ba30208` opening‑stock double‑count; **migration 122** re‑homed 8 RPCs; **migration 125** (`2ae3fed`) re‑homed the **9th** RPC `next_pos_order_no` — it had been missed, so **web checkout was 500‑ing on every sale** (found while smoke‑testing #36). All 9 POS RPCs now confirmed in the `pos` schema.

---

## 3. Meeting B action items (Fame Digital)

| Item | 👤 | Status | Reference / note |
|------|----|--------|------------------|
| **Fix modal close button** (X does nothing) | Shawn | ✅ | `1e94fa8` — **web‑only**; 20 controlled `<Dialog>` were missing `onOpenChange`. Awaiting your browser confirm |
| **Remove day/night theme toggle** | Shawn | ✅ | `afe19a5` (desktop branch) — was a dead button (`forcedTheme="light"`) |
| **Enlarge POS top nav bar icons** (both apps) | Shawn | ✅ | web `5885f50` + desktop `7a2d861` (h‑4 → h‑5) |
| **Configure GLM** / override deploy key | Fame/Shawn | ✅ | folds into #38 (GLM repointed + verified) |
| **Document tasks** (this list) | Shawn | ✅ | this document |
| **Set up dev/prod environments** | Shawn | 🟡 | branch model exists (`travel-platform`=dev work, `main`=live). Formal dev/prod box + review/merge gate still to formalise (ties to D5/D8) |
| **Create AWS account + migrate prod** | Shawn/Fame | ⬜ | see Plan §5 |
| **Specify exact license limit** | Fame | ⛔ | waiting on Fame; then enforce (D6) |
| **Register AWS; deploy hotel software** | Fame | ⬜ | Fame‑owned |
| **PDF itinerary size** (40–50 MB → smaller) | Fame | ⬜ | travel side — lower generator quality + pre‑resize images |
| **HTML itinerary for client "Miss Alishna"** + servable endpoints | Group | ⬜ | travel side |

### Bugs Fame reported
| Bug | Status | Note |
|-----|--------|------|
| Modal close button broken | ✅ | `1e94fa8` (web) |
| Day/night toggle broken | ✅ | removed `afe19a5` |
| Can't exit fullscreen / **F11** | ✅ | desktop `02d2be1` (already fixed pre‑session — main process owns F11) |
| **F10** non‑functional | ⬜ | not yet confirmed/reproduced — needs Fame repro |
| **Shop creation fails** | ⬜ | not investigated — see Plan §6 |
| **User‑account creation fails** | ⬜ | not investigated — see Plan §6 |

---

## 4. Other threads (context / smaller asks)

- **Product modal navigation** — remove mobile‑oriented theming that causes scrolling. ✅ shipped (P3, `15710d9`): widened to `sm:max-w-3xl`, paired the sold‑by‑weight/GST‑exempt toggles 2‑up, and made Cancel/Save a sticky footer so it's always reachable. *(visual‑only; recommend a browser pass — see verification caveat.)*
- **Product‑register overhaul** (Fame, 2026‑08‑13) — ✅ shipped web + deployed (`882c679`/`c2ee0c1`/`497a303`): Add/Edit product modal → **80% width**; **HSN code = searchable/filterable picker** (`/api/hsn` q+chapter+category, new `?facets=1`) that auto‑derives category/GST on save; **Brand/Manufacturer = shared‑global "select or add" combobox** (`/api/products/brands`, common to all vendors/wholesalers/distributors); **Admin → Manufacturers** page merges/dedups brands. Applied to the retailer *and* wholesaler/distributor console forms. **⬜ DESKTOP PARITY PENDING** — same changes needed on the `desktop` branch (`desktop/components/pos/product-form-modal.tsx`, local PocketBase → no `/api/hsn` offline; needs a sync/online‑fetch design pass).
- **Price editing stays in the Product section** (not Inventory) — already the case. ✅
- **Credit checkout** — want inline customer search/add on the checkout screen. ⬜
- **AI screenshot / journal‑number validation** — extract journal no. + reject invalid payment screenshots. 🟡 (GLM payment‑verify exists; journal‑number rule pending.)
- **4K camera** for client face‑recognition — hardware requirement. 👤 Fame.
- **Travel/hotel platform** — itemized into discrete pieces in the plans doc: **P14a** itinerary builder (day‑by‑day + shareable link), **P14b** operation deck (guides/drivers from ~2,300), **P14c** live hotel room availability + hotel login, **P14d** automated itinerary pricing, **P14e** commission billing (hotel bills guest), **P14f** hotel aesthetic. ⬜ (this repo already has `apps/travel` + `apps/pms` — some are enhancements).
- **POS profitability analytics** (most/least profitable items) → P15 🟡 (reports module exists; verify item‑level margin).
- **Multi‑register + back‑office management** under one owner → P16 (mostly exists; verify).
- **Map existing keyboard shortcuts** (Ransap / Easy Cloud muscle memory) → P7. ⬜

---

## 5. Plan — remaining POS/infra work

1. **AWS migration (D8, #39)** — biggest infra item. Provision AWS account → move the Docker/Supabase box (or per‑client VMs + S3 buckets) → repoint DNS/Caddy → hand VM/domain to Rajiv once Innovates' card clears. Sequence after the credit‑card step so ownership/billing lands with the partner. *(Note: `api.z.ai` is currently unreachable from the box — a proper AWS egress may restore the international GLM endpoint; until then bigmodel stays.)*
2. **Dev/prod split (D5)** — formalise: dev box/branch that Fame pushes to, Shawn reviews + merges to prod. Today `travel-platform` is dev work and `main` is the live SilverPine site; extend that into an explicit prod deploy gate.
3. **3‑license limit (D6)** — once Fame gives the number, enforce in `POST /api/admin/licenses` (count active `terminal_tokens`/licenses per entity; block/redirect to upgrade past the cap). Small, well‑scoped.
4. **Admin‑only shop creation (D7)** — remove the owner‑facing "create shop" path; gate entity creation behind SUPER_ADMIN. Verify no self‑service signup route creates shops.
5. **FEFO/FIFO inventory (D4)** — audit current stock‑deduction (batches, `orders_deduct_stock`); implement expiry‑ordered consumption with per‑batch price retention. Larger change — needs a design pass on the batch model first.
6. **Shop / user creation failures** — reproduce the two create flows (admin console) and fix. Likely related to the same schema/RPC or validation issues; needs a repro from Fame or a walk‑through of the create paths.

## 6. Open questions / needs input
- **Domain** for handover: transcript "pos.pelboo.app" — likely `pos.pelbu.com`; confirm. _(still open)_
- **Repros** for F10 and the shop/user‑create failures — Fame to provide (do these last).

_Resolved 2026‑08‑13:_ **Two separate partners** (Innovates = POS retail; Fame Digital = POS + travel). **License cap = 1 shop + 3 terminals (any type)** — terminal cap **shipped** (P1). **AWS:** partner added to Shawn's own AWS account as team member / co‑owner (not a separate account). **Bank data (P11):** requested, pending. **Meeting‑notes transcripts:** leave untracked.

---

*Generated 2026‑08‑13. Commit refs are on `travel-platform` unless marked "desktop branch."*
