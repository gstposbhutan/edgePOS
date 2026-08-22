# Feature: Desktop Bank Reconciliation

**Feature ID**: F-BANK-001
**Status**: Planned (refreshed 2026-07-10) — **not yet implemented**
**Platform**: Desktop POS terminal (Electron + embedded PocketBase + Next.js App Router)
**Access**: Owner / Manager, back-office context

> This supersedes the 2026-04 "Bank Statement Parser & Auto-Match" scope, which was written against
> an aspirational architecture (a "Hono.js on Bun" local API, `payment_method IN (MBOB,MPAY,RTGS)`,
> OCR-first parsing). None of that matches the shipped stack. The corrections are called out inline.

---

## 1. What this is (and isn't)

**Bank reconciliation** = matching the store's *recorded digital receipts* against the **actual bank /
mobile-wallet statement**, and flagging the gaps. There are **three** money-in sources that hit the
bank, and all three must be reconciled:

1. **Orders paid `ONLINE`** (mBoB/mPay/RTGS at the counter).
2. **Cash deposits** — a `cash_adjustments` row with reason `Deposit` (cash physically banked).
3. **Khata repayments via a bank channel** — a customer/B2B buyer settling their credit balance by
   mBoB/mPay/RTGS/bank transfer. This is money in the bank but it is **not an order**, so it must be
   matched against the khata repayment record (see §5.3). Missing this makes every digital repayment
   look like an unmatched bank credit.

Match outcomes:
- **Matched** — a bank credit lines up with an order, a deposit, or a khata repayment → money confirmed.
- **Unmatched receipt** — an `ONLINE` order (or a confirmed digital khata repayment) exists but no
  bank credit found → delayed settlement, wrong reference, or a fake payment screenshot.
- **Unmatched bank credit** — money in the bank with none of the three above → a personal transfer,
  a salary credit, or a sale recorded on another terminal.

**This is NOT** the cash-drawer/shift reconciliation that already ships (close shift → count cash vs
`expected = opening_float + cashSales − cashRefunds + cashIn − cashOut` → BALANCED/OVERAGE/SHORTAGE;
see `desktop/hooks/use-shifts.ts` `getReconciliation`). Drawer reconciliation answers "is the cash
right?"; bank reconciliation answers "did the digital money actually land?". They are complementary.

It is also distinct from, but a stepping stone toward, the pending **mBoB/mPay banking-API**
integration (CLAUDE.md launch blocker). Until a real API exists, reconciliation works off the
statement the owner already downloads from their bank app.

**In scope vs out of scope for khata.** Bank rec matches *digital khata repayments* to bank credits
(§5.3) — that IS a bank event. It does **not** perform khata **ledger-integrity** reconciliation
(verifying each account's `outstanding_balance` equals Σdebits − Σrepayments, catching drift from a
failed trigger or a manual edit). That internal audit belongs to the khata/credit console (parity plan
Phase 3), not here; conflating the two would muddle "did the money land?" with "is the ledger self-
consistent?".

---

## 2. Platform & placement

Desktop-side, mirroring the existing back-office pages (`/stock`, `/adjustments`). Rationale: it reads
local `orders` + `cash_adjustments`, needs a wide screen for side-by-side review, and the terminal is
where a shopkeeper works day-to-day. Offline-first still holds — everything except the optional OCR
fallback (§4b) is local PocketBase.

- **Route:** `desktop/app/reconciliation/page.tsx` (new).
- **Nav:** add a link in the POS header of `desktop/app/page.tsx`, gated `{(isManager || isOwner) && …}`
  exactly like the **Stock** link. Also reachable from a BACK_OFFICE terminal.
- **Gating:** `useRequireRole(["owner","manager"])` (as `adjustments/page.tsx` does) + it's a
  back-office screen, so it shows in both POS and BACK_OFFICE terminals for owner/manager.
- **Web (optional, later):** a read-only cloud mirror once shifts/statements sync. Out of scope for v1.

> **Correction vs old spec:** there is no "Desktop POS API (Hono.js on Bun)". Desktop features are
> Next.js pages + PocketBase collections + hooks (`getPB()`/`PB_REQ` from `desktop/lib/pb-client.ts`),
> with the Electron main process handling anything privileged. All `/local/reconciliation/*` routes
> from the old spec are dropped in favour of direct PocketBase reads/writes via a `use-reconciliation`
> hook.

---

## 3. Data model (PocketBase collections)

Mirror the `shifts` (`002_shifts.js`) / `cash_adjustments` (`003_cash_adjustments.js`) pattern: a
`base` collection with rules `@request.auth.id != ''`, a parent→child relation, `autodate`
timestamps, and a matching down-migration. New migration file: `desktop/pb/pb_migrations/021_bank_reconciliation.js`.

