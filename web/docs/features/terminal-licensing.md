# Feature — Terminal licensing & activation (.lic)

**Status:** built (2026-06) · **Scope:** RETAILER desktop terminal only.
**Detailed design / runbook:** `provisioning-and-licensing-plan.md`. **Related:** `terminal-provisioning.md`, `desktop-shell.md`.

## What it is
Every retailer desktop terminal is gated by a **machine-locked, signed `.lic`**. Without a valid
licence the POS UI never loads — only an activation window. The `.lic` also *provisions* the
terminal (it carries the sync token + cloud URL), so activation and first-run setup are one step.

## Token format
`nxslic.<base64url(payloadJSON)>.<base64url(Ed25519 sig)>` — signature covers `nxslic.<payload>`.
```jsonc
{ "lic_id","entity_id","store_name","machine_id","tier","issued_at","expires_at",
  "sync": { "ingest_url": "https://<cloud>/api/sync/ingest", "token": "nxs_…" } }
```
Signed with the vendor **Ed25519 private key** (`LICENSE_SIGNING_PRIVATE_KEY`, server-only); the
desktop embeds only the **public key** (`web/lib/license/public-key.js`) for offline verify.

## Flow
1. **First launch** → activation window shows the **Machine ID** (Windows MachineGuid).
2. **Request licence** (optional) → terminal POSTs its `machine_id` to `POST /api/license/request`
   → a PENDING `license_requests` row. The cloud URL is baked in (`electron/config.js`
   `DEFAULT_CLOUD_URL`; `NEXUS_CLOUD_URL` env override in dev) so the operator just clicks.
3. **Issue** (super-admin, web `/pos/licenses` → `POST /api/admin/licenses`): pick the RETAILER
   store + Machine ID (the pending terminal pre-fills it), mint the per-terminal sync token (only
   `sha256` stored in `terminal_tokens`), sign, return the `.lic` **once**. The **ingest URL is
   derived server-side** from `NEXT_PUBLIC_APP_URL` — the admin never types it.
4. **Activate** → operator **uploads** the `.lic` (or pastes it). The desktop verifies it
   **offline** (signature → expiry → machine-lock), saves it to `userData/license.lic`, derives the
   sync config from `sync.{ingest_url, token}`, and runs the first-run bootstrap (see
   `terminal-provisioning.md`). Then the POS opens. Subsequent boots re-verify and go straight in.
5. **Revoke** → `DELETE /api/admin/licenses/[id]` deactivates the licence **and** its sync token;
   `GET /api/license/status` is the online revocation check.

## Key files
- **Desktop:** `electron/license.js` (Ed25519 verify), `license-store.js` (persist + per-boot
  check), `machine-id.js` (MachineGuid → MAC → hostname), `config.js` (`DEFAULT_CLOUD_URL`),
  `activation.html` + `activation-preload.js` (window: machine id, request, upload), `main.js`
  (startup gate in `whenReady`, `license:activate/request/proceed` IPC).
- **Web:** `lib/license/{sign,public-key}.js`, `app/api/admin/licenses/**`, `app/api/license/**`,
  `app/pos/licenses/page.jsx`, tables `licenses` + `terminal_tokens` + `license_requests`.

## Config
- `DEFAULT_CLOUD_URL` (`desktop/electron/config.js`) — baked cloud URL for the pre-activation
  "Request licence" step; change + rebuild to move clouds. Dev override: `NEXUS_CLOUD_URL` env.
- `NEXT_PUBLIC_APP_URL` (web) — the cloud's own URL; the issuer derives the `.lic` ingest URL from it.
- Dev: `NEXUS_FORCE_LICENSE=1` exercises the gate under `electron:dev` (otherwise dev bypasses it).

## Multi-shop & limits
Each shop is its own `entity`, so a multi-shop retailer gets a separate machine-locked `.lic` per
terminal per shop (the `licenses`/`terminal_tokens` tables allow N per entity). **No** per-entity
seat/device cap yet — `tier` is informational.

## Open / pending
- Single-instance lock (`app.requestSingleInstanceLock()`); **Authenticode** signing for the installer.
- Desktop-side periodic **online revocation** polling (offline sig+expiry+machine-lock enforced now).
- Per-shop seat/device limits. See `pending-tasks.md`.
