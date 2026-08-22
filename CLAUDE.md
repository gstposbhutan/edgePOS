# edgePOS (Pelbu POS) — working notes

Standalone POS product repo (v2, transplanted 2026-08-22 from the monorepo's `apps/pos`).
See README.md for layout. The old root CLAUDE.md described an aspirational architecture
(YOLO26, Hono/Bun, PouchDB) that never shipped — ignore anything from it.

## Ground rules

- **`web/` is the app** (Next.js 16, plain JS, port 3100). BFF pattern: the browser never
  talks to Supabase directly — client components fetch `/api/*`; server code uses
  `web/lib/supabase/server.js` (`getAuthContext()` returns the **service-role** client, so
  every query must scope by `entityId` — RLS is largely off).
- **POS tables live in the Postgres `pos` schema** (shared identity tables stay in
  `public` behind `pos.*` bridge views). Raw SQL must target `pos.*`. The PostgREST
  client defaults to the `pos` schema.
- **`db/` is append-only**: new migrations as `NNN_*.sql`, applied via `psql`; never edit
  an applied migration. Lineage is at 133.
- **`desktop/`** is the Electron + PocketBase offline terminal — own toolchain and
  lockfile, NOT part of the npm workspaces. Release CI: tag `desktop-vX.Y.Z`.
- **Secrets** live in `web/.env` (gitignored). Never commit env files or keys.
- Two unrelated carts share the name `useCart`: `web/hooks/use-cart.js` (POS terminal)
  vs `web/lib/cart-context.js` (consumer shop). Check which one you're importing.
