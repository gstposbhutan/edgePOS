# Handover — continuing the POS port in this repo

**Read this first.** Written 2026-08-22, the day the POS was transplanted back into this repo.
This doc is self-contained: the session that continues here has no access to the monorepo
terminal's context or memory. Companions: `docs/PLAN.md` (the full phase plan — Phases 0–1 are
DONE, you are picking up at **Phase 2**), **`docs/KNOWLEDGE.md` (operational facts: box, deploy,
desktop releases, partners, test logins — read it with this doc)**, `docs/reference/` (13 design
docs / decision records carried over from the monorepo), `docs/pos-brief.html` (the client's
requirements), `docs/pos-brief-response.html` (our reply to them), root `README.md` + `CLAUDE.md`
(layout + ground rules).

**Restored 2026-08-22 (second commit): the guided-tour + e2e system** — `web/e2e/` (74 specs +
31 tour-recording specs + page objects + tour-overlay engine), `web/playwright.config.js`,
`web/desktop-tour-*.cjs` (Electron recording workaround), `web/docs/` (54 feature docs, 35
mermaid flows, HSN tariff PDF, test accounts), the 3 unmerged desktop e2e specs, and the 13
narrated onboarding videos at `web/e2e/recordings/` (gitignored — disk + `~/edgepos-salvage/`
only). ⚠ **The tours/specs target the mid-July app and need an update pass** — six weeks of UI
drift (product register, FEFO, HSN categories, modal fixes, themes); WhatsApp specs are dead.
Re-validate specs → re-record videos once the standalone app settles (add as a task after
Phase 2).

## Where things stand

- **Branch `v2`, commit `90db965`** — the pre-cutover tree was replaced with the live codebase
  from the `bhutan-tour-operator` monorepo (`apps/pos` @ 2026-08-22, includes everything through
  migration 133). `next build` verified clean. **Not pushed to origin yet** (gstposbhutan/edgePOS)
  — Shawn's call on when.
