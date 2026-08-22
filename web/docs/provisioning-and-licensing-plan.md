# Plan — Terminal provisioning (cloud→PocketBase bootstrap) + `.lic` license gating

**Target deployment:** Windows 10+ (Electron desktop app, per-terminal embedded PocketBase).

> **Scope (2026-06-08):** the desktop app — offline POS + embedded PocketBase + `.lic` activation + sync/bootstrap — is **RETAILER-only**. Wholesalers, distributors, customers, riders, and super-admin are **web-only** (no offline desktop). Therefore `.lic` licensing, the cloud→terminal bootstrap, and the terminal→cloud push all pertain to **RETAILER terminals only**. Follow-up: the license issuer (`/pos/licenses`) should restrict its entity picker to **RETAILER** entities (it currently lists all).

> **Built so far (2026-06-08) — web super-admin license issuer (§A "Issuance" + §D Web).** Ed25519 keypair generated (private in gitignored `web/.env.local` as `LICENSE_SIGNING_PRIVATE_KEY`; public committed at `web/lib/license/public-key.js` — embed this in the desktop for offline verify). `web/lib/license/sign.js` builds/verifies the `nxslic.<b64url payload>.<b64url sig>` token. Routes: `POST/GET /api/admin/licenses` (super-admin issue/list — issuing also mints the per-terminal sync token, stores only its sha256 in `terminal_tokens`, embeds the plaintext in the `.lic`, records the license for revocation), `DELETE /api/admin/licenses/[id]` (revoke → deactivates the license **and** its sync token), public `GET /api/license/status?lic_id=` (desktop online revocation check). UI `web/app/pos/licenses/page.jsx` (super-admin-gated, machine-locked issue form + auto-download + list/revoke). `licenses` table folded into the consolidated `001_schema.sql` (RLS-on, service-role-only). **Verified:** tsc/eslint clean; sign/verify roundtrip + tamper detection; issue→revoke deactivates license + token together. **Machine-ID self-registration (web side built, 2026-06-08):** a new terminal POSTs its `machine_id` to **`POST /api/license/request`** (public) on first start → a **PENDING** `license_requests` row (one per machine, dedup by `machine_id`; `GET ?machine_id=` lets it poll `PENDING`/`ISSUED`/`LICENSED`). The issuer UI shows pending terminals and a **"Use"** button pre-fills the Machine ID into the issue form — so the super-admin never types it (no typos). Issuing marks the request `ISSUED` + links the license. **Verified:** table + RLS, dedup (2 registers → 1 row), issue→ISSUED; tsc/eslint. **Desktop track — now COMPLETE (2026-06-08):** machine-id (MachineGuid), `.lic` verify + startup gate + activation window (incl. machine_id self-registration), `doBootstrap()`, and `pocketbase.exe` bundling are all built + verified. See the **AS-BUILT** section below.

**Decisions (locked):**
1. **Coupled** — the `.lic` carries the entity + sync token + ingest URL, so importing it both *activates* the app and *auto-provisions* the bootstrap/push sync. One-step setup, no manual token entry.
2. **Machine-locked** — the `.lic` is bound to this terminal's machine fingerprint.
3. **Offline + online revocation** — signature/expiry verified locally every launch (works offline); a cloud revocation check runs when the terminal is online.

---

## ✅ AS-BUILT (2026-06-08) — implemented + verified

The plan below is now **implemented end-to-end** for RETAILER terminals. Verified headlessly on Windows: the real `pocketbase.exe` applies all migrations (incl. `sold_by_weight`); `.lic` activate (machine-locked) → live `GET /api/sync/bootstrap` over HTTP → upsert into a live PocketBase (read-back confirms `sale_price`/`sold_by_weight`); `npm run electron:build:win` produces a signed NSIS installer. Manual GUI checklist: **`desktop/docs/qa-packaged-build.md`**.

**Implemented**
- **`pocketbase.exe` bundling** — `desktop/scripts/fetch-pocketbase.mjs` fetches the pinned PocketBase **v0.37.3** per platform into `pb/`; `pb-launcher.js` selects `pocketbase.exe` on win32 (never the Linux ELF). Wired into `electron:build:win` (`pb:fetch` → `next build` → `electron-builder --win`). Binaries gitignored.
- **Machine id** — `desktop/electron/machine-id.js`: Windows **MachineGuid** (registry) → MAC → hostname.
- **`.lic` verify** — `desktop/electron/license.js` (Ed25519, embedded public key = `web/lib/license/public-key.js`) + `license-store.js` (read/save `userData/license.lic`, re-verify against this machine each boot).
- **Startup gate + activation window** — gate in `electron/main.js whenReady`; standalone `electron/activation.html` (+ `activation-preload.js`) shows the Machine ID, **Request license** (POSTs machine_id), and paste-`.lic` → **Activate**. Dev bypass unless `NEXUS_FORCE_LICENSE=1`.
- **Bootstrap** — `GET /api/sync/bootstrap` (token-auth, entity-from-token) maps Supabase `selling_price → PB sale_price` and carries `sold_by_weight`; `doBootstrap()` (main.js) upserts categories→products→khata into local PB. Auto-runs on activation; manual **"Pull catalog from cloud"** in Settings.
- **Cloud URL config** — `desktop/electron/config.js` `DEFAULT_CLOUD_URL` (baked; change + rebuild to move clouds), overridable in dev via the **`NEXUS_CLOUD_URL`** env var. The activation window pre-fills it so the operator just clicks Request license.

