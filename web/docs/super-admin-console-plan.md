# Plan — SUPER_ADMIN platform console (manage the whole ecosystem)

**Requirement:** the SUPER_ADMIN role manages **distributors, wholesalers, retailers (vendors), customers, riders** on the platform — including **access control, authentication, and licensing**. This is the platform-operator console that sits above the supply-chain governance defined in `distributor-role.md`.

---

## 1. The role hierarchy (live schema; supersedes `distributor-role.md`)

> **Model correction (2026-06-08):** "DISTRIBUTOR-as-platform-operator/governor" (the old `distributor-role.md` definition) is **renamed/folded into `SUPER_ADMIN`** — there is ONE central platform governor, no per-category distributor-governance tier. **`DISTRIBUTOR` is retained as a plain commercial supply-chain entity** (a goods business, peer to `WHOLESALER` and `RETAILER`/"vendor"). `entities.role` values are unchanged; only `DISTRIBUTOR`'s meaning changes (commercial, not governance). `distributor-role.md` is superseded by this doc.

```
SUPER_ADMIN  (NEXUS — sole platform operator/governor; manages every entity, auth,
              access control, licensing; can impersonate)
  └── commercial supply-chain entities (all "vendors" in the commercial sense):
        DISTRIBUTOR  →  WHOLESALER  →  RETAILER ("vendor", runs the desktop POS + .lic)
        CUSTOMER  (marketplace consumer / khata debtor)
        RIDER     (last-mile delivery)
```
Governance/management/licensing is **centralized in SUPER_ADMIN**. (Commercial relationships — distributor↔category via `categories.distributor_id`, retailer↔wholesaler via `retailer_wholesalers` — remain as *business* links, not governance scopes.)

> **Existing admin surface (survey 2026-06-08):** an `/admin` console already exists — pages `app/admin/{stores,team,riders,settings,units,categories}/page.jsx` + routes `api/admin/{stores,team,team/[id],riders,riders/[id],settings,stats,units,category-properties}`. `api/auth/signup/{vendor,wholesaler}` create an entity + OWNER user + session. `api/admin/team` is **entity-scoped** (an OWNER manages their own staff). So the foundation is partly built — **extend/super-admin-scope the existing console, don't build a parallel one.** Gap analysis pending: which of these are SUPER_ADMIN-global vs entity-scoped, and what's missing (global entity CRUD across all types, global user management, role/sub_role/permission assignment, suspend/impersonate).
Scoping primitives already in the schema: `entities.role` (SUPER_ADMIN/DISTRIBUTOR/WHOLESALER/RETAILER/CUSTOMER), `categories.distributor_id`, `entity_categories`, `product_categories`, `retailer_wholesalers`, `riders`, `user_profiles(entity_id, role, sub_role, permissions)`. RLS helpers `is_super_admin()` / `auth_role()` / `auth_entity_id()` and the `custom_access_token_hook` (JWT claims) exist.

---

## 1b. Access-control matrix (locked 2026-06-08 — supersedes the earlier "scoped delegation")

Each commercial tier manages **its own associated entities + own resources**; governance is **central to SUPER_ADMIN**.

| Role | Scope | Can manage | Restricted from |
|---|---|---|---|
| **SUPER_ADMIN** | Global | All entities (CRUD/suspend: distributors, wholesalers, retailers, customers, riders), all users + auth + role/sub_role/permissions, licensing, units/categories/governance, impersonate | — |
| **DISTRIBUTOR** | Own network | Its **own associated entities** (the wholesalers/retailers in its commercial network) + own products/specs + own team | Global/category **governance** (→ moved to SUPER_ADMIN): platform-wide category-properties, cross-network entity admin |
| **WHOLESALER** | Own network | Its associated retailers (`retailer_wholesalers`) + own products/specs + own team | Governance; other networks |
| **RETAILER** ("vendor") | Own store | Its store(s) + staff (`team`) + consumes its terminal `.lic` | Anything beyond its store |
| **CUSTOMER** | Self | marketplace / khata | — |
| **RIDER** | Self | deliveries | — |

