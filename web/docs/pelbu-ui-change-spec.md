# Pelbu UI — Change Specification (web + desktop)

> **Source:** `Pelbu UI.pptx` (9 slides, repo root). Recovered 2026-06-23.
> **Nature of the deck:** annotated screenshots of the **current web keyboard POS**
> (cart columns `# / Qty / Product / Batch / Stock / Unit Price / Discount / Total`
> match `web/components/pos/keyboard/cart-table.jsx`; batch IDs `OPEN-cc…` and
> invoice `DAWA-2026-00005` match live formats) with the designer's change requests
> drawn on as orange/blue/yellow callouts, plus a canonical function-key bar.
> **Target:** apply to **web (primary)** and **desktop (parity)**.
> **F-key decision (2026-06-23):** adopt the deck's keyboard map **fully** across
> both apps — see §2 for the displaced bindings that must be relocated.

---

## 1. Change spec (15 items)

| # | Group | Change requested | Slide |
|---|-------|------------------|:-----:|
| 1 | Cart / line item | Show **Final Rate** (unit price after discount) per line | 4 |
| 2 | Cart / line item | Per-item discount supports **% OR fixed amount** — cashier picks the basis | 4 |
| 3 | Cart / line item | **Add/Remove product** via buttons **and** `Ctrl+A` / `Ctrl+R` | 4 |
| 4 | Cart / line item | **Cannot close/abandon a cart while a stock error exists** — block until items are removed or the sale completes; show a red error bar | 3 |
| 5 | Cart / line item | Batch IDs rendered as **blue hyperlinks**; line totals in **orange** | 3 |
| 6 | Layout polish | Move the **Batch** field nearer the Product column (long empty gap today); equalize line-item font weight ("as bright as unit price") | 4 |
| 7 | Customer | **Double-click the Customer field → opens the customer-list panel**; if none chosen, default to **Walk-in** | 6 |
| 8 | Customer | List columns: `Mobile No | Customer Name | Customer Type | Outstanding Balance` | 5 |
| 9 | Customer | Customers with credit/standing issues are **highlighted orange + blocked from selection**, with a popup: *"please note that…"* | 5 |
| 10 | Invoice | Invoice number **auto-increments and refreshes live** (26/004 → 26/005 after each completed sale) | 6 |
| 11 | Invoice | Date/time sourced from **internet (NTP / server)**; back- or forward-dating is **admin-only** | 6 |
| 12 | Invoice search | **Double-click an invoice no → detail table** (`Date | Amount | Customer | Contact`); searchable by invoice no (26/01, 26/02 …) | 7 |
| 13 | Price list | **Retail / Wholesale / Distributor** price-list toggle; reachable via `F7`, the `A` key, or `Alt+A` | 4, 8, 9 |
| 14 | Keyboard | Canonical **F-key bar** (see §2) + `Ctrl+D` / `Ctrl+C` / `Ctrl+E` and `Alt+A` / `Alt+M` / `Alt+Q` / `Alt+D` | 8, 9 |
| 15 | New flows | **Complimentary** (Ctrl+C), **Exchange** (Ctrl+E), **Quotation** (Alt+Q), **Post to Market** (Alt+M), **Delivery Address** (Alt+D), **Sales Person** (F8) | 8, 9 |

---

## 2. Canonical keyboard map (ADOPTED FULLY)

From slides 8–9. Both web and desktop must converge on this scheme.

### Function keys
| Key | Action |
|-----|--------|
| F1 | Help |
| F2 | Clear (new transaction) |
| F3 | Search (add item / product search) |
| F4 | New Cart |
| F5 | Previous Cart (recall held) |
| F6 | Customer Select |
| F7 | Price List (Retail / Wholesale / Distributor) |
| F8 | Sales Person |
| F9 | Change Qty |
| F10 | Tender (payment) |
| Enter | Change Qty |

### Modifiers
| Key | Action |
|-----|--------|
| Ctrl+A | Add product |
| Ctrl+R | Remove product |
| Ctrl+D | Discount on all bill amount |
| Ctrl+C | Complimentary |
| Ctrl+E | Exchange |
| Alt+A | Apply Price List |
| Alt+M | Post to Market |
| Alt+Q | Convert to Quotation |
| Alt+D | Delivery Address |

### ⚠️ Bindings this displaces (must be relocated)
| Key | Old binding (web) | New (per deck) | Relocation plan |
|-----|-------------------|----------------|-----------------|
| F8 | Cash In/Out *(shipped in cashier/shift feature)* | Sales Person | Cash In/Out → keep the **header button** + assign a free shortcut (e.g. `Ctrl+Shift+C` or a manager menu); Z-Report stays `Ctrl+Shift+Z`. Confirm in phase-1 plan. |
| F9 | Toggle touch ⇄ keyboard | Change Qty | Mode toggle → **header control only** (no hotkey), or a non-conflicting key. |
| F5 | Payment / Tender | Previous Cart | Tender moves to **F10** (per deck). |
| Ctrl+C | (browser copy) | Complimentary | Accept the collision in the kiosk context; document it. |

