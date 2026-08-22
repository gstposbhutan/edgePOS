# PELBU migration — pending tasks

Tracks what's left after the edgePOS → monorepo migration + cutover (see `EDGEPOS-CUTOVER.md`).
Last updated 2026-07-13.

## ✅ Done
- `apps/auth` (app.pelbu.com): marketing + SSO + super-admin console + **terminal licensing** + Travel/Hotel marketing pages.
- `apps/pos` (pos.pelbu.com): POS + marketplace + distributor/wholesaler/rider consoles + sync/desktop APIs; full feature env filled.
- `db/public/`: public-schema migration lineage preserved (live schema, never wiped).
- `desktop/`: terminal ported; `DEFAULT_CLOUD_URL` re-pointed to app.pelbu.com (licensing) with sync via the `.lic` → pos.pelbu.com.
- Caddy cutover live (app→:3007, pos→:3100); both apps built + running; SSO redirect chain verified.

## 🔜 Pending

### Desktop terminal
- [ ] **Rebuild + publish** the terminal so the new baked cloud URL takes effect: `cd desktop && npm install && npm run pb:fetch && npm run electron:build:win`. (No `.env` needed.)
- [ ] **Re-issue field terminals' `.lic`** from `app.pelbu.com/admin/licenses` — any terminal licensed before the cutover holds the old `app.pelbu.com` sync URL in its `.lic`; new issues bake `pos.pelbu.com`.
- [ ] (Optional/security) set `PB_ADMIN_PASS` / `SEED_USER_PASS` instead of the built-in defaults (`admin@pos.local` / `admin12345`) before packaging.

### SSO
- [ ] **Verify end-to-end with a real login** across subdomains (retailer → pos.pelbu.com/pos; super-admin → app.pelbu.com/admin; customer → pos.pelbu.com/shop).
- [ ] (Optional) **Retrofit `apps/travel` + `apps/pms`** to redirect their local `/login` → `app.pelbu.com/login` so the whole ecosystem shares SSO (recipe in `EDGEPOS-CUTOVER.md` §5, historical — now: set each proxy to redirect to `app.pelbu.com/login` and drop the local login page; they already use the `sb-pelbu-auth` cookie).

### Cleanup / retire edgePOS
- [ ] **Remove the dormant super-admin licensing copies from `apps/pos`** (`app/pos/licenses`, `app/api/license`, `app/api/admin/licenses`) — now hosted on auth. KEEP `apps/pos/lib/license` + `api/cash-registers/[id]/license` (owner register-key re-download) + `api/sync/*`.
- [ ] **Retire edgePOS**: once verified in prod, stop the `edgepos-web` container, remove its Caddy backup vhost, and delete `/home/ubuntu/edgePOS`. (`public` schema stays live on supabase.pelbu.com; `db/public/` carries the lineage.)

### Hardening / ops
- [ ] Move the two apps off bare `nohup next start` to **systemd/pm2 (or Docker)** for reboot-resilience.
- [ ] Confirm all prod secrets are set on the box's real `apps/*/.env` (they are gitignored; sourced from `edgePOS/web/.env.docker`).
- [ ] DB going forward: `public` is **append-only** — add `db/public/migrations/117_*.sql…` via `psql`; never edit applied migrations or drop the schema.

### Nice-to-have
- [ ] Add Travel/Hotel to the `apps/pos` `/shop` nav (currently only in the auth marketing nav).
- [ ] Update root `README.md` / `PELBU-TRAVEL-PLATFORM-PLAN.md` prose that still assumes edgePOS is a separate untouched app.
