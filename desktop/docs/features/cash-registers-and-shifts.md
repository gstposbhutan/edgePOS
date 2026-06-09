# Feature — Cash registers, shifts & audit

**Status:** built · **Scope:** desktop terminal.
**Related:** `web/docs/features/shift-management.md`.

## Registers = terminals
Each physical terminal is a `cash_registers` row keyed by **`machine_id`** (Windows MachineGuid via
`electron/machine-id.js`). `lib/register.ts` `getRegisterId()` auto-creates it on first run and
fetches it by `machine_id` thereafter (survives localStorage clears / reinstalls). `register_id` is
stamped on **orders, shifts, inventory_movements, cash_adjustments** so the cloud maps a register
1:1 on sync. Begin-Shift auto-selects this terminal's register (no picker).

## Shifts
Open with an opening float, close with a counted total. Reconciliation computes
`expected_cash = opening_float + Σ CASH sales − Σ CASH refunds + Σ cash-in − Σ cash-out` and a
discrepancy; a **Z-report** prints at close. `hooks/use-shifts.ts`, `components/pos/shift-modal.tsx`
+ `z-report-modal.tsx`. Each sale/refund links to the active shift.

## Cash adjustments
CASH_IN / CASH_OUT entries against the active shift, with reason/notes — `hooks/use-cash-adjustments.ts`,
`app/adjustments/page.tsx`.

## Audit log
`audit_logs` is **append-only**: INSERT/UPDATE/DELETE with old/new values + actor, written by a
PocketBase hook (`pb_hooks/audit.pb.js`) — not via the API.

## Migrations
`002_shifts.js` · `003_cash_adjustments.js` · `004_cash_registers.js` · `005_audit.js`.
