# Feature: Unified Khata — Credit Ledger for All Parties

**Feature ID**: F-KHATA-001
**Phase**: 2
**Status**: Scoped
**Last Updated**: 2026-04-25
**Supersedes**: F-CREDIT-001 (B2B Credit Ledger) — merged into this spec

---

## Overview

A single credit tracking system that works for **all parties** in the ecosystem. Whether it's a walk-in customer buying on credit from a shopkeeper, or a retailer buying stock on credit from their wholesaler — the same khata rules apply. One system, one set of tables, one enforcement logic.

**Party types supported:**

| Party Type | Example | Who Extends Credit | Who Owes |
|------------|---------|--------------------|----------|
| `CONSUMER` | Walk-in customer | Shopkeeper (Retailer) | Consumer |
| `RETAILER` | Retailer business | Wholesaler | Retailer entity |
| `WHOLESALER` | Wholesaler business | Distributor | Wholesaler entity |

The feature is available on both the desktop POS terminal and the PWA (tablet/mobile). Credit transactions are only permitted when the debtor has been positively identified. No anonymous credit — every khata entry is tied to a known party.

**Dependencies**: F-AUTH-001 (consumer identification), F-DIST-001 (entity relationships)

---

## Party Identification

How the debtor is identified depends on their type:

| Party Type | Identifier | Source |
|------------|-----------|--------|
| `CONSUMER` | WhatsApp phone number | F-AUTH-001 consumer identification at POS |
| `CONSUMER` | Face-ID embedding (opt-in) | Face-ID enrollment, 512-d vector match |
| `RETAILER` | Entity ID + user profile | Retailer staff logs in to place wholesale order |
| `WHOLESALER` | Entity ID + user profile | Wholesaler staff logs in to place distributor order |

For consumers, if neither identifier is present, the "Credit/Khata" payment method does not appear. For businesses, the entity relationship must exist (e.g. retailer must be linked to wholesaler via `retailer_wholesalers`).

---

## Credit Operations

### 1. CREATE DEBT (Checkout / Order Placement)

Triggered when payment method is "Credit/Khata" during POS checkout or wholesale order.

```
Cart/order finalized → Payment method = CREDIT
  → Look up khata_accounts by (creditor_entity_id, debtor_ref, party_type)
  → If no account → prompt creation (OWNER/MANAGER only)
  → If account exists:
      → Check: outstanding_balance + cart.grand_total > credit_limit
          → If YES and status = FROZEN → HARD BLOCK: "Account frozen. See owner."
          → If YES and status = ACTIVE → HARD BLOCK: "Credit limit exceeded. Outstanding: Nu.X, Limit: Nu.Y"
          → If YES and OWNER overrides → ALLOW (see Override below)
          → If NO → ALLOW
  → On CONFIRMED:
      → khata_accounts.outstanding_balance += grand_total
      → Insert DEBIT row into khata_transactions
      → Transaction receipt marked as CREDIT payment
```

### 2. RECORD PAYMENT (Settlement)

Debtor visits or transfers money. Creditor records it.

```
POS/Admin Hub → Khata → Select Account → "Record Payment"
  → Enter: amount, payment_method (CASH / MBOB / MPAY / RTGS / BANK_TRANSFER)
  → amount cannot exceed outstanding_balance
  → On confirm:
      → khata_accounts.outstanding_balance -= amount
      → Insert CREDIT row into khata_transactions
      → khata_repayments record created (for tracking method and due dates)
      → If outstanding_balance becomes 0 → status remains ACTIVE
```

Partial payments are fully supported. The debtor can pay Nu. 500 of a Nu. 2,000 balance.

### 3. ADJUSTMENT (Corrections)

OWNER-only operation for correcting errors, writing off bad debt, or adjusting balances.

```
POS/Admin Hub → Khata → Select Account → "Adjust Balance" (OWNER role required)
  → Adjustment type:
      → WRITE_OFF: Reduces outstanding_balance. Reason required (e.g., "bad debt").
      → CORRECTION: Positive or negative. Reason required (e.g., "duplicate entry").
  → On confirm:
      → khata_accounts.outstanding_balance += adjustment_amount (negative for reduction)
      → outstanding_balance cannot go below 0
      → Insert ADJUSTMENT row into khata_transactions
```

