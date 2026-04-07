# Feature: Credit Ledger & Repayment Tracking

**Feature ID**: F-CREDIT-001  
**Phase**: 2 (Core POS)  
**Status**: Scoped  
**Last Updated**: 2026-04-07

---

## Overview

Each Retailer ↔ Wholesaler relationship has its own independent credit balance and limit. A Retailer can have different credit terms with Wholesaler A vs Wholesaler B. The Distributor sets the initial limit at onboarding; the Wholesaler can adjust it afterward.

---

## Resolved Decisions

| # | Decision |
|---|----------|
| 1 | Credit balance is **per Retailer ↔ Wholesaler relationship** — stored on `retailer_wholesalers` |
| 2 | Repayments recorded **manually by Wholesaler** when money is received. States: `CREATED → PAYMENT_MADE` |
| 3 | Exceeding limit is a **hard block** — no new CREDIT orders. Override by Wholesaler Owner, Distributor, Super Admin |
| 4 | **Fixed credit term** (e.g. 30 days) per relationship. Escalating WhatsApp alerts to both parties: 3 days before, on due date, 3 days overdue |
| 5 | **Partial repayments** allowed — balance reduces proportionally. Block lifts as soon as `balance < limit` |
| 6 | **Distributor** sets initial limit at onboarding. **Wholesaler** can adjust for their own Retailers afterward. **No maximum cap** — Wholesaler can set any limit they choose |

---

## Data Model

### `retailer_wholesalers` additions
```sql
credit_limit      DECIMAL(12,2) DEFAULT 0   -- Set by Distributor, adjustable by Wholesaler
credit_balance    DECIMAL(12,2) DEFAULT 0   -- Running outstanding amount owed
credit_term_days  INT DEFAULT 30            -- Payment due within N days of each credit order
credit_frozen     BOOLEAN DEFAULT FALSE     -- Manual override — freeze regardless of balance
```

### `credit_transactions` table
Immutable ledger — every debit (order) and credit (repayment) entry.

```sql
CREATE TABLE credit_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_wholesaler_id UUID NOT NULL REFERENCES retailer_wholesalers(retailer_id, wholesaler_id, category_id) -- composite FK via separate column
  retailer_id           UUID NOT NULL REFERENCES entities(id),
  wholesaler_id         UUID NOT NULL REFERENCES entities(id),
  transaction_type      TEXT NOT NULL CHECK (transaction_type IN ('DEBIT', 'CREDIT')),
                        -- DEBIT = credit used (order placed), CREDIT = repayment received
  amount                DECIMAL(12,2) NOT NULL,
  reference_type        TEXT CHECK (reference_type IN ('ORDER', 'REPAYMENT', 'ADJUSTMENT')),
  reference_id          UUID,           -- order.id or credit_repayments.id
  balance_after         DECIMAL(12,2),  -- snapshot of balance after this transaction
  notes                 TEXT,
  created_by            UUID REFERENCES user_profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
```

### `credit_repayments` table
Tracks each repayment from Retailer to Wholesaler.

```sql
CREATE TABLE credit_repayments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id     UUID NOT NULL REFERENCES entities(id),
  wholesaler_id   UUID NOT NULL REFERENCES entities(id),
  amount          DECIMAL(12,2) NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('CASH', 'RTGS', 'BANK_TRANSFER', 'MBOB', 'MPAY')),
  status          TEXT NOT NULL DEFAULT 'CREATED'
                    CHECK (status IN ('CREATED', 'PAYMENT_MADE')),
  due_date        DATE NOT NULL,         -- computed from order date + credit_term_days
  reference_no    TEXT,                  -- bank ref / RTGS ref
  notes           TEXT,
  created_by      UUID REFERENCES user_profiles(id),   -- Retailer or Wholesaler staff
  confirmed_by    UUID REFERENCES user_profiles(id),   -- Wholesaler who marks PAYMENT_MADE
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ
);
```

### `credit_alerts` table
Tracks which alerts have been sent to avoid duplicates.

