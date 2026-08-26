# Counter UI — back-office reskin: plan and state

**Date**: 2026-08-26 · Supersedes the earlier draft that planned a greenfield component library.

> **State: SHIPPED.** Web is live on pos.pelbu.com and desktop 1.6.0 is released to stable. The
> "What remains" list below is kept because its reasoning still holds, but the items are done —
> see `docs/HANDOVER.md` for what is actually true now, and `REFERENCE-SCREEN-GAP.md` for what
> was deliberately NOT built and why.

## What this corrects

The first draft of this plan proposed building a new component library and a demo route. That was
wrong: the counter shell already existed. Commit `58aae63` (2026-08-23) put the till in the
counter's clothes — `components/pos/keyboard/` (till-bar, cart-table, shortcut-bar, unit-sheet,
office-menu), `lib/pos/shortcuts.js` and `lib/pos/office-menu.js`, with e2e specs. The work
remaining was never the till; it was the BACK OFFICE that the till's Alt+O menu points at, which
was still wearing the old console look.

So the shape of this job is: extend the counter's language to the office screens, reusing the
letter menu and the key-rail idea already in the tree.

## Naming

**The competitor is never named in code, UI, docs or commit messages.** The incumbent ERP is "the
incumbent" or "the convention"; our own language is "the counter" (till) and "the office" (back
office). Prior mentions are scrubbed across `web/`, `desktop/`, docs and memory.

One deliberate exception is left for a human decision: `web/lib/marketing/content.js` states
Innovates' real business credential as an implementation partner for that ERP. That is a factual
claim about the partner's history, not our product imitating anyone — Shawn's call whether it
stays. Git history still carries the old name in commit messages; rewriting that was not attempted.

## What was built (2026-08-24)

Shared frame, in `web/components/pos/office/`:

| Piece | File | What it does |
|---|---|---|
| `OfficeShell` | `office-shell.jsx` | Orange band (crumb › title, date), scrolling body, key rail. Answers Esc → counter, Alt+O → letter menu. |
| `OfficeKeyRail` | `office-shell.jsx` | Prints every key the screen answers; an unbuilt key is dimmed and says so. |
| `OfficeGrid` | `office-grid.jsx` | The register: gray heads, banded rows, ↑↓/Home/End/Enter cursor, right-aligned numerics, totals foot. Content-width by default. `rowAttrs` keeps existing e2e hooks. |
| `OfficeForm` / `OfficeSection` / `OfficeField` | `office-form.jsx` | The two-column master sheet. **Not yet used by a screen.** |
| Key rails | `web/lib/pos/office-keys.js` | `REPORT_KEYS`, `MASTER_KEYS`, `withHandlers()`. |
| Tokens | `web/app/globals.css` (`.office-ui`) | Palette as variables — density and layout carry the recognition, so colour stays tunable per vendor theme. |

Screens framed:

| Route | Reads as | Notes |
|---|---|---|
| `/pos/reports` | Tax Register (GST) | Months as a grid with a totals foot; period on the band. |
| `/pos/khata` | Bills Receivable | Aging computed from last payment; totals for limit and outstanding. Keeps `khata-account-row` hooks. |
| `/pos/purchases` | Purchase Order / Invoice Register | Tab switches which register is on screen. |
| `/pos/products` | Product Register | Name/Code/HSN/Group/Unit/Stock/Cost/Rate/Status; Enter opens the card; Edit and activate/deactivate kept inline. |
| `/pos/inventory` | Stock Register (+ its other tabs) | `StockTable` restyled in place, so its banners and tab hooks survive. |

These five are full-bleed: `isOfficeRoute()` in `lib/pos/office-menu.js` tells `PosSidebar` to
stand down, the same way it already does on the counter, and Alt+O replaces it.

## Verified

- `next build` compiles clean after each screen.
- All five render in a real browser (Playwright, manager session, live data): band, rail and grid
  present on each, **no page errors**.
- Screenshots reviewed against the reference frames — density, banding, alignment and totals match.

## Not verified

- **The e2e suite was not run.** Its harness resolves to `pos.pelbu.com`, so running it would point
  tests at the live site; that was stopped rather than done. The auth-setup step failed before
  writing, so `e2e/storage/*.json` are untouched (Aug 23). Note the global setup DID run its seed
  against this box's Supabase before failing — normal harness behaviour on this box (one
  environment), not damage, but worth knowing.
- `v7-pos-sidebar.spec.js` expects an `aside` on `/pos`. Stale since `58aae63` hid the sidebar on
  the counter — pre-existing, not caused here, but it needs rewriting.
- Desktop is untouched. The terminal already wears the counter; its back office is the cloud app.

## What remained at the time of writing (all now done)

1. ~~**Rewrite `v7-pos-sidebar.spec.js`**~~ against the current model (no rail on counter or office
   screens; Alt+O is the way through), and add a spec for the office frame.
2. **The rest of the office screens** — `/pos/orders`, `/pos/registers`, `/pos/shifts`,
   `/pos/team`, `/pos/stores`, `/pos/settings` — still on the console look.
3. **`OfficeForm` has no screen yet.** The product card is still the old modal; the reference puts
   the whole record on one sheet. That is the next real piece of recognition.
4. **Screens the reference shows that we have no equivalent for** — Stock Ledger as a per-product
   transaction history, Stock Discrepancy, Bills Payable, Day Book, Cash Book, Trial Balance. Scope
   call, not a reskin: some are back-office accounting we do not do.
5. **Inventory's inner controls** (search field, filter pills, alert banners) are still shadcn — the
   frame around them is right, the controls inside are not.

## Open questions

1. How far does the palette go? The office now wears the reference's structural colours while the
   till still wears Pelbu gold. Should the till follow, or do the two stay distinct?
2. Which of the missing reference screens does Innovates actually use daily? That decides whether
   item 4 is a reskin job or a build job.
3. Access to the reference for the screens the recording did not cover — above all the **billing
   screen**, which the demo never showed and which is the screen staff touch most.
