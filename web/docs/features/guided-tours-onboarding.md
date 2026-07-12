# Feature: Role-specific guided onboarding tours (web + desktop)

**Status**: Planning → web first, then desktop.
Replaces the earlier ad-hoc tour clips with a structured, per-role set of onboarding tours that
(a) cover every role / sub-role / tier, (b) explain **every screen's components** (the gap last time),
(c) walk the key task flows, and (d) include the new features (GST reports, GST-exempt, receipt-scan
OCR, NQRC payment QR). Same delivery as before: **Playwright/Electron recordings with baked-in text
overlays** (title cards + lower-third step captions), no external post-processing.

---

## 1. What was missing last time
- Tours walked a happy-path flow but **did not explain the on-screen components** (what each sidebar
  item, panel, button and field does). New requirement: every screen gets a **component-callout pass**
  — highlight each key element and caption what it's for — before/alongside the task walkthrough.
- Coverage was partial (a few personas). New requirement: **one tour per role / sub-role / tier**,
  web and desktop **separately**, plus a dedicated desktop tour set.
- New features weren't covered.

---

## 2. Tour taxonomy

Personas and where they live:

| Persona | Surface | Platform |
|---|---|---|
| Customer | Marketplace `/shop` | Web |
| Rider | Rider portal `/rider` | Web |
| Platform admin | Admin console `/admin` | Web |
| Retailer vendor | POS `/pos` | Web **and** Desktop terminal |
| Wholesaler vendor | Console `/wholesaler` | Web (no desktop POS) |
| Distributor vendor | Console `/distributor` | Web (no desktop POS) |

Vendor **sub-roles**: OWNER, MANAGER, STAFF/CASHIER (ADMIN ≈ MANAGER). **Key finding from the role map:**
the sub-role only changes the UI on the **retailer POS** (its sidebar is sub-role-gated in
`components/pos/pos-sidebar.jsx`). The **distributor/wholesaler consoles are NOT sub-role-gated** — every
sub-role sees the same nav; permission differences are enforced server-side in `/api/console/*`. So a
separate per-sub-role video for the consoles would be identical footage — instead one tour per console
*tier* covers it, with a caption noting the sub-role permission differences.

Resulting **web** tour set (8), all `web/e2e/specs/tour-onboard-*.spec.js`:
1. `tour-onboard-customer` — marketplace
2. `tour-onboard-rider` — delivery queue
3. `tour-onboard-admin` — platform super-admin (incl. the new Payment-QR modal)
4. `tour-onboard-retailer-owner` (full — every sidebar item + all new features)
5. `tour-onboard-retailer-manager` (delta — no Team/Stores/Downloads)
6. `tour-onboard-retailer-cashier` (delta — Register + Orders only)
7. `tour-onboard-wholesaler` (console tier; notes sub-role perms)
8. `tour-onboard-distributor` (console tier; manufacturer cost/margin + distributor rate tier)

**Desktop** tour set (Electron terminal — the retailer rings cash in **POS mode**; distributor/wholesaler
terminals are forced **BACK_OFFICE**, stock + B2B + online orders, no cash sale — per
`api/admin/licenses`). Planned (built after web):
D1. Terminal RETAILER OWNER (POS + back-office: register, stock, shifts, settings) ·
D2. Terminal RETAILER CASHIER (POS mode — ring & take payment) ·
D3. Terminal BACK_OFFICE (distributor/wholesaler: stock, online orders, B2B-order fulfilment).

---

## 3. Overlay + component-callout design

Every tour is a recorded session with a fixed-position overlay layer injected into the page during
recording (same baked-in technique as before — no post-processing). Overlay vocabulary:

- **Title card** (full-screen, brief) — at tour start (persona + goal) and at each screen change
  (screen name + one-line purpose).
- **Component callout** — a highlight box/arrow over a specific element + a caption explaining it.
  Each screen runs a callout sequence over its key components (sidebar items, cart panel, payment
  methods, totals, action buttons, form fields, status badges…). **This is the piece that was missing.**