- **CUTOVER DONE (2026-08-22, Shawn's call, pulled ahead of Phase 5): pos.pelbu.com is served
  by THIS repo** — container `pelbu-pos-pos-1` built from this tree (`docker compose up -d
  --build pos` at repo root), verified 200 locally + through Caddy. The suite is STOPPED:
  `pelbu-pos-1` (old monorepo build), `pelbu-auth-1` (:3007 / app.pelbu.com),
  `pelbu-travel-1` (:3005), `pelbu-pms-1` (:3006), and the `sync-worker` zombie.
  Consequence until Phase 2 ships: no browser login page (it lived in the auth app).
  Existing sessions keep working (GoTrue session refresh is in the Supabase stack, still up)
  and `POST /api/auth/login` works for API login. **Shawn: the platform is down for
  maintenance — no urgency**; Phase 2 proceeds in its normal order.
  ⚠ app.pelbu.com is dead → installed desktop terminals' update-check/license-register too
  (see Phase 2 item 4). Still running: `pelbu-supabase-*` stack (Kong 127.0.0.1:8000, db 5432)
  + edgePOS-era monitoring containers (grafana/status vhosts). Caddy snapshot committed at
  `infra/Caddyfile` (live file: `/etc/caddy/Caddyfile`; pos.pelbu.com→:3100 unchanged).
- **Secrets**: `web/.env` is present (gitignored, copied from the monorepo app — the container's
  live env). Old env files + the 13 narrated tour videos (~190 MB, exist nowhere else) are in
  `~/edgepos-salvage/`. Full pre-transplant history: `~/edgepos-pre-homecoming-2026-08-22.bundle`
  + the in-repo `legacy/*` tags. `~/edgePOS-trash-pre-v2/` is disposable old node_modules.
- **The monorepo (`/home/ubuntu/bhutan-tour-operator`) is now hands-off** for POS work: no new
  POS code or migrations there. It's parked as the retired suite's archive.

## Ground rules (repeated from CLAUDE.md because they bite)

1. **Commits in this repo are anonymous** — Shawn's identity only (`shawnomanuel /
   shawn.manuel@gmail.com`), no AI/assistant mentions, no Co-Authored-By or session trailers.
2. **POS tables live in the Postgres `pos` schema**; raw SQL must target `pos.*` (the app's
   PostgREST client defaults there; shared identity tables are in `public` behind `pos.*` views).
3. `db/` is append-only — next migration is `134_*.sql`, applied via `psql` against the box's
   Supabase Postgres.
4. RLS is largely OFF — `getAuthContext()` hands back the service-role client; every query must
   scope by `entityId`. (Hardening is a Phase 3/handover item — see PLAN.md open question 4.)

## Phase 2 — standalone-ize: CODE DONE (2026-08-22), deploy gated on Shawn

All four items landed on `v2` (commits `3427804`…; build-verified, smoke-tested against the
live DB on a local port):

1. ✅ **Login in the POS**: `web/app/(auth)/login` (+ `/login/reset`, `/login/reset/confirm`,
   `/api/auth/reset`); proxy sends unauthenticated hits to local `/login`; `?redirect=`
   restricted to same-app paths. Business signup is admin-only (meeting D7) — the un-gated
   legacy `/api/auth/signup/wholesaler` route was REMOVED; customers self-serve on the login
   page's customer tab. Bonus: the whole marketing site (`/`, `/features`, `/sell`, `/about`,
   `/contact`, `/terms`) now renders locally too (content/components/images were already here).
2. ✅ **Super-admin console at `/admin`**: dashboard + entities/users/manufacturers/
   property-templates/releases/riders/units (ported from the auth app, suite modules dropped);
   `ROLE_HOME.SUPER_ADMIN → /admin`; licenses stay at the newer `/pos/licenses`;
   `/api/admin/stats` rewritten platform-wide + SUPER_ADMIN-gated. NOT yet re-verified: the
   license approval → terminal `.lic` flow end-to-end.
3. ✅ **Env sweep**: `web/.env.example` documents every var.
4. ✅ **Desktop-release continuity** (code/docs side): `infra/Caddyfile` snapshot now has the
   app.pelbu.com vhost routing `/api/desktop/*` + `/api/license/*` → :3100 and redirecting
   everything else to pos.pelbu.com; `desktop/electron/config.js` bakes
   `DEFAULT_CLOUD_URL=https://pos.pelbu.com` for FUTURE builds (≤v1.4.x rely on the vhost).

### Operator checklist to end the maintenance window (each step = Shawn's gate)

1. ✅ DONE 2026-08-22: live app rebuilt from this repo (`docker compose up -d --build pos`)
   — login/marketing/admin live on pos.pelbu.com, verified through Caddy.
2. ⏳ Shawn runs (sudo blocked for the agent): apply the updated app.pelbu.com vhost from
   `infra/Caddyfile` to `/etc/caddy/Caddyfile` + `systemctl reload caddy` — un-breaks
   installed terminals' update-check + license register (currently 502).
3. ✅ DONE 2026-08-22: GoTrue `SITE_URL=https://pos.pelbu.com`,
   `ADDITIONAL_REDIRECT_URLS=https://pos.pelbu.com,https://pos.pelbu.com/*`; auth container
   recreated healthy; login re-verified.
4. GitHub (whenever the repo is pushed): recreate release CI secrets `APP_URL` +
   `RELEASE_INGEST_TOKEN` on this repo before the first `desktop-vX.Y.Z` tag.

### Supabase stack re-home (Shawn's request 2026-08-22, in progress)

The live stack (project `pelbu-supabase`, all data in named Docker volumes) ran from the
monorepo's `infra/supabase`. Its config now lives at **`infra-supabase-live/`** (gitignored)
in this repo — same `name: pelbu-supabase`, GoTrue fix included. To complete the move, run
`docker compose up -d` from `infra-supabase-live/` (recreates containers onto the new config
paths; data volumes untouched; ~1 min blip). After that the monorepo folder is fully inert.
Old stopped containers (retired suite + 5-week-dead edgePOS-era stack) are queued for
`docker rm` — data volumes (`edgepos_*`) and manual DB dumps are retained.

### After that — Phases 3–5 per `docs/PLAN.md`

Slim droplet compose + **automated DB backups (none have ever existed — confirmed)** +
till-only feature flags + 10-shop seed; camera pad v0 (the client's real ask — see the brief);
box cleanup (suite already stopped). Also queued: e2e/tour update pass (specs target the
mid-July app), local-storage image driver for client droplets, `.lic` flow re-verification.

## Client context in one line

10 shops × Nu 500/month, hosting on a small droplet **in the client's own DigitalOcean account**,
undercutting YetiPOS — the till features already exist; the differentiator to build is the
camera-over-green-pad billing assistant (on-device, cashier confirms, top-3 tap fallback).