**Two transition tasks from the re-term:**
- **Restrict DISTRIBUTOR governance** — the elevated grants DISTRIBUTOR holds today (`api/admin/category-properties` global mgmt, and the governance flavor of `entity-products/specifications`) move to SUPER_ADMIN; DISTRIBUTOR keeps only its own-network/own-resource scope.
- **Give DISTRIBUTOR its own associated-entity management.** **Resolved (2026-06-08):** broad visibility + a **favourites/saved overlay** — DISTRIBUTORs can view ALL wholesalers + retailers; WHOLESALERs can view ALL retailers; each can mark targets as **favourite/saved**. So "associated entities" = a saved/favourites list (a junction e.g. `entity_favourites(owner_entity_id, target_entity_id, saved_at)`), **not** an exclusive network. **Deferred** to a follow-on — the SUPER_ADMIN global layer + the DISTRIBUTOR restriction build first.

## Console namespaces (per-role separation, 2026-06-08)
The re-term splits the shared `/admin` into role-specific consoles:
- **`/admin`** → SUPER_ADMIN only — **enforced (2026-06-08)**: `proxy.js` + `useAdminAuth` redirect every non-super-admin role to its own console (no shared routes). Retailer store/team management **relocated** to `/pos/stores` + `/pos/team` (entity-scoped APIs unchanged). Admin nav dropped Stores/Team (super-admin uses Entities + Users).
- **`/distributor`** → DISTRIBUTOR commercial console: browse **all** wholesalers + retailers with a favourites/saved overlay, own catalog/products, own team, dashboard. *(= the deferred distributor-scope work.)*
- **`/wholesaler`** → WHOLESALER console: browse **all** retailers + favourites, own catalog/team. *(May share a `/vendor` pattern with distributor — sub-decision.)*
- **`/pos`** → RETAILER terminal + owner store/staff management.
- **`/rider`** → RIDER app: assigned deliveries, status updates.
- **`/customer`** (or `/marketplace`) → CUSTOMER portal: browse/order, khata balance.

**Principle:** every role has its own namespace/console; **SUPER_ADMIN at `/admin` governs across all of them** (and can still manage riders/customers centrally). Each non-super-admin console is gated to its role and scoped to that entity's own data (+ the broad-visibility/favourites overlay for distributor/wholesaler).

**Platform split (2026-06-08):** only **RETAILER** has the offline **desktop** app (PocketBase + `.lic` + sync/bootstrap). **All other roles — super-admin, distributor, wholesaler, customer, rider — are web-only.** So `/admin`, `/distributor`, `/wholesaler`, etc. are web consoles; the `.lic`/bootstrap/terminal-push work pertains to retailer terminals only.

## Terminology — "stores" vs "warehouses" (2026-06-08)
A location's label depends on the entity's role: **RETAILER** locations are **stores** (retail shops, with POS terminals); **WHOLESALER / DISTRIBUTOR** locations are **warehouses** (depots / buildings — no POS). So the `/wholesaler` + `/distributor` consoles (and any super-admin location view for them) should say "Warehouses", and the location/`owner_stores`-style model for these roles is warehouse-oriented (no POS terminal/`.lic`), unlike retailer stores. *(Affects the deferred per-role consoles + the location data model; current entity/user management is unaffected.)*

## Build order (confirmed 2026-06-08)
1. **SUPER_ADMIN global layer (now):** global entity CRUD across all types + global user/role management + wire Licenses into the admin nav.
2. **Restrict DISTRIBUTOR governance (now):** `category-properties` (+ the governance flavor of `entity-products/specifications`) → SUPER_ADMIN only.
3. **Deferred:** distributor/wholesaler favourites-overlay (broad visibility + saved list).

## 2. SUPER_ADMIN console — capabilities (what this requirement asks for)