- **Step caption** (lower-third) — narrates each action as it happens ("Tap Online → the payment QR
  appears → the customer scans it → enter the journal number").

These are driven by the shared helper `web/e2e/lib/tour-overlay.js`. It already had `installTour`,
`titleCard`, `caption`, `clearCaption`, `beat`. **Added for this work:** `callout(page, selector,
{step,title,text})` — spotlights one element (gold ring + a box-shadow scrim that dims everything else)
and captions it, plus `clearHighlight`. This is the component-explanation primitive every onboarding
spec uses. (Desktop mirror `desktop/e2e/lib/tour-overlay.ts` gets the same addition for the desktop set.)

---

## 4. New features to weave in
- **GST Report** — the new `/pos/reports` (retailer) and console `Reports` screens: callout the
  date range, summary cards (output/input/net GST, taxable vs exempt), monthly table.
- **GST-exempt products** — the product-form toggle; show an exempt line ringing 0% at checkout.
- **Receipt-scan OCR** — on the ONLINE method, the "Scan receipt" button → camera → auto-filled
  journal number (with the amount-match hint).
- **NQRC payment QR** — on the ONLINE method, the dynamic QR shown before the journal step; and the
  OWNER/admin settings screen where the merchant QR is configured.

---

## 5. Implementation harness (reconcile with the current tour specs)
*To be finalized from the existing `web/e2e/**` tour specs + recordings (exploration in progress):*
- The current recording harness (Playwright config / project, video output dir, docker/xvfb for web;
  Electron `recordVideo` for desktop), and how existing overlays are injected — so the new reusable
  helper matches and the existing 3 raw tours are folded in / re-recorded.
- The seed/test accounts per role & sub-role & tier (and storage-state/login flow) each tour logs in as.
- Pacing/caption conventions already in use, so the new tours read consistently.

---

## Status (as built)

- **Overlay helper** ✅ — `callout()` (component spotlight + caption) added to `web/e2e/lib/tour-overlay.js`
  and mirrored in `desktop/e2e/lib/tour-overlay.ts`.
- **Web tours ✅ RECORDED (8/8)** — all `tour-onboard-*.spec.js` recorded to `web/e2e/recordings/tours/`
  (`.webm`, gitignored artifacts). Admin is split into 3 segments joined into `tour-onboard-admin.webm`
  (concat verified: 606.7s = exact sum of segments). Committed `ec2a617`. Sizes ~10–34 MB each.
  Fixes made during recording: over-scoped/absent selectors softened to tolerant `.waitFor().catch()`;
  `tour` project timeout 45 min + 20 s action timeout; regenerated storage states; seeded NQRC merchant
  config so the checkout QR renders; fixed the admin categories `property-config-modal` missing `Dialog`
  import (a real app bug).
- **Desktop tours ✅ RECORDED (3/3) via the chromium-vs-:3200 workaround.** Playwright's Electron `recordVideo`
  hangs in this sandbox (known issue), so instead of the Electron fixture the tours run as standalone chromium
  runners against the app's served UI: `web/desktop-tour-onboard-{owner,cashier,backoffice}.cjs` — launch the
  desktop app for services only (`desktop/launch-app.sh` → :3200 UI + :8090 PB), then a plain chromium (in the
  playwright docker, `--network host`) drives :3200 with the web overlay helper + `recordVideo`, seeding via PB
  REST. Produced `tour-onboard-desktop-{owner (14.7M),cashier (8.3M),backoffice (8.2M)}.webm`; owner frame-verified
  (full POS UI + working component spotlight). The 3 `.cjs` runners are committed; the Electron specs
  (`tour-onboard-desktop-*.spec.ts`) remain as the source-of-truth content. Owner = POS-mode full terminal;
  cashier = seeded cashier login, POS surface; back-office = reaches stock/online/b2b/customers by direct
  navigation (no Electron IPC mode-forcing possible from chromium).

## 6. Build order
1. **Reusable overlay helper** (title/screen/callout/step + highlight) — one style for all tours.
2. **Web owner-full tours** (customer, rider, admin, retailer/wholesaler/distributor owner) with full
   component-callout passes + new features.
3. **Web sub-role delta tours** (manager, cashier/staff per tier).
4. **Desktop tour set** (terminal owner/manager/cashier) once web is done.