Desktop today also diverges (F3=hold, F4=recall, F5=checkout, F10=discount) — it converges to the same scheme above.

---

## 3. Gap vs. current implementation

| Item | Web (today) | Desktop (today) |
|------|-------------|-----------------|
| Cart cols / batch links / orange totals | ✅ matches | ⚠️ cart-panel lacks batch/stock cols |
| Final Rate after discount | ❌ | ❌ |
| Discount % or fixed per item | ⚠️ row discount only (Ctrl+M) | ⚠️ manager override only |
| Ctrl+A / Ctrl+R add/remove | ❌ | ❌ |
| Block cart-close on stock error | ⚠️ `stock-gate-modal` blocks *checkout*, not cart-close | ❌ |
| Customer panel w/ outstanding balance + orange block | ⚠️ `customer-id-modal` (no balance table / blocking) | ⚠️ `CustomerModal` (khata balance, no orange-block) |
| Live auto-increment invoice no | ❓ not shown inline | ❓ not shown inline |
| Internet time + admin-only date override | ❌ | ❌ |
| Double-click invoice → detail/search | ❌ (`/pos/orders` list only) | ❌ |
| Retail/Wholesale/**Distributor** price list | ⚠️ wholesale + mrp only, no toggle / distributor tier | ⚠️ same |
| F-key bar | ⚠️ has `shortcut-bar.jsx`, wrong map | ⚠️ has help overlay, wrong map |
| Complimentary / Exchange / Quotation / Market / Delivery / Sales-Person | ❌ all | ❌ all |

### Key files
- Web shortcuts: `web/components/pos/keyboard/shortcut-bar.jsx`, `help-overlay.jsx`, and the handler in `web/app/pos/page.jsx`.
- Web cart table: `web/components/pos/keyboard/cart-table.jsx`.
- Desktop shortcuts: `desktop/hooks/use-pos-shortcuts.ts`; cart: `desktop/components/pos/cart-panel.tsx`; help: `desktop/.../HelpOverlay`.
- Shared GST engine already exists (per-line, tax-exclusive) — reuse for Final Rate.

---

## 4. Proposed phasing

- **Phase 1 — Keyboard map + cart core (web + desktop).** Canonical F-key bar/remap (relocate Cash In/Out & mode-toggle), Final Rate, % / fixed discount, Ctrl+A/R, block-close-on-stock-error, batch-near-product layout, font equalization. *No schema changes. Highest visibility, contained risk.*
- **Phase 2 — Customer & invoice header.** Customer-list panel (mobile/name/type/outstanding + orange block), double-click→panel, walk-in default, live auto-increment invoice no, internet-time + admin date override. *Some backend.*
- **Phase 3 — Invoice search + price lists.** Double-click invoice → detail/search; Retail/Wholesale/Distributor toggle (Distributor = new price tier — possible schema change).
- **Phase 4 — New flows.** Complimentary, Exchange, Quotation, Post-to-Market, Delivery Address, Sales Person (F8). *Largest; net-new features.*

---

## Appendix — per-slide notes (so nothing is lost)

- **Slide 1** — empty-cart baseline; header = store name + `Store: 1 | POS: 1 | User: pos`, nav icons, Start Shift, Khata badge. *"Cart is empty — Press F3 or start typing to add products."*
- **Slide 2** — completion state; green status bar *"✓ Order DAWA-2026-00005 completed — press F2 for new transaction"*; cart tabs Cart 1 / Cart 2 (active) / Hold; partial-batch message *"Only 1 units available … Added 1. Search again to add remaining 4."*
- **Slide 3** — red stock-error bar *"Insufficient batch stock: 'Babur Honey 500Gm' … requires 150, only 15 available"*; callout: cart must not close while error present.
- **Slide 4** — main billing; callouts for Final Rate, Ctrl+A/R, price-list toggle, % or fixed discount, `A` key → price list, batch-near-product.
- **Slide 5** — customer panel; sample rows (Silver Pine/B2B-Hotelier, Pema Dorji/Loyalty-Gold, Babesa Traders/B2B-Wholesaler, Olakha Mart/B2B-Retailer); orange-block rule.
- **Slide 6** — walk-in default + double-click → panel; live invoice auto-increment; internet time + admin-only date override.
- **Slide 7** — invoice search; double-click invoice no → detail table; searchable.
- **Slide 8** — F-key legend (F1–F10) + Ctrl+D/C/E.
- **Slide 9** — Alt-key legend (Alt+A/M/Q/D).
