# Handover — continuing the POS port in this repo

**Read this first.** Written 2026-08-22, the day the POS was transplanted back into this repo.
This doc is self-contained: the session that continues here has no access to the monorepo
terminal's context or memory. Companions: `docs/PLAN.md` (the full phase plan — Phases 0–1 are
DONE, you are picking up at **Phase 2**), `docs/pos-brief.html` (the client's requirements),
`docs/pos-brief-response.html` (our reply to them), root `README.md` + `CLAUDE.md` (layout +
ground rules).

## Where things stand

- **Branch `v2`, commit `90db965`** — the pre-cutover tree was replaced with the live codebase
  from the `bhutan-tour-operator` monorepo (`apps/pos` @ 2026-08-22, includes everything through
  migration 133). `next build` verified clean. **Not pushed to origin yet** (gstposbhutan/edgePOS)
  — Shawn's call on when.
- **The box still runs the OLD build**: container `pelbu-pos-1` (port 3100) is built from the
  monorepo, not from here. Nothing here is deployed yet; cutover is Phase 5 of the plan.
  Also running: `pelbu-auth-1` (:3007), `pelbu-travel-1` (:3005), `pelbu-pms-1` (:3006) — all to
  be retired (the suite is being wound down; POS is the only product going forward) — plus the
  `pelbu-supabase-*` stack (Kong on 127.0.0.1:8000, db 5432) and edgePOS-era monitoring
  containers. `sync-worker` is a **zombie** (source deliberately deleted 2026-07-06; it only logs
  a heartbeat) — kill it at Phase 5. Caddy config: `/etc/caddy/Caddyfile` (not in any repo;
  worth committing here at Phase 5).
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

## What's next — Phase 2: make the app standalone (cut the `apps/auth` dependency)

The POS still redirects login to the auth app (`AUTH_URL` → app.pelbu.com) and lacks the
super-admin surface. To do, in order:

1. **Login pages in the POS**: `/login` (+ signup entry, password reset) rendered locally;
   the BFF API routes already exist (`web/app/api/auth/*` — login/logout/session/switch/OTP/
   OAuth proxies). Remove the redirect in `web/proxy.js` (see `AUTH_URL` / the `/login` +
   `/signup` handling) and the `ROLE_HOME` SUPER_ADMIN bounce in `web/lib/hosts.js`.
2. **Reactivate the dormant super-admin surface** (deliberately NOT deleted): `web/app/pos/
   licenses/` page + `web/app/api/admin/{licenses,entities,users,riders,units,desktop-releases,
   property-templates,category-properties,stats}` — gate on SUPER_ADMIN (JWT claim; see
   `getAuthContext()` in `web/lib/supabase/server.js`), add a nav entry, verify the license
   approval → terminal `.lic` flow end-to-end (`web/lib/license/`).
3. **Env sweep**: `.env.example` for `web/` documenting every var (Supabase URLs/keys, SendGrid,
   S3/img.pelbu.com, `NEXT_PUBLIC_COOKIE_DOMAIN`, AI keys — the client deploy runs with AI off).
4. Then Phases 3–5 per `docs/PLAN.md`: slim droplet compose + **automated DB backups (none have
   ever existed — confirmed)** + till-only feature flags + 10-shop seed; camera pad v0 (the
   client's real ask — see the brief); box cutover + suite retirement.

## Client context in one line

10 shops × Nu 500/month, hosting on a small droplet **in the client's own DigitalOcean account**,
undercutting YetiPOS — the till features already exist; the differentiator to build is the
camera-over-green-pad billing assistant (on-device, cashier confirms, top-3 tap fallback).