---

## Hard Block and Override

### Credit Limit Enforcement

When `outstanding_balance + new_order_total > credit_limit`, the system hard-blocks the Credit/Khata payment method:

- The "Credit/Khata" button is greyed out with a tooltip: "Limit exceeded (Nu. X / Nu. Y)"
- The cashier/order placer cannot proceed with credit payment

### Owner Override

A user with `sub_role = OWNER` (or DISTRIBUTOR/SUPER_ADMIN for B2B) can bypass the hard block:

1. Click/tap the locked "Credit/Khata" button
2. Confirmation dialog: "Customer [Name] has exceeded their credit limit (Nu. X / Nu. Y). Allow this credit transaction?"
3. Owner confirms or cancels
4. If confirmed, the transaction proceeds and a note is logged: "Owner override — limit exceeded by Nu. [amount]"

The override is recorded on the `khata_transactions` row in the `notes` field for audit purposes.

---

## Credit Limits

- **No automatic limits.** The system does not calculate or suggest credit limits.
- **Creditor sets per-debtor manually.** For consumers: shopkeeper sets. For retailers: wholesaler sets. For wholesalers: distributor sets.
- **Default on account creation: Nu. 0** — credit is disabled until the creditor explicitly raises the limit.
- **No maximum cap.** The creditor can set any limit they choose.
- **Limit changes are logged** as ADJUSTMENT entries in `khata_transactions`.

---

## Due Date & Alert Schedule

Every khata account has a `credit_term_days` setting (default: 30 days). When a credit purchase is made, a repayment record is created with `due_date = confirmed_at + credit_term_days`.

Alerts run via a scheduled job (Supabase Edge Function + pg_cron).

| Trigger | Alert Type | Recipients |
|---------|-----------|-----------|
| 3 days before due_date | `PRE_DUE_3D` | Both creditor and debtor |
| On due_date (unpaid) | `DUE_TODAY` | Both |
| 3 days after due_date (unpaid) | `OVERDUE_3D` | Both |
| 30+ days no payment (consumer) | `OVERDUE_30D` | Creditor (owner) only |
| 1st of every month (any balance > 0) | `MONTHLY_REMINDER` | Debtor |

Each alert type fires **once per repayment** — `khata_alerts` table prevents duplicates.

For informal consumer khata, the creditor can set `credit_term_days = 0` which disables due-date alerts entirely. Only the monthly reminder applies.

---

## Credit Statement

A running-balance statement for any khata account, showing all debits and credits in chronological order.

### Statement Columns

| Column | Description |
|--------|-------------|
| Date | Transaction date |
| Description | Purchase (inv_no), Payment (method), or Adjustment (reason) |
| Debit (Nu.) | Amount added to balance |
| Credit (Nu.) | Amount subtracted from balance |
| Balance (Nu.) | Running balance after this transaction |

### WhatsApp Delivery

The creditor can send the statement to the debtor's WhatsApp:

1. POS/Admin Hub → Khata → Select Account → "Send Statement"
2. System generates a PDF (date range selectable: last 30, 90 days, or all time)
3. PDF delivered via `whatsapp-gateway`

Statement PDF includes: creditor name/TPN, debtor name/phone, date range, itemized ledger, running balance, outstanding total, creditor contact for disputes.

---

## Data Model

### `khata_accounts` table

Replaces both `consumer_accounts` (from old F-KHATA-001) and the credit columns on `retailer_wholesalers` (from old F-CREDIT-001).

