# edgePOS — Pelbu POS

Point-of-sale platform for Bhutanese retail: web till + back office, offline-capable
desktop terminal, and the `pos`-schema Postgres lineage. **v2** is the POS's return to this
repo as a standalone product, transplanted from the `bhutan-tour-operator` monorepo
(`apps/pos` @ 2026-08-22) with all work since the July cutover: `pos` schema (121),
product-register overhaul (129), FEFO/FIFO batch rotation (129–131), category
consolidation onto HSN (132–133), security patches.

## Layout

| Path | What |
|---|---|
| `web/` | The Next.js POS — till (`/pos`, `/pos/touch`), B2B consoles, shop, riders, BFF API. Port 3100. |
| `desktop/` | Electron + PocketBase offline terminal (from the monorepo `desktop` branch, v1.4.1-beta.1). Own toolchain, not an npm workspace. |
| `packages/sync-core/` | Terminal↔cloud reconciliation engine (shared by `web` and `desktop`). |
| `db/` | The `pos` + shared-`public` migration lineage (001–133 + archive). Append-only; apply via `psql`. |
| `Dockerfile` / `docker-compose.yml` | Thin runtime over the host-built standalone output; serves on 127.0.0.1:3100 behind Caddy. |

## Run

```sh
npm install
# put Supabase URL/keys etc. in web/.env (ask the owner)
npm run dev                    # http://localhost:3100
# deploy: npm run build && docker compose up -d --build pos
```

The database is a self-hosted Supabase stack (separate compose); POS tables live in the
**`pos` schema** — raw SQL must target `pos.*`, the app's PostgREST client defaults there.

## History

Pre-v2 code (the original standalone app, its e2e/tour suites, monitoring configs, docs)
is preserved at the `legacy/*` tags and in the full-history bundle kept by the owner.
The old `main` is superseded by `v2`.
