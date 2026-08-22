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

- Release = on this repo now: bump `desktop/package.json` + CHANGELOG, commit, tag
  `desktop-vX.Y.Z`, push tag. CI (`.github/workflows/desktop-release.yml`, windows-latest)
  builds NSIS and POSTs the .exe (multipart, `x-release-token`) to
  `app.pelbu.com/api/desktop/releases/upload`; the box uploads to S3 via instance role and
  registers in `pos.desktop_releases`. **Keyless** — repo secrets needed: `APP_URL` +
  `RELEASE_INGEST_TOKEN` (⚠ currently configured on the MONOREPO's GitHub repo, must be
  re-created on gstposbhutan/edgePOS before the first release from here).
- Channels: tags containing `-beta`/`-rc` → beta; terminals only query stable.
  Current stable = **1.4.0**; `desktop/` here contains ~6 unreleased commits' worth
  (auth/role sync, super-admin seeding, F11 fullscreen fix) awaiting a tag + runtime QA.
- ⚠ **Installed terminals bake `DEFAULT_CLOUD_URL=https://app.pelbu.com`** for update
  checks and license register, and sync to `pos.pelbu.com/api/sync/*`. The auth app is
  being retired — either keep an `app.pelbu.com` vhost routing `/api/desktop/releases/*`
  (the POS app has these routes) or accept deployed terminals lose auto-update.
- Terminal auth: local PocketBase; `admin@pos.local` = internal super_admin (set
  `NEXUS_SUPERADMIN_PASS` at build — `admin12345` is a DEV fallback, never ship it).
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
- **Dev test logins** (dev box only): `retailer@nexus.bt` / `manager@nexus.bt` = test1234;
  super-admin `admin@nexus.bt`. Terminal-flow test artifacts should be deleted after use.
- **Email conventions**: owner/commit identity `shawn.manuel@gmail.com`; user-testing
  account `shan.manuel@gmail.com`; NEVER use `shawn.manuel@stirrup.works`; use
  `@example.com` for generic test data.