```sql
CREATE TABLE khata_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creditor_entity_id    UUID NOT NULL REFERENCES entities(id),       -- the entity extending credit
  party_type            TEXT NOT NULL CHECK (party_type IN ('CONSUMER', 'RETAILER', 'WHOLESALER')),
  debtor_entity_id      UUID REFERENCES entities(id),                -- for RETAILER/WHOLESALER party type
  debtor_phone          TEXT,                                         -- for CONSUMER party type (E.164 format)
  debtor_name           TEXT,                                         -- display name
  debtor_face_id_hash   TEXT,                                         -- Face-ID reference (CONSUMER, nullable)
  credit_limit          DECIMAL(12,2) NOT NULL DEFAULT 0,            -- Nu. 0 = no credit until creditor enables
  outstanding_balance   DECIMAL(12,2) NOT NULL DEFAULT 0,            -- current amount owed
  credit_term_days      INT NOT NULL DEFAULT 30,                     -- days after credit purchase for repayment due
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
  last_payment_at       TIMESTAMPTZ,                                  -- most recent repayment
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- Consumer accounts: unique per (creditor, phone)
  -- Business accounts: unique per (creditor, debtor_entity)
  CONSTRAINT uq_khata_creditor_debtor UNIQUE (creditor_entity_id, debtor_entity_id, debtor_phone)
);

CREATE INDEX idx_khata_accounts_creditor ON khata_accounts(creditor_entity_id);
CREATE INDEX idx_khata_accounts_debtor_entity ON khata_accounts(debtor_entity_id) WHERE debtor_entity_id IS NOT NULL;
CREATE INDEX idx_khata_accounts_debtor_phone ON khata_accounts(debtor_phone) WHERE debtor_phone IS NOT NULL;
CREATE INDEX idx_khata_accounts_status ON khata_accounts(status) WHERE status = 'ACTIVE';
```

### `khata_transactions` table

Immutable ledger — every debit, credit, and adjustment for any khata account.

```sql
CREATE TABLE khata_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  order_id              UUID,                                         -- FK to orders.id (nullable for payments/adjustments)
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT', 'ADJUSTMENT')),
  amount                DECIMAL(12,2) NOT NULL,                       -- positive for all types (signed only for ADJUSTMENT)
  balance_after         DECIMAL(12,2) NOT NULL,                       -- snapshot of outstanding_balance after this entry
  payment_method        TEXT CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  notes                 TEXT,                                         -- override note, adjustment reason, etc.
  created_by            UUID NOT NULL REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_khata_txn_account ON khata_transactions(khata_account_id);
CREATE INDEX idx_khata_txn_date ON khata_transactions(created_at DESC);
CREATE INDEX idx_khata_txn_order ON khata_transactions(order_id) WHERE order_id IS NOT NULL;
```

### `khata_repayments` table

Tracks individual repayments with due dates and confirmation workflow.

```sql
CREATE TABLE khata_repayments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  amount                DECIMAL(12,2) NOT NULL,
  payment_method        TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MBOB', 'MPAY', 'RTGS', 'BANK_TRANSFER')),
  status                TEXT NOT NULL DEFAULT 'CREATED'
                          CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date              DATE,                                         -- null for immediate/consumer payments
  reference_no          TEXT,                                         -- bank/RTGS reference
  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id),            -- staff who recorded
  confirmed_by          UUID REFERENCES user_profiles(id),            -- creditor who confirmed receipt
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ
);

CREATE INDEX idx_khata_repayments_account ON khata_repayments(khata_account_id);
CREATE INDEX idx_khata_repayments_due ON khata_repayments(due_date) WHERE due_date IS NOT NULL AND status = 'CREATED';
```

### `khata_alerts` table

Tracks which alerts have been sent to avoid duplicates.

```sql
CREATE TABLE khata_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  khata_account_id      UUID NOT NULL REFERENCES khata_accounts(id),
  repayment_id          UUID REFERENCES khata_repayments(id),         -- null for MONTHLY_REMINDER
  alert_type            TEXT NOT NULL CHECK (alert_type IN (
                            'PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D',
                            'OVERDUE_30D', 'MONTHLY_REMINDER')),
  sent_to               TEXT NOT NULL CHECK (sent_to IN ('CREDITOR', 'DEBTOR', 'BOTH')),
  whatsapp_status       TEXT DEFAULT 'PENDING'
                          CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  sent_at               TIMESTAMPTZ DEFAULT NOW()
);
```

### Removals from old schema

