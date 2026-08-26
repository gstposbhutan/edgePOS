# Operational knowledge — facts that lived outside the repos

Transferred 2026-08-22 from the monorepo terminal's session memory so this repo is
self-sufficient. Point-in-time: verify against the live box before acting on specifics.
Companions: `HANDOVER.md` (state + next steps), `PLAN.md` (phases), `reference/` (design docs).

## The box

One self-hosted EC2 box, public IP **16.112.248.61** (t4g.large, 2 vCPU/8 GB, ap-south-2,
~$44/mo — the driver for the cost scale-down; lean product footprint measured ≈2.5 GB).
Apps use the **instance role over IMDS** for S3 — no AWS keys on disk.

- **Caddy** (systemd, `/etc/caddy/Caddyfile` — not in any repo yet) is the TLS front door.
  Vhosts: `app.pelbu.com`→:3007 (auth), `pos.pelbu.com`→:3100, `hotel.pelbu.com`→:3006,
  `travel.pelbu.com`→:3005, `supabase.pelbu.com`→:8000 (Kong), `grafana`→:3003, `status`→:3004.
- **Cloudflare DNS**, grey-cloud/DNS-only (orange breaks ACME): those A records → the box IP.
- **Supabase** self-hosted Docker: monorepo `infra/supabase/docker-compose.yml`, project
  `pelbu-supabase`, Kong on 127.0.0.1:8000, postgres 15.8. Secrets in `infra/supabase/.env`
  (gitignored). `NEXT_PUBLIC_SUPABASE_URL=https://supabase.pelbu.com` (hostname-based).
  `PGRST_DB_SCHEMAS=public,storage,graphql_public,travel,hotel,pos`.
- **Apply a migration**: `docker exec -i pelbu-supabase-db-1 psql -U postgres -d postgres
  < db/migrations/NNN_x.sql` then `NOTIFY pgrst, 'reload schema';` (run via psql too).
- **Deploy pattern (until cutover, from the monorepo)**: `npm run build -w @pelbu/pos &&
  docker compose up -d --build pos`. After cutover the same shape works from this repo's
  root compose.
- **NO automated DB backups have ever existed** (audited 2026-08-22 — no cron, no timer).
  Fix in Phase 3. Existing manual backups, two places:
  - **`backups/` in this repo (gitignored, disk-only)** — `full_20260813_234041.dump`
    (full DB, pre-category-Phase-3) + `phase3_tagtables_*.dump` (the dropped tag tables)
    + the 2 mBoB receipt sample JPEGs for the banking phase (financial data — never commit).
  - `/home/ubuntu/pelbu-backups/` (box-level, root-owned dir) — six timestamped snapshots
    from the 2026-07-13 migration day (P1/P2/P4 cutover: all.sql, postgres.dump, storage tgz).
  Copy both off-box for real safety; the box has no snapshot schedule.
- Old edgePOS-era containers still running: monitoring (grafana/prometheus/uptime-kuma/
  exporters — prometheus's postgres-exporter points at a dead container, metrics silently
  broken), `logistics-bridge`:3002 (delivery webhooks; source in `legacy/*` tags),
  `sync-worker` (**zombie** — source deleted 2026-07-06, only logs a heartbeat; kill it).

## Secrets / env / config inventory (as of 2026-08-22)

- **`web/.env` (this repo, gitignored)** — the live POS env: Supabase URL/keys, SendGrid,
  S3/img.pelbu.com, ZAI/GLM + Gemini keys, `LICENSE_SIGNING_PRIVATE_KEY` (Ed25519 .lic
  signer), `RELEASE_INGEST_TOKEN`. This is what the running container uses.
- **`~/edgepos-salvage/`** — off-repo secret backups: `auth.env` (auth app's env — release
  token + license key for the Phase 2 fold-in), `pms.env.local`, `travel.env.local`
  (retired apps), the pre-transplant edgePOS `web/.env*` files, and the tour videos.
- **`infra/Caddyfile` (committed)** — snapshot of `/etc/caddy/Caddyfile` (no secrets).
- **Supabase stack secrets** — `bhutan-tour-operator/infra/supabase/.env` + `volumes/`
  (kong.yml embeds the JWT keys); the stack still runs from there. Copy to
  `infra-supabase-live/` here (gitignored) when convenient:
  `cp -r ~/bhutan-tour-operator/infra/supabase ~/edgePOS/infra-supabase-live`
- **NOT transferable as files**: Cloudflare DNS + AWS account access are dashboard-level.
  (GitHub Actions secrets used to be listed here as missing — they are not. All four are
  present on this repo; see "Desktop terminal releases" below.)

## Shared services (used by the POS)