```sql
CREATE TABLE credit_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repayment_id    UUID NOT NULL REFERENCES credit_repayments(id),
  alert_type      TEXT NOT NULL CHECK (alert_type IN ('PRE_DUE_3D', 'DUE_TODAY', 'OVERDUE_3D')),
  sent_to         TEXT NOT NULL CHECK (sent_to IN ('RETAILER', 'WHOLESALER', 'BOTH')),
  whatsapp_status TEXT DEFAULT 'PENDING',
  sent_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Credit Enforcement Logic

### Order Placement (CREDIT payment method)
```
Retailer places order with payment_method = CREDIT
  → Fetch retailer_wholesalers record for this Retailer ↔ Wholesaler pair
  → Check: credit_balance + order.grand_total > credit_limit
      → If YES and credit_frozen = FALSE → HARD BLOCK
           Error: "Credit limit exceeded. Outstanding: Nu.X, Limit: Nu.Y"
      → If YES and credit_frozen = TRUE (override active) → ALLOW
      → If NO → ALLOW
  → On order CONFIRMED:
      → credit_balance += order.grand_total (DB trigger)
      → Insert DEBIT entry into credit_transactions
      → Create credit_repayment record with due_date = CONFIRMED_AT + credit_term_days
```

### Repayment Flow
```
Wholesaler opens Admin Hub → Credit Management → Retailer list
  → Selects Retailer → Views outstanding balance + repayment history
  → Clicks "Record Repayment"
  → Enters: amount, payment_method, reference_no, notes
  → Repayment created with status = CREATED
  → credit_balance is NOT reduced yet

When money physically received:
  → Wholesaler marks repayment as PAYMENT_MADE
  → credit_balance -= repayment.amount (DB trigger)
  → Insert CREDIT entry into credit_transactions
  → balance_after snapshot recorded
  → If credit_balance < credit_limit → unfreeze automatically
```

### Credit Limit Override
```
Wholesaler Owner / Distributor / Super Admin can:
  → Set credit_frozen = TRUE on a retailer_wholesalers record
     (allows orders even when balance >= limit)
  → Increase credit_limit for a Retailer
  → View full credit_transactions ledger
```

---

## Due Date Alert Schedule

Alerts run via a scheduled job (Supabase Edge Function + pg_cron).

| Trigger | Alert type | Recipients |
|---------|-----------|-----------|
| 3 days before due_date | `PRE_DUE_3D` | Both |
| On due_date (unpaid) | `DUE_TODAY` | Both |
| 3 days after due_date (still unpaid) | `OVERDUE_3D` | Both |

Each alert type fires **once per repayment** — `credit_alerts` table prevents duplicates.

---

## DB Trigger Summary

| Event | Action |
|-------|--------|
| Order → CONFIRMED + payment_method = CREDIT | `credit_balance += grand_total`; DEBIT credit_transaction; create repayment |
| Order → CANCELLED (was CREDIT, was CONFIRMED) | `credit_balance -= grand_total`; CREDIT credit_transaction |
| Repayment → PAYMENT_MADE | `credit_balance -= amount`; CREDIT credit_transaction; auto-unfreeze if balance < limit |

---

## Implementation Checklist

### Schema
- [ ] Add `credit_limit`, `credit_balance`, `credit_term_days`, `credit_frozen` to `retailer_wholesalers`
- [ ] Create `credit_transactions` table
- [ ] Create `credit_repayments` table
- [ ] Create `credit_alerts` table
- [ ] DB trigger: CREDIT order confirmed → debit balance
- [ ] DB trigger: CREDIT order cancelled → credit balance
- [ ] DB trigger: repayment → PAYMENT_MADE → credit balance + auto-unfreeze
- [ ] DB function: block CREDIT orders when balance >= limit (unless frozen)

### Admin Hub (Wholesaler)
- [ ] Credit management dashboard — all Retailers with balances, limits, overdue flags
- [ ] Retailer credit detail — ledger, repayment history, repayment recording form
- [ ] Credit limit adjustment form (Wholesaler Owner + Distributor)
- [ ] Override / freeze controls

### POS Terminal
- [ ] Block CREDIT payment method at checkout when limit exceeded
- [ ] Show outstanding balance + available credit when CREDIT selected
- [ ] Alert banner if credit is near limit (< 20% remaining)

### Alerts
- [ ] Supabase Edge Function: daily scheduled alert check
- [ ] WhatsApp message templates for PRE_DUE_3D, DUE_TODAY, OVERDUE_3D
