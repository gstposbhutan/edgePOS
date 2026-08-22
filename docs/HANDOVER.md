# Handover — RanceLab parity on the desktop terminal

**Read this section first; it is the live work.** Written 2026-08-22 (second handover of the
day — the Phase 2 port section below is now history, kept for context). Branch `v2`, head
`5034363`, **pushed to `origin/v2`**, working tree clean.

## Why this work exists

The client's shops are trained on **RanceLab** ERP/POS. Our UI forced them to relearn, so
**adoption was zero** — this is the top product priority, ahead of the camera pad. The
requirement is `docs/keyboard-shortcuts.html` (wireframes WF-01…WF-10 + full key tables).

Two decisions from Shawn that shape everything:
- **The client uses the DESKTOP terminal, not the web till.** "web can remain the same".
- **The desktop must mimic RanceLab's UI**, not merely its keys.

⚠ The older `web/docs/features/*keyboard*` docs describe the OLD system and are **not** the
requirement — "the docs merely reflect the existing system". One wrong diagnosis was caused by
trusting them. Trust `docs/keyboard-shortcuts.html` and the code.

## What is done (all committed + pushed)

Desktop, in the order it was built: key map as a single source of truth → RanceLab ticket
columns → always-focused barcode row → rate editor + Enter cycle → till status bar →
keyboard-complete tender sheet → Office letter navigation → price list + reprint → split tender.

- `desktop/lib/pos-shortcuts.ts` — **the Counter key map, as data.** Drives the bindings, the
  two-page footer rail and the F1 sheet. Those three each kept their own copy before and had
  drifted apart; do not reintroduce a second list.
- `desktop/lib/office-menu.ts` + `components/office/` — the Office letter strip (WF-08/09).
- `desktop/components/pos/keyboard/` — barcode row, till bar, cart table, listing footer.
- Split tender: `orders.payments` holds the parts; `payment_method` stays the largest part
  because the cloud CHECKs that enum and reports group by it.

The **web** till was also remapped (`7716521`) and is verified but **never deployed** — so
production web is unchanged either way. If Shawn wants web left alone, revert that one commit;
the two web bug fixes in `b435161` are worth keeping regardless.

## Things that will bite you — read before releasing

1. **Migration 025 enables the PocketBase Batch API.** Checkout writes the order, stock,
   movements and khata in ONE batch. PocketBase ships with batch DISABLED and nothing turned it
   on, so on a default-settings terminal **every sale failed outright**. This was invisible
   until a test rang a real sale.
2. **Migration 026 repairs 14 fields that never existed.** Every migration from 007 on guarded
   with `try { getByName(x); exists = true } catch {}`, assuming a missing field *throws*. It
   returns `undefined` — so the guard always said "already present", nothing was added, and
   PocketBase recorded the migration as applied. PocketBase then silently drops unknown fields
   on write. Missing: bill discount, salesperson, invoice date, quotation flag, delivery
   address, complimentary reason, GST-exempt (products + cart lines), distributor price, and
   the printer + NQRC payment-QR settings. **Those values had been going nowhere on every
   terminal.** Guards corrected for fresh installs; 026 repairs existing ones.
   → **Both migrations change installed terminals. A PB config change bricked v1.0.2 boot
   before (see the notes on partial-index parens). Exercise them on a real Windows terminal
   before tagging a release — xvfb here is not enough.**
3. **Electron fullscreen moved F11 → Alt+Enter**, because the RanceLab map gives F11 to Day.
   Terminals in the field will notice; tell the shopkeepers before the release goes out.
4. **`window.prompt` is not implemented in Electron — it throws.** Never use it. Use
   `components/pos/amount-prompt-modal.tsx`.
5. **The shared `Input` component does not forward `id`** (base-ui primitive underneath), which
   breaks label association and lookups. Use a plain `<input>` when you need an id.

## What is left

- **Five reserved keys**, deliberately not faked — they report "not built yet" rather than
  doing nothing: unit sheet (Alt+U), item remark (Ctrl+T), GST-included toggle (Alt+T),
  F2 date, barcode print. Alt+U additionally needs **pack/case factors**, which the terminal's
  catalog does not carry — a Pcs/Pack/Case sheet without them would invent quantities.