**Deploy a terminal (runbook)**
1. Set the cloud URL: edit `DEFAULT_CLOUD_URL` in `desktop/electron/config.js` to the production cloud, then `cd desktop && npm run electron:build:win` → `release/NEXUS BHUTAN POS Setup <v>.exe`.
2. Install on the Windows terminal; first launch → activation window (shows the Machine ID).
3. Operator clicks **Request license** (registers the machine); a SUPER_ADMIN issues the `.lic` at **`/pos/licenses`** (pick the RETAILER entity; ingest URL = `<cloud>/api/sync/ingest`).
4. Paste the `.lic` → **Activate** → bootstrap pulls the catalog → POS opens. Subsequent launches go straight to the POS.

**Remaining / hardening (not launch-blockers)**
- **Single-instance lock** — `app.requestSingleInstanceLock()` is still TODO; without it a second app instance clashes on the userData/cache dir (seen as Chromium "cache Access denied" warnings). Recommended before GA.
- **Authenticode signing** — `electron-builder` currently test-signs via the bundled `signtool`; ship with a real code-signing cert so SmartScreen/Defender don't block first run.
- **HSN master in bootstrap** — products carry `hsn_code` directly; the `hsn_master` reference table isn't pulled yet (follow-on).
- **Desktop online revocation** — `GET /api/license/status` exists; wiring the periodic online revocation check into the desktop is a follow-on (offline signature + expiry + machine-lock are enforced now).

---

## 0. Windows 10+ deployment prerequisites (do these regardless)

- **✅ RESOLVED — Windows PocketBase binary.** `npm run pb:fetch` (`scripts/fetch-pocketbase.mjs`) downloads `pocketbase.exe` (pinned v0.37.3) into `pb/`; `pb-launcher.js` selects it on win32. `electron:build:win` fetches it automatically before packaging. (The committed `pb/pocketbase` Linux ELF is still tracked but is never used on Windows.)
- **Machine fingerprint = Windows MachineGuid.** Use `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` (stable across reboots/NIC changes; only changes on OS reinstall) as the primary machine id for license binding — *not* the current first-MAC heuristic (Hyper-V/VPN/USB adapters and MAC randomization make MAC unstable on Windows). Fallback chain: MachineGuid → BIOS/baseboard serial (`Get-CimInstance Win32_BIOS`) → MAC. Keep the existing MAC-based `getMachineId()` for the `cash_registers` identity, OR (recommended for new deployments) align both to MachineGuid.
- **Installer + trust:** NSIS target is already configured. Code-sign the `.exe` + installer (Authenticode) so Windows SmartScreen/Defender doesn't block first run on operator machines.
- **Single instance:** `app.requestSingleInstanceLock()` — prevent two POS instances on one terminal.
- **Paths:** `.lic` and `pb_data` live under `app.getPath('userData')` (`%APPDATA%\<app>`), already the prod data dir.

---

## A. `.lic` license gating

### Format (signed, offline-verifiable)
A compact EdDSA-signed token (or `{payload, sig}` JSON). Payload:
```jsonc
{
  "lic_id":      "uuid",          // for revocation lookup
  "entity_id":   "uuid",          // the store
  "store_name":  "Dawai Tshongkhang",
  "machine_id":  "<MachineGuid>", // machine-lock (decision 2)
  "tier":        "STANDARD",
  "issued_at":   "2026-06-08T..",
  "expires_at":  "2027-06-08T..",
  "sync": { "ingest_url": "https://<prod>/api/sync", "token": "nxs_…" } // decision 1
}
```
Signed with the **vendor Ed25519 private key**; the desktop embeds the **public key**. Ed25519 via Node `crypto` (built in, works on Windows).

### Startup gate (`electron/main.js whenReady`, before `createWindow()`)
1. Read `userData/license.lic`. Missing → open the **activation window** (import a `.lic`); don't load the POS.
2. Verify: signature (embedded pubkey) → `expires_at` not past → `machine_id` == this machine's MachineGuid.
3. If online: revocation check (below). Offline → skip (grace).
4. Valid → set `syncConfig` from `lic.sync` (ingest URL + token), then provision (§B) / normal start. Invalid/expired/revoked → activation/error window with the reason.

