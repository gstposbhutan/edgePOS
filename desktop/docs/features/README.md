# Desktop app — feature docs

Per-feature documentation for the **offline retailer POS terminal** (Electron + embedded
PocketBase). Desktop-only features are documented here; **cross-app** features (which also involve
the web cloud) link to the shared hub in `web/docs/features/` to avoid duplication.

## Desktop-only
- [Offline POS](offline-pos.md) — cart, checkout, GST 5%, payment, receipt, multi-cart, keyboard nav
- [Cash registers, shifts & audit](cash-registers-and-shifts.md) — register = terminal, shifts, cash adjustments, Z-report, audit log
- [Thermal printing](thermal-printing.md) — ESC/POS receipts + the OS print fallback

## Cross-app (canonical doc in `web/docs/features/`)
- Licensing & activation → [`terminal-licensing.md`](../../../web/docs/features/terminal-licensing.md)
- Provisioning / first-run bootstrap → [`terminal-provisioning.md`](../../../web/docs/features/terminal-provisioning.md)
- Terminal → cloud sync → [`offline-sync.md`](../../../web/docs/features/offline-sync.md)
- Weighed goods & label maker → [`weighed-goods-labels.md`](../../../web/docs/features/weighed-goods-labels.md) (design: [`../label-maker-plan.md`](../label-maker-plan.md))
- Electron shell → [`desktop-shell.md`](../../../web/docs/features/desktop-shell.md)

## Also see
- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — full developer reference
- [`../qa-packaged-build.md`](../qa-packaged-build.md) — packaged-build QA checklist
- [`../../../web/docs/pending-tasks.md`](../../../web/docs/pending-tasks.md) — open / pending work
