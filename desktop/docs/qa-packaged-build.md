# QA — packaged-build end-to-end (install → activate → bootstrap → POS)

The retailer desktop terminal. This is the manual GUI pass; the **data flow underneath is already
automated-verified** (see "Automated coverage" at the bottom) — this checklist covers only what
needs a human + a real screen.

## Prerequisites
- Windows 10/11 (x64).
- The cloud (web app + Supabase) reachable from the terminal, with its URL known.
- A **SUPER_ADMIN** account to issue the `.lic` (at `/pos/licenses` / `/admin`).
- A **RETAILER** entity that owns some products (only RETAILER terminals are licensable).

## 1. Build the installer
```
cd desktop
npm run electron:build:win      # fetches pocketbase.exe (v0.37.3 win), next build, electron-builder --win
```
→ produces `desktop/release/NEXUS BHUTAN POS Setup <version>.exe` (NSIS).

## 2. Install + first launch (no license yet)
- [ ] Run the installer; launch the app.
- [ ] **Activation window appears** (not the POS). It shows the **Machine ID** (`win-<MachineGuid>`).
- [ ] PocketBase starts (local DB) — no "could not start database" dialog.

## 3. Request + issue the license
- [ ] In the activation window, enter the **cloud server URL** and click **Request license**.
      → success message; the machine self-registers (`license_requests`, status PENDING).
- [ ] As SUPER_ADMIN, open `/pos/licenses` → the machine appears under **Pending terminals**.
- [ ] Click **Use** (pre-fills the machine_id), pick the retailer entity, set the **ingest URL**
      (`https://<cloud>/api/sync/ingest`), issue → a `.lic` file downloads.

## 4. Activate
- [ ] Paste the `.lic` into the activation window → **Activate**.
- [ ] Status: "Activated for <store>. Pulled N products. Opening POS…" (bootstrap ran).
- [ ] The **POS opens** automatically.

## 5. Verify in the POS
- [ ] Products are present (bootstrap pulled the catalog). Open **Inventory** → list populated.
- [ ] A **weighed** product (one flagged "Sold by weight" in the web editor) → adding it at
      checkout opens the **weight-entry modal**; entering e.g. `1.5` shows total = 1.5 × rate.
- [ ] **Add & Print** prints a label (name + weight + computed price + Code128). **Add** alone
      adds the weighed line to the cart.
- [ ] **Inventory → Label** prints a shelf label for any product.
- [ ] **Settings → Barcode Labels**: change size/symbology/copies → **Test label** prints;
      **Save labels** persists (per-terminal).

## 6. Restart + negative cases
- [ ] Quit + relaunch → goes **straight to the POS** (valid `.lic`, no activation window).
- [ ] (Optional) Move the `.lic` to a different machine → activation rejects with
      "for a different machine" (machine-lock). Expired/tampered `.lic` → rejected.

## Automated coverage (already proven — no need to re-test manually)
- `.lic` verify: signature + expiry + **machine-lock** (6/6 cross-app, incl. issuer-shaped payload).
- `pocketbase.exe` (v0.37.3 win) launches and applies **all migrations incl. 006** (`sold_by_weight`).
- **Activate → bootstrap(HTTP) → local PocketBase**, real components: live `/api/sync/bootstrap`
  (200, 1000 products, `selling_price→sale_price` + `sold_by_weight` mapped) → upsert into a live
  `pocketbase.exe`; read-back confirms the fields landed.
- Label generation core: 17 unit tests.
- `npm run build` (desktop): production export compiles clean.

So the manual pass is really about the **Electron shell + window flow + printer hardware** — the
data/licensing/bootstrap logic underneath is verified.

## Notes
- **Sync worker**: the cloud→terminal **bootstrap** and terminal→cloud **ingest** are plain Next
  API routes (`/api/sync/bootstrap`, `/api/sync/ingest`) using the Supabase service client — they do
  **not** depend on the `services/sync-worker`. The sync-worker is the separate continuous
  background-sync mechanism; it does not need to be running for activation/bootstrap.
- Dev bypass: under `next dev` the license gate is skipped unless `NEXUS_FORCE_LICENSE=1`.