| Area | Capability | Backed by |
|---|---|---|
| **Distributors** | CRUD + suspend/activate; assign product **categories** (`categories.distributor_id`) | entities, categories |
| **Wholesalers** | CRUD + suspend; link to categories (`entity_categories`) | entities, entity_categories |
| **Retailers (vendors)** | CRUD + suspend; wire supplier links (`retailer_wholesalers`); set default credit limit | entities, retailer_wholesalers |
| **Customers** | view/CRUD; khata/credit oversight | entities (CUSTOMER), khata_accounts |
| **Riders** | CRUD + assign/suspend | riders |
| **Authentication** | create/suspend/reset **Supabase auth users**; the onboard flow (entity → auth user → user_profile → WhatsApp credential delivery) | auth.users, user_profiles |
| **Access control** | assign role / sub_role / `permissions`; the JWT claim hook; **impersonate** (super-admin only, per the doc) | user_profiles, custom_access_token_hook |
| **Licensing** | global issue/revoke `.lic` (BUILT) + oversight of vendor-issued licenses | licenses, terminal_tokens |

---

## 3. Scoped delegation (the "multiple vendors" decision — supply-chain model)
The **same** management actions are delegated **downward, scoped**:
- **DISTRIBUTOR** (category-scoped): manage the Wholesalers + Retailers in *its* categories; issue/revoke `.lic` for *its* Retailers. Cannot see another distributor's category. (RLS: `categories.distributor_id = auth_entity_id()`.)
- **WHOLESALER**: manage/see the Retailers it's linked to via `retailer_wholesalers`.
- License issuance scope = the caller's downstream Retailers (SUPER_ADMIN = all). `licenses.vendor_id` (issuer entity) added for scoping + audit.

So "handle multiple vendors" = the console actions gate on **(SUPER_ADMIN → global) OR (DISTRIBUTOR/WHOLESALER admin → their downstream set)**.

---

## 4. What exists vs. net-new

**Built / present**
- Schema: entities + roles, categories (+ distributor_id), entity_categories, product_categories, retailer_wholesalers, riders, user_profiles (+ permissions).
- Auth + RLS: Supabase auth, `is_super_admin()`/`auth_role()`/`auth_entity_id()`, `custom_access_token_hook` (JWT role/entity claims).
- Licensing: global super-admin `.lic` issuer + revoke (this session).

**Spec'd, NOT built** (`distributor-role.md` checklist is entirely unchecked)
- Admin Hub: distributor/wholesaler dashboards, scoped Wholesaler/Retailer management, onboarding flow, category reports. The **RLS policies** for distributor/wholesaler scoping are written in the doc but not applied.

**Net-new (this requirement)**
- The SUPER_ADMIN console UI + management API routes for: distributors, wholesalers, retailers, customers, riders.
- **User/auth management** (create/suspend/reset auth users; onboarding) + **access-control** management (roles/sub_roles/permissions/impersonate).
- **Vendor-scoped licensing** (extend the built issuer to distributors/wholesalers for their downstream retailers).

---

## 5. Suggested phasing
1. **Platform foundation** — super-admin entity CRUD (all types) + auth-user create/suspend + role/sub_role assignment + the onboarding flow. *(This is the backbone; "access control + authentication" live here.)*
2. **Scoping + RLS** — apply the `distributor-role.md` RLS (category / retailer_wholesalers); add the downstream-scope resolver; reuse it for management + licensing.
3. **Vendor-scoped licensing** — extend the issuer so distributors/wholesalers issue `.lic` to their retailers (scoped); add `licenses.vendor_id`.
4. **Scoped dashboards** — distributor/wholesaler Admin Hub views (rosters, aggregated reports).
5. **Riders + customers** management; impersonation.

---

## 6. Open decisions
- **Impersonation** mechanism (super-admin acting as an entity) — out of v1 unless prioritized.
- **Onboarding credential delivery** — WhatsApp (per the doc) vs email/temp-password; the WhatsApp gateway is a separate service.
- Whether **Retailer onboarding** is super-admin/distributor-only (doc says distributor-only) or also delegated.
