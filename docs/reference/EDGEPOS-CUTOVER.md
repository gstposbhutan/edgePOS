# edgePOS → PELBU monorepo — migration record & cutover

**Status: migrated & deployed (2026-07-13).** The standalone **edgePOS** app (`/home/ubuntu/edgePOS`)
has been ported into this monorepo and cut over live behind Caddy. edgePOS is now retired-in-place
(its container still runs on `:3000` purely as a rollback). Pending items → `MIGRATION-PENDING-TASKS.md`.

---

## 1. What moved where

| From (edgePOS) | To (this repo) | Served at |
|---|---|---|
| Marketing site + auth (login/signup/reset) + **super-admin console** + **terminal licensing** | **`apps/auth`** (`@pelbu/auth`, port **3007**) | **app.pelbu.com** |
| POS + consumer marketplace `/shop` + distributor/wholesaler/rider consoles + all other `api/*` (incl. **sync**) | **`apps/pos`** (`@pelbu/pos`, port **3100**) | **pos.pelbu.com** |
| `web/supabase/migrations` (public schema lineage) | **`db/public/`** (reference; live schema, never wiped) | — |
| Electron + PocketBase terminal (`/desktop`) | **`desktop/`** (top-level, standalone) | Windows build |
| `web/packages/sync-core` | **`packages/sync-core`** (`@nexus-bhutan/sync-core`, workspace pkg) | — |

**Split rule:** everything **except super-admin flows** went to `apps/pos`; super-admin + SSO +
marketing + terminal licensing went to `apps/auth`. Both are plain **JS/JSX** Next 16 apps.

## 2. How it's wired

- **SSO / auth cookie:** converged from edgePOS's `sb-edgepos-auth-token` to **`sb-pelbu-auth`** scoped to
  **`.pelbu.com`** (via `@pelbu/db`). One session is valid across every `*.pelbu.com` surface. Each app has
  its own `lib/supabase/server.js` (`getAuthContext`/`getRiderContext`/service client) on top of `@pelbu/db`.
- **Login is centralized** on `app.pelbu.com`. `apps/pos`'s `proxy.js` sends unauthenticated hits and
  `/login`,`/signup` to `app.pelbu.com/login?redirect=<public-url>` and role-routes authenticated users
  (SUPER_ADMIN → `app.pelbu.com/admin`; others to their in-app console). Redirect targets use
  `NEXT_PUBLIC_APP_URL` as the public origin (behind Caddy `request.url` is `localhost`).
- **Super-admin console** (`apps/auth/app/admin`): collapsible module sidebar (POS / Travel / Hotel);
  Travel/Hotel deep-link to their apps. SUPER_ADMIN-gated in `apps/auth/proxy.js`.
- **Terminal licensing = app.pelbu.com; sync = pos.pelbu.com.**
  - Terminal pre-license request → `app.pelbu.com/api/license/request` (desktop `DEFAULT_CLOUD_URL`).
  - Super-admin approves + issues the `.lic` at `app.pelbu.com/admin/licenses`.
  - The issued `.lic` bakes **`pos.pelbu.com/api/sync/ingest`** (issuer base = `NEXT_PUBLIC_POS_URL`).
  - Terminal sync (post-activation) → `pos.pelbu.com/api/sync/*`.
  - `lib/license` lives in **both** apps (auth issues; pos still does the owner register-key re-download at
    `/api/cash-registers/[id]/license`). `LICENSE_SIGNING_PRIVATE_KEY` is set in `apps/auth/.env`.
- **Shared DB:** one self-hosted Supabase, three schemas — `public` (owned by apps/pos + apps/auth),
  `travel` (apps/travel), `hotel` (apps/pms). No hard cross-schema FKs. `db/reset.sh` only ever drops
  `travel`/`hotel` — **`public` is live and never wiped**. See `db/README.md` + `db/public/README.md`.

## 3. Deployment (live on the box)

- **Caddy:** `app.pelbu.com → :3007`, `pos.pelbu.com → :3100` (backup: `/etc/caddy/Caddyfile.bak.pre-pos-cutover`).
  Old `edgepos-web` still runs on `:3000` as an instant rollback (flip the app.pelbu.com vhost back).
- **Run model:** bare `next start` under `nohup` (matches the box convention — `pms` runs bare on `:3006`).
  `apps/pos` builds `output: 'standalone'` for a slim Docker image if containerized later.
- **Runtime env is per-app `.env`** (NOT `.env.local`, which is gitignored/local-only). Real values sourced
  from `edgePOS/web/.env.docker`. Key settings:
  - both: `NEXT_PUBLIC_COOKIE_DOMAIN=.pelbu.com` (critical for SSO), Supabase URL/anon/service, SendGrid.
  - `apps/auth`: `NEXT_PUBLIC_APP_URL=https://app.pelbu.com`, `NEXT_PUBLIC_POS_URL=https://pos.pelbu.com`,
    `LICENSE_SIGNING_PRIVATE_KEY`.
  - `apps/pos`: `NEXT_PUBLIC_APP_URL=https://pos.pelbu.com`, `NEXT_PUBLIC_AUTH_URL=https://app.pelbu.com`,
    plus feature env (`ZAI_*`, `ZHIPU_*`, `GEMINI_API_KEY`, `AWS_REGION`/`S3_IMAGES_BUCKET`, `IMAGE_CDN_URL`,
    `WHATSAPP_GATEWAY_URL` + `NEXT_PUBLIC_WHATSAPP_GATEWAY_URL`, `VISION_AI_PROVIDER`, `RELEASE_INGEST_TOKEN`).
  - `desktop`: **no `.env` needed** — cloud URL is baked in `electron/config.js`; all other vars default.

## 4. Verified

`app.pelbu.com` = new auth app (`/login/reset` 200, `/admin` 307-gated, `/travel` + `/hotel` 200 with AI
imagery). `pos.pelbu.com` = new pos app (`/shop` 200, unauth `/pos` → app.pelbu.com login, `api/sync/bootstrap`
401, `api/pos` gated). Licensing: `app.pelbu.com/admin/licenses` gated, `/api/license/request` reachable.
All three apps `next build` green (auth 60 routes, pos 250).

## 5. Also added

Travel + Hotel **marketing pages** in `apps/auth` (`/travel`, `/hotel`) with 10 cogview AI images
(`apps/auth/scripts/gen-marketing-images.js`, `FORCE=1` to regenerate). Nav: Point of Sale · Travel · Hotel ·
Marketplace · Sell · About · Contact.

→ **Remaining work: `docs/pelbu/MIGRATION-PENDING-TASKS.md`.**
