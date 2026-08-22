# DEPRECATED — Credit Ledger & Repayment Tracking

**This feature has been merged into [F-KHATA-001: Unified Khata](consumer-khata.md).**

All B2B credit logic (Retailer ↔ Wholesaler, Distributor-set limits, repayment tracking, due-date alerts) is now handled by the unified khata system alongside B2C consumer credit. Same tables, same enforcement rules, same alert schedule.

**Key changes in the merge:**
- `credit_transactions`, `credit_repayments`, `credit_alerts` tables → replaced by `khata_transactions`, `khata_repayments`, `khata_alerts`
- Credit columns on `retailer_wholesalers` → removed, replaced by `khata_accounts` rows with `party_type = 'RETAILER'`
- Distributor and Wholesaler credit management screens → unified into F-KHATA-001's Admin Hub section

**Feature ID**: F-CREDIT-001
**Status**: Superseded by F-KHATA-001 (2026-04-25)
