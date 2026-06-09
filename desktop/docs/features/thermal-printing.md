# Feature — Thermal printing (receipts)

**Status:** built · **Scope:** desktop terminal.

## How it works
Two print paths from the renderer:
- **ESC/POS thermal** — `electron/printer.js` (escpos + escpos-usb, *optional* deps) auto-detects the
  first USB thermal printer; the renderer calls `api.printer.print(order, settings)` / `test()` over
  IPC. Settings → Thermal Printer shows status + a Test Print.
- **Browser fallback** — `window.print()` into a hidden window/iframe, for any OS-installed printer
  (`components/pos/receipt-modal.tsx`, `lib/print-utils.ts`).

## Setup
USB drivers are **not bundled** (to avoid build/system deps): `npm install escpos escpos-usb usb`
(+ replace the printer driver with WinUSB via Zadig on Windows). If absent, thermal printing is
disabled and the browser path is used — the receipt still prints.

## Labels vs receipts
Barcode/shelf/weighed **labels** use the same OS-print path (HTML + inline SVG + `@page` sizing),
**not** ESC/POS — see [weighed goods & labels](../../../web/docs/features/weighed-goods-labels.md)
and the design in [`../label-maker-plan.md`](../label-maker-plan.md).

## Pending
Receipt **paper width (58/80 mm)** and an optional **cash-drawer kick** are config follow-ons — see
[`../label-maker-plan.md`](../label-maker-plan.md) §2.
