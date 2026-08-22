# `public` schema — live shared identity + commerce (POS · marketplace)

Owned by **`apps/pos`** (pos.pelbu.com) and **`apps/auth`** (app.pelbu.com), on the single shared
self-hosted Supabase (`supabase.pelbu.com`). Ported here from the retiring **edgePOS** repo
(`web/supabase`) so the surviving repo carries the full schema.

**This schema is LIVE and holds real data.** Unlike `travel`/`hotel`, it is **never wiped**:
`db/reset.sh` refuses anything but `travel`/`hotel`, and you must never run a full `supabase db reset`.

## Lineage
`migrations/001_schema.sql` … `116_nqrc_merchant.sql` — the historical, **append-only** migration
lineage, applied directly via `psql` into the `supabase-db` container (the edgePOS convention).
`migrations/archive/` holds superseded pre-consolidation migrations, kept for history. `schema.sql`
is a small reference snapshot.

Includes: `entities`, `user_profiles`, `orders`/`order_items`, `carts`/`cart_items`, `products`/
`product_batches`, GST, `licenses`/`license_requests`, `terminal_tokens`, `riders`, khata,
`inventory_movements`, `audit_logs`, plus the `custom_access_token_hook` (copies role/entity_id/
sub_role/permissions into the JWT `app_metadata`) and the `auth_role()` / `auth_entity_id()` /
`auth_sub_role()` RLS helper functions the whole platform relies on.

## Changing the schema
Append a **new** numbered migration (`117_*.sql`, `118_*.sql`, …) and apply it via `psql`:
```bash
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < db/public/migrations/117_xxx.sql
```
Never edit an already-applied migration in place (the schema is live), and never drop the schema.

## REST exposure
`public` is exposed by default:
`PGRST_DB_SCHEMAS=public,storage,graphql_public,travel,hotel`.