- **Remove** `credit_limit`, `credit_balance`, `credit_term_days`, `credit_frozen` from `retailer_wholesalers` — replaced by `khata_accounts` rows where `party_type = 'RETAILER'`
- **Remove** `consumer_accounts` table — replaced by `khata_accounts` rows where `party_type = 'CONSUMER'`
- **Remove** `consumer_credit_transactions` table — replaced by `khata_transactions`
- **Remove** `credit_transactions` table — replaced by `khata_transactions`
- **Remove** `credit_repayments` table — replaced by `khata_repayments`
- **Remove** `credit_alerts` table — replaced by `khata_alerts`
- **Remove** `consumer_credit_alerts` table — replaced by `khata_alerts`

---

## RLS Policies

```sql
-- Creditor entity can only see their own khata accounts
CREATE POLICY "tenant_khata_accounts" ON khata_accounts
  FOR ALL USING (
    creditor_entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- Debtor entity can see khata accounts where they owe money (for B2B transparency)
CREATE POLICY "debtor_view_khata" ON khata_accounts
  FOR SELECT USING (
    debtor_entity_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- Transactions visible to both creditor and debtor entity
CREATE POLICY "tenant_khata_transactions" ON khata_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM khata_accounts ka
      WHERE ka.id = khata_transactions.khata_account_id
      AND (ka.creditor_entity_id = (auth.jwt() ->> 'entity_id')::UUID
           OR ka.debtor_entity_id = (auth.jwt() ->> 'entity_id')::UUID)
    )
  );
```

Permission enforcement at application layer:

| Action | CASHIER | MANAGER | OWNER | DISTRIBUTOR | SUPER_ADMIN |
|--------|---------|---------|-------|-------------|-------------|
| View khata accounts | Own store | Own store | Own store | Their retailers | All |
| Create account | — | Own store | Own store | Their retailers | All |
| Record payment | — | Own store | Own store | Their retailers | All |
| Adjust balance | — | — | Own store | Their retailers | All |
| Set credit limit | — | — | Own store | Their retailers | All |
| Freeze/Close | — | — | Own store | Their retailers | All |
| Override hard block | — | — | Own store | Their retailers | All |

---

## DB Trigger Summary

| Event | Action |
|-------|--------|
| Order CONFIRMED + payment_method = CREDIT | `khata_accounts.outstanding_balance += grand_total`; insert DEBIT `khata_transactions`; create `khata_repayments` with `due_date = confirmed_at + credit_term_days` |
| Order CANCELLED (was CREDIT, was CONFIRMED) | `khata_accounts.outstanding_balance -= grand_total`; insert CREDIT `khata_transactions` |
| Repayment PAYMENT_MADE | `khata_accounts.outstanding_balance -= amount`; insert CREDIT `khata_transactions`; update `last_payment_at`; auto-unfreeze if balance < limit |
| Adjustment recorded | `khata_accounts.outstanding_balance += adjustment_amount`; insert ADJUSTMENT `khata_transactions` |
| Balance reaches 0 | No automatic status change — account stays ACTIVE |

---

## POS Checkout Integration

When the cashier selects "Credit/Khata" as the payment method at checkout:

1. **Consumer identification required**: System checks if a consumer identity is active in the current POS session (WhatsApp OTP or Face-ID). If not, prompts identification.

2. **Account lookup**: Queries `khata_accounts` by `(creditor_entity_id, debtor_phone, party_type='CONSUMER')` or by `debtor_face_id_hash`.

3. **Limit check**: Compares `outstanding_balance + cart.grand_total` against `credit_limit`. Hard block if exceeded (unless OWNER override).

4. **On transaction CONFIRMED**:
   - Order row created with `payment_method = 'CREDIT'`
   - DEBIT `khata_transactions` entry created
   - Consumer's `outstanding_balance` updated
   - Receipt shows "CREDIT — Khata Balance: Nu. [new_balance]"

5. **Receipt footer**: Includes updated outstanding balance: "Khata balance as of [date]: Nu. [amount]"

---

## Admin Hub Integration (B2B)

For wholesaler-to-retailer credit, the Admin Hub replaces the POS checkout flow:

1. **Wholesaler dashboard**: Shows all retailer khata accounts where `creditor_entity_id = wholesaler's entity` and `party_type = 'RETAILER'`.

2. **Credit at wholesale order**: When a retailer places a wholesale order with CREDIT payment, the same khata enforcement applies — limit check, hard block, OWNER override.

