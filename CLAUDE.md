# edgePOS (Pelbu POS) — working notes

Standalone POS product repo. Transplanted 2026-08-22 from the monorepo's `apps/pos` on a `v2`
branch, which **became `main` at the cutover on 2026-08-26** — `main` is the product now, and
`v2` is kept only as that branch's name in history. The pre-homecoming tree is tagged
`legacy/main`.
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
  an applied migration. Lineage is at 139.
- **`desktop/`** is the Electron + PocketBase offline terminal — own toolchain and
  lockfile, NOT part of the npm workspaces. Release CI: tag `desktop-vX.Y.Z`.
- **Secrets** live in `web/.env` (gitignored). Never commit env files or keys.
- Two unrelated carts share the name `useCart`: `web/hooks/use-cart.js` (POS terminal)
  vs `web/lib/cart-context.js` (consumer shop). Check which one you're importing.
- **The back office already has a frame — extend it, do not rebuild it.** The till and the
  back office both wear the counter's clothes: a band naming the screen, a dense register,
  and a rail printing every key the screen answers.
  Web: `web/components/pos/office/` + `web/lib/pos/office-keys.js`.
  Desktop: `desktop/components/office/` + `desktop/lib/office-keys.ts`.
  Key matching is ALREADY solved in `web/lib/pos/shortcuts.js` (`matches()`) and
  `desktop/hooks/use-keyboard-registry.ts` — both handle the macOS Option-glyph problem, which
  a hand-rolled comparison gets wrong. Route through them.
- **Never name the incumbent ERP** in code, UI, docs or commit messages — say "the incumbent"
  or "the convention". Ours are "the counter" (till) and "the office" (back office). The one
  place its name legitimately appears is `web/lib/marketing/content.js`, stating Innovates'
  real credential as an implementation partner.
