# PELBU — security hardening backlog (DEFERRED)

Status: **RLS + grant hardening deferred by decision (2026-07-14)** — do it **last**, once the
schema has stopped moving (RLS is off in dev on purpose; enforcing it mid-flux slows development).
The safe, dev-neutral patches below were applied now; this doc records the audit so the eventual
RLS phase starts with a map.

## Applied 2026-07-14 (safe patches — no RLS, no dev impact)

- **HTTP security headers** on all app vhosts (Caddy `(sec)` snippet on app/pos/hotel/travel):
  `Strict-Transport-Security max-age=31536000; includeSubDomains`, `X-Content-Type-Options nosniff`,
  `X-Frame-Options SAMEORIGIN`, `Referrer-Policy strict-origin-when-cross-origin`; `Server` +
  `X-Powered-By` stripped. Verified live. (Caddyfile is `/etc/caddy/Caddyfile`, not in repo;
  pre-change backup `/etc/caddy/Caddyfile.bak.pre-sec-headers`.)
- **`SECURITY DEFINER` search_path** — all 13 owned definer functions in `public` are pinned
  (`pos, public`); none unpinned in hotel/travel/pos. (Done in migration 121.)
- **Verified clean:** `service_role` key is NOT under any `NEXT_PUBLIC_*` (only the anon key is,
  correctly); Supabase Studio is not publicly reachable (Caddy exposes only `/{auth,rest,storage,
  realtime,graphql}/v1/*` on supabase.pelbu.com; everything else 404).

## Current posture (audit 2026-07-14, post tenant/P4 migration)

RLS-enabled base tables per schema:

| schema | RLS on / total |
|---|---|
| `pos` | 11 / 55 |
| `hotel` | 0 / 16 |
| `travel` | 0 / 2 |
| `public` | 0 / 3 |

**50 tables are readable by `anon` with RLS off** — i.e. the public REST endpoint
(`supabase.pelbu.com/rest/v1/*` via Kong) + the public `anon` key returns all rows. Confirmed
reachable: `GET /rest/v1/orders` with the anon key + `Accept-Profile: pos` returns live orders
(order_no, grand_total). Same for `khata_accounts`, `user_profiles`, `shifts`, `entities`, etc.

**This is pre-existing edgePOS design, not introduced by the tenant/P4 migration.** The
pre-migration `pg_dump` contains 316 `... TO anon` grants including `GRANT ALL ON TABLE
public.{orders,khata_accounts,shifts,user_profiles} TO anon`. `SET SCHEMA` carried those grants to
`pos.*`; migration 121's `grant select … to anon` was redundant/narrower. So the migration did not
regress the posture — but the exposure is real and should be closed in this phase.

## Work items for the hardening phase (when scheduled)

1. **Close the `anon` read exposure.** Decide per table what unauthenticated callers legitimately
   need (public marketplace catalog only: `products`/`sellable_products`, `entities` shop info,
   `categories`, `units`, `entity_products`, `product_*`) and **revoke `anon` on everything else**
   (`orders`, `khata_*`, `shifts`, `cash_*`, `payment_attempts`, `refunds`, `user_profiles`,
   `consumer_accounts`, `face_profiles`, `audit_logs`, …). ⚠ Verify the marketplace/shop still
   browses — check whether the public shop handlers use the service client (safe to revoke) or the
   anon client (must keep catalog grants). BFF pattern suggests service-side, but confirm.
2. **Enable RLS** on the tables that must be per-tenant/per-user scoped, with policies keyed on the
   JWT (`auth_role()`/`auth_entity_id()`/`auth_module()` already read `app_metadata`). Start with
   `pos` commerce + `hotel`/`travel` tenant data.
3. **`SECURITY DEFINER` search_path** — migration 121 pinned `search_path = pos, public` on the 46
   `public` routines we own. Audit `hotel`/`travel`/`pos`-schema functions for the same (unpinned
   SECURITY DEFINER search_path is a privilege-escalation vector).
4. **anon-key surface** — the `anon` key is public (inlined in client bundles) and
   `supabase.pelbu.com/rest` is internet-facing; RLS is the real backstop, hence item 2.
5. **Bridge views** — `pos.entities`/`pos.user_profiles`/`pos.email_otps` are `security_invoker`
   (correct: base-table RLS/grants apply once enabled). No change needed beyond items 1–2.
6. **Function EXECUTE lockdown** — 11 `SECURITY DEFINER` functions are executable by `anon`/`public`;
   most are **trigger functions on live commerce** (`deduct_stock_on_confirm`, `reverse_khata_on_refund`,
   `restock_*`, `sync_batch_quantity`, `audit_order_item_discount`, `apply_synced_khata_txn`) plus a
   few possible RPCs (`next_pos_order_no`, `open_package`, `delete_face_profile`). Trigger functions
   don't need EXECUTE grants (triggers fire as owner regardless), so `revoke execute from anon, public`
   on them is safe — but it's grant surgery on live order/stock/khata paths, so bundle it with the RLS
   phase (verify each isn't a client RPC first; keep `authenticated`/`service_role` on the real RPCs).

## "Expose travel schema" (the other half of the original task) — DONE
`PGRST_DB_SCHEMAS` includes `travel`; the travel app serves live at `travel.pelbu.com`
(SilverPine storefront verified). No further work.