3. **Repayment recording**: Wholesaler staff records when a retailer physically pays. Repayment creates CREDIT `khata_transactions` entry.

4. **Distributor view**: Distributor sees aggregated credit data for all retailers in their category (not per-transaction detail).

---

## UI Screens

### Khata Management (POS sidebar / Admin Hub)

Lists all khata accounts for the logged-in entity with columns:

| Column | Description |
|--------|-------------|
| Name | Debtor display name |
| Type | CONSUMER / RETAILER / WHOLESALER |
| Phone/Entity | WhatsApp number (masked) or entity name |
| Outstanding | Current balance owed |
| Limit | Credit limit (Nu. 0 = disabled) |
| Term | Credit term in days |
| Last Payment | Date of most recent repayment |
| Status | ACTIVE / FROZEN / CLOSED |

Actions per row: View Ledger, Record Payment, Adjust (OWNER+), Send Statement, Freeze/Close.

### Account Ledger Detail

Full transaction history for a single khata account. Running-balance statement. Filters for date range and transaction type.

### Record Payment Modal

Fields: Amount (numpad), Payment Method, Reference No (optional), Notes (optional).

### Adjust Balance Modal (OWNER+ only)

Fields: Adjustment Type (WRITE_OFF / CORRECTION), Amount, Reason (required).

---

## PWA Considerations

- Consumer list is a scrollable card layout instead of table
- "Record Payment" and "Send Statement" are large touch targets
- No keyboard shortcuts — all interaction via tap
- Statement generation and WhatsApp delivery work identically to desktop

---

## Implementation Checklist

### Schema
- [ ] Create `khata_accounts` table with RLS
- [ ] Create `khata_transactions` table with RLS
- [ ] Create `khata_repayments` table
- [ ] Create `khata_alerts` table
- [ ] Remove `credit_limit`, `credit_balance`, `credit_term_days`, `credit_frozen` from `retailer_wholesalers`
- [ ] Drop `consumer_accounts`, `consumer_credit_transactions`, `consumer_credit_alerts` tables (if created)
- [ ] Drop `credit_transactions`, `credit_repayments`, `credit_alerts` tables (if created)
- [ ] DB trigger: CREDIT order confirmed → debit balance + insert DEBIT entry + create repayment
- [ ] DB trigger: CREDIT order cancelled → credit balance + insert CREDIT entry
- [ ] DB trigger: repayment PAYMENT_MADE → credit balance + update last_payment_at + auto-unfreeze
- [ ] DB trigger: adjustment → adjust balance + insert ADJUSTMENT entry
- [ ] DB function: block CREDIT orders when balance >= limit (unless frozen)
- [ ] Unique constraint on `(creditor_entity_id, debtor_entity_id, debtor_phone)`
- [ ] Indexes on creditor_entity_id, debtor_entity_id, debtor_phone, created_at, order_id

### POS Terminal (Desktop)
- [ ] Add "Credit/Khata" payment method to checkout selector
- [ ] Consumer identification gate: block Credit/Khata if no consumer identity
- [ ] Account lookup by phone, Face-ID, or entity
- [ ] Account auto-creation prompt (OWNER/MANAGER only)
- [ ] Credit limit enforcement: hard block when outstanding + total > limit
- [ ] Owner override flow with confirmation dialog and audit logging
- [ ] Khata management sidebar (account list, sorting, search, type filter)
- [ ] Account ledger detail with running-balance statement
- [ ] Record Payment modal
- [ ] Adjust Balance modal (OWNER role guard)
- [ ] Credit limit setting per account (OWNER+)
- [ ] Credit term days setting per account
- [ ] Freeze/Close account actions (OWNER+)
- [ ] Receipt footer: khata balance line on CREDIT transactions

### Admin Hub (B2B)
- [ ] Wholesaler khata dashboard — all retailer accounts with balances, limits, overdue flags
- [ ] Retailer credit detail — ledger, repayment history, repayment recording form
- [ ] Credit limit + term adjustment form
- [ ] Distributor view — aggregated credit data for their retailers
- [ ] Override / freeze controls

### PWA (Tablet/Mobile)
- [ ] Touch-first account list (card layout)
- [ ] Record Payment flow with large touch targets
- [ ] Send Statement action
- [ ] Account ledger view adapted for smaller screens