- **Email — SendGrid**: `web/lib/email/notify.js` → `sendEmail(to, subject, text, html)`.
  Env: `SENDGRID_API_KEY`, `NOTIFY_FROM_EMAIL` (noreply@app.pelbu.com), `NOTIFY_FROM_NAME`.
  (`SMTP_*` vars are GoTrue's auth emails — separate.)
- **Images — Supabase Storage over S3 protocol**, served at **img.pelbu.com**:
  `web/lib/storage/s3.js`. Env: `S3_IMAGES_BUCKET`/`GLOBAL_S3_BUCKET`,
  `S3_PROTOCOL_ACCESS_KEY_ID/SECRET`, `AWS_REGION`, `IMAGE_CDN_URL`.
- **AI — z.ai/GLM**: `api.z.ai` is TCP-blocked from the box; `.env` sets
  `ZAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4` (same account/key, China endpoint —
  official, not a hack). Models glm-5.2 / glm-4.6v / cogview-4-250304. Payment OCR:
  `ZHIPU_API_KEY` + `GEMINI_API_KEY` fallback. Client deploys run with AI off by default.

## Desktop terminal releases

- Release: bump `desktop/package.json` + CHANGELOG, commit, tag `desktop-vX.Y.Z`, push tag.
  CI (`.github/workflows/desktop-release.yml`, windows-latest) builds NSIS, uploads the .exe
  to S3 with AWS keys, then registers it at `${APP_URL}/api/desktop/releases/register`
  (`x-release-token`), which writes `pos.desktop_releases`.
  ⚠ **Two steps, not keyless.** The monorepo's keyless variant POSTed the installer to
  `/api/desktop/releases/upload` — that route does NOT exist here (`web/` serves only
  `latest` and `register`), so the keyless version 404s at publish AFTER a ~15-minute Windows
  build. The workflow header says so; do not "simplify" it back.
- Secrets: `APP_URL`, `RELEASE_INGEST_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
  **All four are present on gstposbhutan/edgePOS** (verified 2026-08-24 via `gh secret list`;
  set 2026-06-16). Earlier notes claiming they live only on the monorepo and must be
  re-created are wrong.
- Channels: tags containing `-beta`/`-rc` → beta; terminals only query stable.
  Current stable = **1.6.8** (tag `desktop-v1.6.8`, published 2026-08-26), installer
  219,361,415 bytes at `img.pelbu.com/releases/1.6.8/`. Owners download it from `/downloads`,
  which calls `/api/desktop/releases/latest`. Verify a release by checking that feed reports the
  new version and that the installer URL returns HTTP 200 with a matching `content-length`.
- **Installed terminals bake `DEFAULT_CLOUD_URL=https://app.pelbu.com`** for update checks and
  license register/status, and sync to `pos.pelbu.com/api/sync/*`. The auth app is retired, but
  this is **already handled**: `/etc/caddy/Caddyfile` keeps an `app.pelbu.com` vhost that
  reverse-proxies `/api/desktop/*` and `/api/license/*` to the POS app on :3100 and 301s
  everything else to `pos.pelbu.com`. Verified live 2026-08-24 — terminals keep auto-update.
  Do not delete that vhost.
- **A `.lic` cannot be re-sent.** It carries a plaintext per-terminal sync token stored only as
  a SHA-256, so there is no re-download endpoint by design. Lost or wiped licence → revoke the
  machine in the admin panel and issue it again. Note the terminal's activation window only
  offers "Request license"; when the machine is already licensed the server answers `LICENSED`
  and creates **no** admin-panel row — so a support call about "my request never arrived" is
  usually this. (Before 1.6.2 the window mis-reported that case as "ask your administrator".)
- **`%APPDATA%\pos-terminal` holds `pb_data` and `license.lic`** — the shop's whole local record.
  The folder is named for package.json `name`, NOT `build.productName`; never add a top-level
  `productName` to "tidy" it, as that moves `userData` and strands every installed terminal's data.
  Uninstalling deleted it until 1.6.2 (`nsis.deleteAppDataOnUninstall`), and the fix ships in the
  uninstaller, so terminals removed from 1.6.1 or earlier still lose everything. **Copy that
  folder before ever telling a shopkeeper to reinstall.**
- **PocketBase binds the first free port in 8090–8099** (since 1.6.1). "Could not start local
  database" is usually another program holding the port, not a corrupt database — check with
  `netstat -ano | findstr ":8090"` + `Get-Process -Id <PID>` and read the process name.
- Terminal auth: local PocketBase; `admin@pos.local` = internal super_admin.
  ⚠ **`NEXUS_SUPERADMIN_PASS` is NOT set in the release workflow** (checked 2026-08-26), so every
  shipped terminal falls back to **`admin12345`** — the shared well-known password the code
  comment says must never ship. Useful right now (it is the way into a terminal whose staff
  logins have not arrived), and a real gap to close: add the CI secret and pass it to the build.
  Note `seedDefaultUser` is idempotent, so a new password only applies to terminals installed
  fresh afterwards — existing ones keep `admin12345` until their data dir is reset.
  Store users mirror from `/api/sync/bootstrap` (same bcrypt hash → web password works
  offline). Terminals provision from `desktop/pb/pb_migrations/` (NOT setup-pb.js).
  Box is aarch64: fetch `pocketbase_*_linux_arm64` to run PB locally.

## Guided tours + e2e (restored 2026-08-22 — ⚠ needs an update pass)

- `web/e2e/` = 74 Playwright specs (POS/cart/GST/khata/riders/B2B/catalog) + 31 `tour-*`
  recording specs + page-objects + `lib/tour-overlay.js` (caption overlay engine);
  `web/playwright.config.js` (11 projects; `workers:1` is load-bearing — specs share one
  entity). `web/desktop-tour-*.cjs` = the chromium-vs-:3200 workaround for recording the
  Electron terminal. Docs: `web/e2e/docs/`, `web/docs/guided-tour-flows.md`,
  `web/docs/TEST_ACCOUNTS.md`.
- The 13 narrated onboarding videos (~190 MB webm + mp4) are at `web/e2e/recordings/`
  — **gitignored, exist only on this disk + `~/edgepos-salvage/`**. Copy off-box for safety.
- ⚠ **Everything here targets the mid-July app.** Six weeks of UI drift since (product
  register, FEFO batch flows, HSN categories, modal fixes, per-vendor themes) means specs
  need revalidation and the videos re-recording once the standalone app settles. The
  `c1–c5` WhatsApp specs are dead (WhatsApp was purged — email/in-app only now).

## Partners, decisions, test logins

- **Two partners**: **Innovates** (POS retail) and **Fame Digital** (POS + travel/hotel —
  travel side now retired with the suite). Meeting records: `reference/MEETING-*.md`.
  Standing decisions: shifts per-vendor (off by default), refunds+replace but NO exchange,
  vendor themes, FEFO/FIFO (built), 3 terminals/shop (`merchant_profiles.license_limit`),
  shop creation admin-only (still to do), day/night mode removed, dev+prod split.
  Infra handover to Rajiv pending partner credit card; banking phase blocked on 3-bank data.
- **The client brief** (`docs/pos-brief.html`) supersedes scale assumptions: 10 shops,
  Nu 500/shop/month, droplet in the client's own account, camera-pad differentiator.
- **mBoB banking (P11, analysis done, build deferred)**: ≥2 receipt templates (merchant
  payment vs fund transfer — labels/order/fields differ); journal no `126-<9 digits>`;
  amounts `Nu.` + comma thousands; accounts masked first2+last2; date sometimes combined
  24h, sometimes split 12h → extract by meaning, not position. Sample screenshots are in
  the monorepo's untracked `backups/` (financial data — never commit). Existing
  `web/lib/vision/server-payment-ocr.js` verifies amount only; banking needs
  counterparty/purpose/direction/type too.
- **Known soft gaps**: 3 customer notifications lost their only (WhatsApp) channel and were
  never re-wired to email — marketplace order confirmation (`api/shop/orders`), payment
  receipt (`api/shop/pay/[orderId]`), DELIVERED payment-link (`api/shop/orders/[id]` +
  `api/rider/orders/[id]/deliver`). Wire to `sendEmail`/`notifyEntity` when wanted.
- **Dev test logins** (dev box only): the three staff accounts all belong to **Dawai
  Tshongkhang** (`dawai-tshongkhang`, RETAILER, entity `a0000000-0000-4000-8000-000000000004`)
  and share the password **test1234** — `retailer@nexus.bt` (OWNER), `manager@nexus.bt`
  (MANAGER), `cashier@nexus.bt` (CASHIER); super-admin `admin@nexus.bt` (same password). NOTE its SUPER_ADMIN claim lives in
  `raw_user_meta_data.role`, while `super@pelbu.test` carries it in `raw_app_meta_data.role` —
  a query that checks only one of the two will wrongly conclude an account is not an admin. Verified against the
  stored hashes 2026-08-26. The same credentials work on a terminal once it has bootstrapped
  (the bcrypt hash mirrors down); `admin@pos.local` is the terminal-only super_admin and never
  syncs. Terminal-flow test artifacts should be deleted after use.
- **Email conventions**: owner/commit identity `shawn.manuel@gmail.com`; user-testing
  account `shan.manuel@gmail.com`; NEVER use `shawn.manuel@stirrup.works`; use
  `@example.com` for generic test data.
