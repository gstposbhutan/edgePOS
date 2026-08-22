# Feature: Distributor / Wholesaler Console — Access & Isolation Model

**Feature ID**: F-CONSOLE-SEC-001
**Phase**: 6 (Scoped RLS hardening + audit)
**Status**: Shipped
**Last Updated**: 2026-06-30

---

## Overview

The DISTRIBUTOR (`/distributor`) and WHOLESALER (`/wholesaler`) consoles let a B2B vendor manage
their own catalog, team, settings, warehouses, network favourites, and orders. Because every
console screen surfaces business-private data (a vendor's products, prices, links, orders), the
question this document answers is: **what stops one vendor from reading or writing another vendor's
data?**

The short answer: **explicit application-layer entity-scoping inside the `/api/console/*` routes**,
not row-level security. RLS on the platform is currently disabled (see *RLS posture* below), so the
isolation that is actually live is the per-route scoping audited here. The new `083_console_rls.sql`
policies are defense-in-depth for if/when platform RLS is re-enabled.

---

## Three layers of enforcement

| Layer | Where | What it does | Live today? |
|-------|-------|--------------|-------------|
| 1. Route gate (proxy) | `web/proxy.js` | Redirects unauthenticated users to `/login`; routes each role to its console; **blocks DISTRIBUTOR/WHOLESALER from `/pos`** and non-`SUPER_ADMIN` from `/admin`. | Yes |
| 2. Client-side role guard | each `app/{distributor,wholesaler}/**/page.jsx` | On mount, reads `getRoleClaims(user)`; if the role doesn't match the console, pushes to `/`. Cosmetic only — a user can't usefully bypass it because the API enforces independently. | Yes |
| 3. **API entity-scoping** | `app/api/console/*` | The real isolation. Every route resolves the caller via `getAuthContext()`, gates `sub_role` where it mutates, and filters every query by the caller's entity (`created_by` / `entity_id` / `actor_entity_id` / `seller_id`) or verifies a link row before any cross-entity read. | **Yes — primary** |

> Note: `web/proxy.js` deliberately **passes `/api/*` through** without a role check (it only guards
> page routes). API authentication and authorization therefore live entirely inside each route via
> `getAuthContext()`. There is no implicit gate in front of the console APIs.

---

## Why the service-role client, and what that means

`getAuthContext()` (in `web/lib/supabase/server.ts`) does two things:

1. **Authenticates** the request using the anon SSR client (`supabase.auth.getUser()` against the
   session cookie). No valid session → it returns `null` → the route returns **401**.
2. Returns the caller's `{ entityId, role, subRole, userId }` plus `supabase` = the **service-role
   client**.

The service-role client **bypasses RLS**. That is intentional: it means the console routes are the
trusted boundary, and isolation is enforced *in the query* (`.eq('created_by', entityId)` etc.),
never delegated to the database. The consequence: enabling RLS (layer below) does **not** change
console behaviour, because the service role ignores it — the console keeps working exactly as before.

A client/anon (`userClient`) handle is also returned by `getAuthContext()`, but **none of the
console routes use it for data access** — every `.from(...)` on a console table goes through the
service client.

---

## Per-route scoping summary (Phase 6 audit)

Every route below: calls `getAuthContext()` (→ 401 if absent), gates `sub_role ∈ {OWNER, MANAGER}`
where it mutates, and scopes every query to the caller's entity. Audit result for all: **PASS**.

| Route | Method(s) | Scoping / gating |
|-------|-----------|------------------|
| `console/catalog` | GET, POST | `products WHERE created_by = entityId`; OWNER/MANAGER. Insert forces `created_by = entityId`. |
| `console/catalog/[id]` | PATCH | Update scoped `.eq('id').eq('created_by', entityId)` → another vendor's row matches nothing (404). |
| `console/catalog/[id]/toggle` | POST | Same `created_by = entityId` scope on the `is_active` flip. |
| `console/browse` | GET | Read-only network directory. Target role restricted by `ALLOWED_TARGETS[ctx.role]` (DISTRIBUTOR→WHOLESALER/RETAILER, WHOLESALER→RETAILER; else 403). Excludes the caller (`neq id`) and SUPER_ADMIN. Favourite flags read scoped to `actor_entity_id = entityId`. Returns only public directory fields (name, address, whatsapp, tpn). |
| `console/favourites` | GET, POST, DELETE | All scoped `actor_entity_id = entityId`; vendor-role gated. POST rejects favouriting your own entity. |
| `console/warehouses` | GET, POST | `entity_id = entityId`; OWNER/MANAGER. Insert forces `entity_id = entityId`; single-primary maintained per entity. |
| `console/warehouses/[id]` | PATCH, DELETE | Scoped `.eq('id').eq('entity_id', entityId)` → cross-entity row matches nothing (404). |
| `console/orders` | GET | Incoming orders scoped `seller_id = entityId`; OWNER/MANAGER. Buyer-name enrichment is public directory data only. |
| `console/orders` | POST | WHOLESALER-only. **Verifies the `distributor_wholesalers` link** (`wholesaler_id = entityId`, active) before creating; line items constrained to `products WHERE created_by = supplier_id`; order written with `seller_id = supplier_id, buyer_id = entityId, created_by = userId` (no client-supplied entity id is trusted). |
| `console/suppliers` | GET | WHOLESALER-only; lists `distributor_wholesalers WHERE wholesaler_id = entityId` (active). |
| `console/suppliers/[id]/catalog` | GET | WHOLESALER-only; **link-checked first** (`distributor_id = [id]`, `wholesaler_id = entityId`, active) → 403 if not linked, then returns that distributor's active priced products. |

Client-supplied identifiers (`supplier_id`, `target_entity_id`, `role`, `[id]`) are never trusted
directly: each is either validated against an allow-list, checked against a link row, or used only
inside an entity-scoped `WHERE`, so an unrelated id resolves to "not found / forbidden" rather than
leaking another entity's data. **No cross-entity leaks were found in the audit; no route fixes were
required.**

---

## RLS posture (the 083 defense-in-depth layer)

**Platform RLS is disabled.** The `001_schema.sql` baseline *defines* RLS policies for the core
tables but only `ENABLE`s RLS on a handful of infrastructure tables; `archive/071_disable_rls.sql`
disabled RLS across the rest during development. Live state confirms `entities`, `products`,
`orders`, `user_profiles`, `retailer_wholesalers` all have `relrowsecurity = false`. So the policies
that exist on those tables are dormant.

The three console tables — `favourites`, `warehouses`, `distributor_wholesalers` (migrations
080–082) — were created after 071 and were never enabled either.

**Migration `083_console_rls.sql`** enables RLS on those three tables and adds scoped policies, as
defense-in-depth:

| Table | Policy | Scope (besides `is_super_admin()`) |
|-------|--------|------------------------------------|
| `favourites` | `favourites_own_actor` | `actor_entity_id = auth_entity_id()` |
| `warehouses` | `warehouses_own_entity` | `entity_id = auth_entity_id()` |
| `distributor_wholesalers` | `dw_own_either_side` | `wholesaler_id = auth_entity_id() OR distributor_id = auth_entity_id()` |

These reuse the baseline helpers `auth_entity_id()` (reads `entity_id` from the JWT `app_metadata`)
and `is_super_admin()` (`auth_role() = 'SUPER_ADMIN'`), and follow the baseline's
`is_super_admin() OR <scope>` shape.

**Why this is safe to enable now:** an audit confirmed every read/write of these three tables happens
through the `/api/console/*` routes using the service-role client. The service role bypasses RLS, so
the console is unaffected. The policies only ever bite a non-service (anon/user-JWT) path — of which
there are none today — so they are a safety net for eventual platform-wide RLS re-enablement, not an
active gate.

> If a future change adds an anon/user-client reader of any of these tables, that path will now be
> correctly scoped by the 083 policies once platform RLS is on. Until then, keep enforcing isolation
> in the route layer — do not rely on RLS for the console while it runs on the service role.

---

## Role → console routing

`web/proxy.js` `ROLE_HOME`:

```
SUPER_ADMIN → /admin      DISTRIBUTOR → /distributor   WHOLESALER → /wholesaler
RETAILER    → /pos        RIDER       → /rider          CUSTOMER   → /shop
```

DISTRIBUTOR and WHOLESALER are blocked from `/pos` (they can't use the retailer terminal); only
SUPER_ADMIN may reach `/admin`. Each console page additionally self-checks the role on mount and
bounces a mismatch to `/`.

---

## Maintenance rule for new console routes

When adding a `/api/console/*` route:

1. Resolve the caller with `getAuthContext()`; return **401** if it's `null`.
2. Gate `sub_role` (`OWNER`/`MANAGER`) on any mutation; gate `role` where the route is role-specific
   (e.g. WHOLESALER-only ordering).
3. Scope **every** query by the caller's entity, or verify a link row before any cross-entity read —
   never trust a client-supplied entity/owner id.
4. Use `ctx.supabase` (service client) for data; do not reach for the anon `userClient`.
5. If the route touches a new table, add a matching scoped RLS policy in a follow-up migration for
   defense-in-depth (mirror 083).