### Statement Generation
- [ ] PDF generation (date range selectable: 30 days, 90 days, all time)
- [ ] Statement template: creditor info, debtor info, itemized ledger, running balance, outstanding total
- [ ] "Send Statement" action: generate PDF → deliver via whatsapp-gateway
- [ ] Statement record with whatsapp_status tracking

### Alerts
- [ ] Supabase Edge Function: daily scheduled alert check (pg_cron)
- [ ] Alert logic: PRE_DUE_3D, DUE_TODAY, OVERDUE_3D (all party types)
- [ ] Alert logic: OVERDUE_30D (consumers only, to creditor)
- [ ] Alert logic: MONTHLY_REMINDER (all party types with balance > 0)
- [ ] Alert deduplication via `khata_alerts` table
- [ ] WhatsApp message templates for all 5 alert types

### API Routes
- [ ] `GET /v1/khata/accounts` — list accounts for entity (filterable by party_type)
- [ ] `POST /v1/khata/accounts` — create account (OWNER/MANAGER/DISTRIBUTOR)
- [ ] `PATCH /v1/khata/accounts/:id` — update limit, term, status
- [ ] `GET /v1/khata/accounts/:id/ledger` — transaction history with running balance
- [ ] `POST /v1/khata/accounts/:id/payment` — record repayment
- [ ] `POST /v1/khata/accounts/:id/adjust` — owner adjustment
- [ ] `POST /v1/khata/accounts/:id/statement` — generate and send statement PDF
- [ ] `GET /v1/khata/accounts/:id/overview` — summary: balance, limit, term, last payment, status

### Permissions
- [ ] `khata:view` — view accounts and ledger (all staff)
- [ ] `khata:create` — create accounts (OWNER, MANAGER, DISTRIBUTOR)
- [ ] `khata:payment` — record repayments (OWNER, MANAGER, DISTRIBUTOR)
- [ ] `khata:adjust` — adjust balances, write off debt (OWNER, DISTRIBUTOR)
- [ ] `khata:manage` — set limits/terms, freeze/close accounts (OWNER, DISTRIBUTOR)

---

## Resolved Decisions

| # | Decision |
|---|----------|
| 1 | **Unified system for all parties.** CONSUMER, RETAILER, and WHOLESALER credit all use the same tables, same enforcement rules, same alert schedule. No separate B2B vs B2C logic. |
| 2 | **F-CREDIT-001 superseded.** The old B2B credit ledger is fully absorbed into this spec. The `retailer_wholesalers` credit columns are removed — all credit goes through `khata_accounts`. |
| 3 | **No anonymous credit.** Every khata entry must be tied to an identified party (phone/Face-ID for consumers, entity_id for businesses). |
| 4 | **Default credit limit is Nu. 0.** The creditor must explicitly enable credit for each party. No auto-enrollment. |
| 5 | **No automatic credit limits.** The creditor sets every limit manually. No ML, no suggestions. Keep it simple. |
| 6 | **Owner override for hard block.** When a debtor exceeds their limit, only OWNER (or DISTRIBUTOR/SUPER_ADMIN for B2B) can override. |
| 7 | **Partial payments allowed.** Debtors can settle any amount toward their balance. No minimum payment. |
| 8 | **No automatic account closure.** When balance reaches 0, the account stays ACTIVE. Owner must manually CLOSE. |
| 9 | **Credit term is configurable per account.** Default 30 days. Set to 0 to disable due-date alerts (informal consumer khata). |
| 10 | **Adjustments are OWNER+ only with mandatory reason.** Every correction, write-off, or manual adjustment requires a notes field and OWNER/DISTRIBUTOR sub_role. Full audit trail in `khata_transactions`. |
| 11 | **Per-creditor accounts.** A consumer has separate khata accounts at different stores. A retailer has separate accounts with different wholesalers. No cross-creditor balance visibility. Enforced by `creditor_entity_id` scoping. |
| 12 | **Debtor transparency for B2B.** A retailer can view their own outstanding khata balances across wholesalers (debtor RLS policy). Consumers do not have dashboard access — they receive statements via WhatsApp. |
