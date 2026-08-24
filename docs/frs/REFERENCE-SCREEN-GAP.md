# Reference screens — what exists, what we built, what needs new data

**Date**: 2026-08-24 · Companion to `COUNTER-UI-PLAN.md`

The demo recording shows the incumbent ERP's full back office. This is the honest audit of which
of those screens we can serve, assessed against the actual `pos` schema rather than against
ambition. Three buckets: built, buildable from data we already hold, and blocked on data that
does not exist.

---

## 1. Built (2026-08-24)

| Screen | Route | Data it reads |
|---|---|---|
| **Stock Ledger** | `/pos/inventory/ledger` | `pos.inventory_movements` |

One product's movements with the balance carried down, opening balance summed from everything
before the period. `quantity` is signed in that table (RESTOCK/RETURN positive, SALE/DAMAGED/LOSS
negative, OPEN both ways when a bulk package is broken), so the running balance is a plain
cumulative sum. Reached at Office → **W → L**.

Note this is NOT the existing `/api/inventory/movements`: that answers "what happened lately"
(newest first, capped at 50, no period). A ledger needs the opposite order, the whole period, and
an opening balance — without which the running total is fiction.

---

## 2. Buildable now — the data exists, the screen does not

| Screen | Data available | Effort |
|---|---|---|
| **Day Book** | `pos.orders` carries `order_type` (POS_SALE, MARKETPLACE, PURCHASE_ORDER, PURCHASE_INVOICE, SALES_ORDER, SALES_INVOICE), `grand_total`, `created_at` | ~half a day |
| **Cash Book** | `pos.shift_transactions` (type, payment_method, amount) + `pos.cash_adjustments` (type, amount, reason) + `pos.shifts` | ~1 day |

Both are register-shaped and need no schema change. Day Book is every transaction for a date;
Cash Book is cash in and out per shift/day, which the drawer already records.

---

## 3. Blocked — needs data we do not capture

| Screen | What is missing | Verdict |
|---|---|---|
| **Stock Discrepancy** | Physical stock-take counts. `warehouse_stock` / `entity_products` hold the SYSTEM quantity only; there is no counted-quantity record to difference against. | Needs a stock-take feature first: a count sheet, a counted figure per product, a variance posting. That is the real work — the report is the easy half. Office **W → D** is marked `todo` accordingly. |
| **Bills Payable** | Supplier outstanding. `orders` has `payment_method` but no amount-paid or balance for purchases, and khata is receivables only (creditor → debtor). | Needs a supplier ledger, or at minimum payments recorded against purchase orders. |
| **Trial Balance, P&L, Balance Sheet** | A general ledger: chart of accounts, double-entry postings. Nothing resembling one exists. | **Recommend declining as reskin scope.** This is not "make our screens look like theirs" — it is becoming an accounting package. Worth a separate conversation with Innovates about whether they keep the incumbent for books. |
| **Ratio Analysis, Cash Flow, Budget Variance** | Same general ledger. | As above. |
| **Payroll** | Whole module — no staff pay, attendance or salary tables. | Out of scope unless the client asks. |
| **Purchase Voucher** (direct entry, no PO) | Nothing structural — `orders` already models PURCHASE_INVOICE. This is a form, not a data gap. | Buildable; queued behind the registers. Office **P → V** is `todo`. |
| **Purchase Return Register** | A return-to-supplier record. Refunds/replacements exist for SALES, not purchases. | Needs a purchase-return type. |
| **Opening Stock / Stock Journal** | `inventory_movements` can already express both (a positive opening movement, a manual in/out). What is missing is the ENTRY screen, not the data. | Buildable; Office **W → N** and **W → J** are `todo`. |

---

## Recommendation

Build **Day Book** and **Cash Book** next — they are register-shaped, need no migration, and both
are daily-use screens for a shopkeeper.

Then the three entry forms that only lack a screen: **Purchase Voucher**, **Opening Stock**,
**Stock Journal**.

Treat **Stock Discrepancy** as a stock-take feature rather than a report, and put the accounting
suite (Trial Balance, P&L, Balance Sheet, Ratio, Cash Flow, Budget) to the client as a scope
question before any of it is estimated.