### `bank_statements` (the uploaded/entered statement)
| field | type | notes |
|---|---|---|
| `bank_name` | text | free text or a small select (`MBOB`/`BNB`/`OTHER`) |
| `source` | select | `IMPORT` (CSV/XLSX) \| `OCR` \| `MANUAL` |
| `statement_start` / `statement_end` | date | period covered |
| `opening_balance` / `closing_balance` | number | optional, for a balance check |
| `total_credits` / `total_debits` | number | parsed sums |
| `rows_parsed` / `rows_matched` | number | progress |
| `status` | select | `UPLOADED`\|`PARSING`\|`PARSED`\|`RECONCILED`\|`FAILED` |
| `register_id` | relation → cash_registers | which terminal produced it (as 004 added elsewhere) |
| `created_by` | relation → _pb_users_auth_ | owner/manager who ran it |
| `created_at`/`updated_at` | autodate | |

### `bank_statement_rows` (one transaction line)
| field | type | notes |
|---|---|---|
| `statement` | relation → bank_statements | parent (like `cash_adjustments.shift`) |
| `row_date` | date | |
| `narration` | text | full description |
| `reference_no` | text | extracted journal/UTR/reference (the match key) |
| `amount` | number | positive |
| `row_type` | select | `CREDIT` \| `DEBIT` |
| `balance` | number | running balance if present |
| `match_status` | select | `UNMATCHED`\|`MATCHED`\|`MANUAL`\|`DISMISSED` |
| `match_kind` | select | `ORDER`\|`DEPOSIT`\|`KHATA_REPAYMENT` — what a matched row settled |
| `matched_order` | relation → orders | nullable |
| `matched_adjustment` | relation → cash_adjustments | nullable (deposit match) |
| `matched_khata_txn` | relation → khata_transactions | nullable (khata repayment match; on the terminal a repayment is a `khata_transactions` CREDIT row, not a separate `khata_repayments` collection) |
| `dismiss_reason` | text | when dismissed |
| `created_at` | autodate | |

Unique index (inline `indexes: [...]`, as `017_online_orders.js` does) on
`(statement, reference_no, amount, row_index)` to make re-imports idempotent.

> **Correction vs old spec:** it referenced `orders(id)`, `user_profiles(id)`, and SQL DDL. On desktop
> those are PocketBase relations (`orders`, `_pb_users_auth_`); there is no `user_profiles` collection
> on the terminal. No `ALTER TABLE orders ADD bank_reconciled …` — instead store the link on the
> statement row (`matched_order`) and derive an order's reconciled state from it, to avoid schema
> churn on the heavily-synced `orders` collection.

---

## 4. Getting the statement in

### 4a. Structured import (primary) — CSV / XLSX
Lead with this; it's exact, offline, and avoids OCR fragility (CLAUDE.md explicitly warns off OCR for
money verification). Reuse the proven **product-import** structure: download a template → choose file
→ **dry-run preview** (`{total, valid, errors, sample}`) → confirm. See
`web/lib/marketplace/product-import.js` (`buildTemplateWorkbook`/`parseWorkbook`) and
`web/components/pos/products/product-import-modal.jsx` for the exact UX to mirror.

Two implementation notes:
- `exceljs` is currently a **web-only** dependency. For desktop either (a) add `exceljs` to
  `desktop/package.json`, or (b) accept **CSV** and parse it in-process (no dep) — CSV is the safer,
  lighter default since every bank exports CSV. Recommendation: **CSV first**, XLSX if a bank only
  gives `.xlsx`.
- Column mapping is tolerant (header row → key map, case/`*`-insensitive), same as `parseWorkbook`.
  Bhutanese bank columns: mBoB `Date | Narration | Withdrawal | Deposit | Balance`; BNB
  `Tran Date | Particulars | Debit | Credit | Balance`. Extract `reference_no` from the narration via
  bank-specific regex; leave null if not found (owner can fill it to trigger a re-match).

### 4b. OCR (fallback only) — reuse the existing web vision
A real server-side vision path already exists: `web/lib/vision/server-payment-ocr.js`
(`verifyPaymentImage`, Zhipu GLM-4V primary / Gemini fallback) and the invoice-oriented
`web/lib/vision/bill-ocr.js` + `web/app/api/bill-parse/route.js`. A statement-OCR mode would be a new
prompt on that same path (`web/app/api/bank-statement-parse/route.js`). **Caveats:** desktop is
offline-first, so OCR is a cloud round-trip (degrades gracefully when offline → fall back to import);
and per CLAUDE.md, OCR must never be the source of truth for money. Treat OCR output as a *draft* the
owner reviews before it's saved as rows. **Desktop has no local vision code today** (only an unused
`ocr_verify_id` column), so there is nothing to port on the terminal — it calls the cloud endpoint.

### 4c. Manual entry
A simple add-row form for a handful of lines (small shops often reconcile 5–10 digital sales/day).

---

## 5. Auto-match engine (client-side, in the hook)

Runs after rows land, over local PocketBase. For each **CREDIT** row still `UNMATCHED`:

1. **Order match (strong)** — `reference_no` (trim/case-insensitive) == `orders.payment_ref`
   AND `abs(amount − orders.grand_total) ≤ Nu.1`
   AND `orders.payment_method = 'ONLINE'` AND the order isn't already matched.
   → `match_status='MATCHED'`, `match_kind='ORDER'`, `matched_order`.
2. **Order match (weak, needs confirmation)** — no reference hit, but `abs(amount − grand_total) ≤ Nu.1`
   AND `row_date` within 3 days of `orders.created_at` AND `payment_method='ONLINE'`. → surfaced as a
   suggestion, not auto-committed.
3. **Khata-repayment match** — a CREDIT row settling a credit balance paid by a bank channel. Match a
   `khata_transactions` CREDIT row (the terminal's repayment record) whose `payment_method` is a bank
   rail (`MBOB`/`MPAY`/`RTGS`/`BANK_TRANSFER`, **literal** values — khata does NOT use the
   `ONLINE`+`payment_channel` split that `orders` do), on `reference_no` (strong) or `amount` within
   the date window (weak). → `match_kind='KHATA_REPAYMENT'`, `matched_khata_txn`. (Cloud/web parity:
   the same row is a `khata_repayments` record with `payment_method` + `reference_no` + `confirmed_at`;
   only confirmed/paid repayments participate — the auto-created `CREATED` due-schedule rows do not.)
4. **Deposit match** — a CREDIT row that equals a `cash_adjustments` row with
   `reason='Deposit'` (see `lib/constants.ts` `ADJUSTMENT_REASON.DEPOSIT`) → `match_kind='DEPOSIT'`,
   `matched_adjustment`.
5. Otherwise **unmatched bank credit** (blue).

Invariants: each order / repayment / deposit matches at most one row, and a row matches at most one
of them. A khata **DEBIT** (the credit *sale*) is never a bank event — only the repayment is. **DEBIT**
bank rows are parsed and shown for reference but not matched in v1 (future: supplier payments / expenses).

> **Correction vs old spec:** matching is on `payment_method='ONLINE'` (+ optional `payment_channel`
> `MBOB/MPAY/RTGS`), **not** `payment_method IN ('MBOB','MPAY','RTGS')` — those literals were migrated
> to `ONLINE`+`payment_channel` (web migration `064`; desktop `orders.payment_method` CHECK is
> `CASH|CREDIT|ONLINE`). CASH and CREDIT orders are excluded from matching (cash never hits the bank;
> credit is a khata, not a bank credit).

---

## 6. Reconciliation dashboard

Single screen, summary bar + filterable colour-coded table (Green matched / Yellow unmatched order /
Blue unmatched bank credit / Red amount-mismatch). Manual actions:
- **Dismiss** a blue row with a reason (Personal transfer / Owner deposit / Other) → `DISMISSED`.
- **Link** a blue row to an order (search by `order_no`/amount) → `MANUAL` + set `matched_order`.
- **Investigate** a yellow order (view detail; re-check reference; mark "cash collected").

Build it the shifts way: a `desktop/hooks/use-reconciliation.ts` using TanStack Query over
`pb.collection('bank_statements'|'bank_statement_rows'|'orders'|'cash_adjustments')`, with
`invalidateQueries` on each mutation; aggregates computed client-side (like `computeShiftCashAggregates`).

---

## 7. Access control
Owner + Manager only (`useRequireRole(["owner","manager"])`), enforced again by PocketBase collection
rules (`@request.auth.role = 'owner' || 'manager'`, as `004_cash_registers.js` does for registers).
Dismiss is arguably owner-only — match the existing granularity in the old spec's table if desired.

---

## 8. Sync considerations
`orders` already sync to Supabase; `shifts`/`cash_adjustments` do **not** yet (no `external_id`). Keep
v1 reconciliation **terminal-local** — statements never need to leave the box. If a cloud/web view is
wanted later, add web parity tables + an `external_id` column and fold into the existing sync ingest,
same as the shifts follow-up in CLAUDE.md's IN-PROGRESS list.

---

## 9. Phasing
- **P0** — collections (`021_…js`) + `use-reconciliation` hook + CSV import (dry-run→confirm) + the
  match engine + dashboard (matched/unmatched/dismiss/link). Fully offline.
- **P1** — deposit matching against `cash_adjustments`; amount-only weak-match suggestions.
- **P2** — OCR fallback via the cloud vision endpoint (draft-then-review); XLSX support.
- **P3** — WhatsApp/email end-of-day summary (reuse the gateway); web read-only mirror + sync.

---

## 10. Open questions
1. CSV-only vs add `exceljs` to desktop for XLSX? (Recommend CSV first.)
2. Reconcile per-terminal or per-store (multiple registers → one bank account)? Per-store is more
   useful but needs cross-terminal order visibility — which today only exists cloud-side. v1 = local
   terminal's own `ONLINE` orders; revisit when shifts/orders reconciliation goes cloud.
3. Match tolerance — keep ±Nu.1 (bank paisa rounding) as the old spec resolved.