PocketBase may still launch (local DB), but the **POS UI is gated** behind a valid license.

### Issuance (web, super-admin only)
- A signer that takes (entity, machine_id, tier, expiry) → builds the payload → signs with the vendor private key → returns the `.lic` for download. Private key stays **server-side** (env/secret) or in an offline signing script — never shipped.
- Bind to a `terminal_tokens` row (the `sync.token`); record `lic_id` in a `licenses` table for revocation + audit.

### Revocation (online, when connected)
- `GET /api/license/status?lic_id=…` (or reuse `terminal_tokens.is_active`) → if revoked/inactive, the terminal blocks on next online launch. Offline launches rely on signature + expiry only (grace until reconnect).

### Lifecycle
issue → operator imports `.lic` (first run / activation window) → verified each launch → renew before `expires_at` (re-issue) → revoke server-side if lost/cancelled.

---

## B. First-run bootstrap (cloud → terminal PocketBase)

### Detection
Extend the existing first-launch check (`whenReady`): if not provisioned (`settings.store_entity_id` unset / `products` empty) → run `doBootstrap()` before normal operation. Idempotent, so it can also be a manual "re-sync catalog".

### Transport + auth
`GET /api/sync/bootstrap` — authenticated by the **terminal token** (from the `.lic`), entity resolved **from the token** (same model as `/api/sync/ingest`). Returns the store's dataset, paginated. `doBootstrap()` (Electron main, sibling of `doSync`) fetches and loads into local PocketBase as superuser.

### Data pulled — reconciled by BUSINESS KEYS, idempotent (upsert into PB)
| Cloud → PB | Business key | Notes |
|---|---|---|
| entity → `settings` | (the entity) | store_name, tpn_gstin, address, gst_rate, `store_entity_id` |
| products | `sku` | name, barcode, hsn_code, prices (mrp/sale/wholesale), `current_stock`, category |
| categories / product_categories | name/slug | |
| hsn_master | `code` | 926 rows reference data (GST) |
| khata_accounts | phone, else name | existing credit customers + balances |

- **Not** orders / inventory_movements (operational; the terminal starts fresh and pushes upstream). The terminal still **creates its own** `cash_registers` row (machine_id) per the existing design.
- **Stock:** bootstrap seeds *initial* stock from the cloud; thereafter each terminal owns its stock and reconciles upstream via movements. (Multi-terminal-same-store stock divergence is a known follow-on — out of v1.)
- Reverse-reconciliation helpers live in `sync-core` (the mirror of `syncTerminalBatch`), so cloud↔terminal mapping has one source of truth.

---

## C. Coupled activation + provisioning (the unified flow)
Import `.lic` → verify (signature/expiry/machine) → extract `entity_id` + `sync.{ingest_url, token}` → set `syncConfig` → `doBootstrap()` (pull catalog/khata/settings) → terminal self-registers its `cash_registers` row → ready → `doSync()` push loop begins. **One file, one step.**

---

## D. Components to build

**Web (cloud)**
- `GET /api/sync/bootstrap` — token-auth, entity-scoped, paginated catalog/khata/settings/hsn.
- `licenses` table (lic_id, entity_id, machine_id, token ref, tier, issued/expires, is_active) + revocation endpoint.
- Super-admin **license issuer** (sign + download `.lic`); vendor private key server-side.
- `sync-core`: reverse reconcilers (cloud→PB mappers).

**Desktop (Electron)**
- `lib/license.*` — Ed25519 verify (embedded pubkey), expiry, machine-id match; load/import `.lic`.
- `lib/machine-id` — Windows MachineGuid (registry) with fallback chain.
- Startup gate + **activation window** in `main.js`.
- `doBootstrap()` + cloud→PB loaders; first-run/provisioning detection.
- Packaging: bundle `pocketbase.exe`; code-sign; single-instance lock.

**Crypto / ops**
- Generate the vendor Ed25519 keypair once; embed public key in the app; guard the private key.

---

## E. Suggested phasing
1. **Win packaging unblock** — bundle `pocketbase.exe`, confirm the app runs on a clean Win10/11 box. *(Blocker; independent of the features.)*
2. **Bootstrap** — `/api/sync/bootstrap` + `doBootstrap()` + reconcilers (manual token first; provisioning works end-to-end).
3. **Licensing** — keypair, `.lic` format + verify, startup gate + activation window, web issuer.
4. **Couple** — `.lic` carries token+URL → one-step activate+provision.
5. **Revocation + machine-lock hardening**, renewal UX.

## F. Out of v1 (flag)
- Ongoing **delta refresh** (periodic catalog/price/khata pull from the central brain) — bootstrap is first-run; delta is phase 2.
- Multi-terminal-same-store **stock reconciliation**.
- Hardware-change **re-activation** UX (machine-lock means a new box needs a re-issued `.lic`).