- **Release**: desktop ships via a `desktop-vX.Y.Z` tag; CI secrets `APP_URL` and
  `RELEASE_INGEST_TOKEN` still need recreating on this repo (they only existed on the
  monorepo's GitHub).
- The web till's remap is undeployed (see above), and `pelbu-customer-pricelist.spec.js` tests
  an F7 price-list feature that **does not exist in web/** — stale, failing before this work.

## Running the tests (this is the trustworthy signal)

    cd desktop
    node scripts/fetch-pocketbase.mjs --force     # arm64 box: tracked pb/pocketbase is x86-64
    xvfb-run -a npx playwright test --config playwright.electron.config.ts
    # fullscreen spec needs a WM:
    xvfb-run -a sh -c 'openbox & sleep 2; npx playwright test --config playwright.electron.config.ts e2e/electron/fullscreen.spec.ts'

**Do NOT commit the swapped arm64 binary** — `git checkout -- desktop/pb/pocketbase` before
committing. 22 specs, 22/22 across three consecutive runs at handover.

The harness was ~50% flaky and was fixed: the window is worker-scoped but `appPage` is now
test-scoped and resets both the screen and the ticket before every test. `zz-split-tender` is
named to sort last because it is the only spec that rings a real sale.

## How to work on this without wasting a day

Every bug in this stretch was invisible to typecheck and build, and only surfaced by driving the
real app: the rate editor was unusable (the barcode row stole focus back the instant it opened),
every Ctrl/Alt shortcut was dead on the counter (the row holds the caret, and the registry only
exempted F-keys), `Ctrl+Shift+B` never matched its binding (Shift makes `event.key` uppercase),
and the two above. **Verify against real bindings and a running app before claiming behaviour.**
When something fails, print the app's actual state — toasts, `document.activeElement`, the
dialog's innerHTML — rather than reasoning about what should happen; that resolved every one of
these faster than inspection did. Also strip ANSI before grepping Playwright output, or you will
read a failing run as clean.

---

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

**MAINTENANCE WINDOW CLOSED 2026-08-22 — the platform is fully live again.**

1. ✅ Live app rebuilt from this repo (`docker compose up -d --build pos`) — login/marketing/
   admin serving on pos.pelbu.com, verified through Caddy.
2. ✅ app.pelbu.com vhost applied to `/etc/caddy/Caddyfile` (backup:
   `Caddyfile.bak-2026-08-22`), `caddy validate` clean, reloaded. `/api/desktop/*` +
   `/api/license/*` → :3100 (releases endpoint 200, was 502); everything else 301s to
   pos.pelbu.com. Installed terminals can auto-update + register licenses again.
3. ✅ GoTrue `SITE_URL=https://pos.pelbu.com`,
   `ADDITIONAL_REDIRECT_URLS=https://pos.pelbu.com,https://pos.pelbu.com/*`; auth recreated
   healthy; login + `POST /api/auth/reset` re-verified 200.
4. GitHub (whenever the repo is pushed): recreate release CI secrets `APP_URL` +
   `RELEASE_INGEST_TOKEN` on this repo before the first `desktop-vX.Y.Z` tag. ← only item left.

### Supabase stack re-home — DONE 2026-08-22

The live stack (project `pelbu-supabase`) now runs from **`infra-supabase-live/`** in this
repo (gitignored; same project name so the named data volumes re-attached untouched). All 10
containers force-recreated onto the new config path and healthy; **nothing on the box
bind-mounts `~/bhutan-tour-operator` any more** — that folder is inert, do not operate from
it. Data verified intact after the move: 32 entities, 1,246 products, 122 orders, 53 users.

Retired containers removed the same day (`docker rm`, no `-v`): the suite (`pelbu-pos-1`,
`pelbu-auth-1`, `pelbu-travel-1`, `pelbu-pms-1`), the `sync-worker` zombie,
`whatsapp-gateway`, and the 5-week-dead edgePOS-era stack. **Old data volumes retained**:
`edgepos_db-data`, `edgepos_db-config`, `edgepos_storage-data` (plus the manual dumps in
`backups/` and `/home/ubuntu/pelbu-backups/`). 18 containers remain, all running.

Still running, undecided: `logistics-bridge` (edgePOS-era delivery webhooks, source only in
`legacy/*` tags) and the monitoring stack. ~42 GB reclaimable in old images + build cache
(`docker image prune -a`, `docker builder prune`) once you're happy nothing needs a rollback.

### After that — Phases 3–5 per `docs/PLAN.md`

Slim droplet compose + **automated DB backups (none have ever existed — confirmed)** +
till-only feature flags + 10-shop seed; camera pad v0 (the client's real ask — see the brief);
box cleanup (suite already stopped). Also queued: e2e/tour update pass (specs target the
mid-July app), local-storage image driver for client droplets, `.lic` flow re-verification.

## Client context in one line

10 shops × Nu 500/month, hosting on a small droplet **in the client's own DigitalOcean account**,
undercutting YetiPOS — the till features already exist; the differentiator to build is the
camera-over-green-pad billing assistant (on-device, cashier confirms, top-3 tap fallback).
