# Feature: Role-Based Authentication & Multi-Tenant Access Control

**Feature ID**: F-AUTH-001  
**Phase**: 1 (Foundation — Launch Blocker)  
**Status**: Scoped  
**Last Updated**: 2026-04-07

---

## Overview

A single Supabase Auth identity that works across all three apps (`pos-terminal`, `admin-hub`, `marketplace`). Access surfaces are determined by the user's role and sub-role. Row-Level Security enforces tenant isolation at the database layer — no application logic can bypass it.

---

## Identity Model

### Tables

**`auth.users`** — Managed entirely by Supabase Auth. No direct writes.

**`user_profiles`** — Extends auth.users with business context:

```sql
CREATE TABLE user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES entities(id),
  role         TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER')),
  sub_role     TEXT NOT NULL CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN')),
  permissions  TEXT[] DEFAULT '{}',
  full_name    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### JWT Custom Claims
A Postgres function populates custom claims into every JWT token issued by Supabase Auth:

```sql
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims JSONB;
  profile RECORD;
BEGIN
  SELECT entity_id, role, sub_role, permissions
  INTO profile
  FROM user_profiles WHERE id = (event->>'user_id')::UUID;

  claims := event->'claims';
  claims := jsonb_set(claims, '{entity_id}',  to_jsonb(profile.entity_id));
  claims := jsonb_set(claims, '{role}',        to_jsonb(profile.role));
  claims := jsonb_set(claims, '{sub_role}',    to_jsonb(profile.sub_role));
  claims := jsonb_set(claims, '{permissions}', to_jsonb(profile.permissions));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

RLS policies read `auth.jwt() ->> 'entity_id'` and `auth.jwt() ->> 'role'` — no extra DB query per request.

---

## Role & Permission Matrix

| Role | Sub-role | POS Terminal | Admin Hub | Marketplace |
|------|----------|-------------|-----------|-------------|
| SUPER_ADMIN | — | Impersonate any | Full system + all analytics | Full |
| DISTRIBUTOR | ADMIN | None | Full system view + create Wholesalers/Retailers | None |
| DISTRIBUTOR | STAFF | None | Read only | None |
| WHOLESALER | OWNER | Full access | Full access | Manage listings |
| WHOLESALER | STAFF | None | Orders + Inventory | None |
| RETAILER | OWNER | Full access | Full access | Browse + Order |
| RETAILER | MANAGER | Full POS | Reports + Inventory | Browse + Order |
| RETAILER | CASHIER | POS only | None | None |

### Permission Flags (fine-grained within sub-role)
Stored in `permissions TEXT[]`. Checked in middleware and UI guards:

```
pos:sell            — Process transactions
pos:void            — Void/refund transactions
inventory:view      — Read stock levels
inventory:edit      — Adjust stock
reports:view        — Access sales/GST reports
reports:export      — Download/export reports
users:manage        — Add/remove staff in their entity
credit:manage       — Set retailer credit limits (Wholesaler only)
supply:order        — Place wholesale restock orders
```

---

## Session Behaviour

### POS Terminal (Device-Bound)
- Staff logs in once on device setup
- Supabase persistent session stored in browser localStorage/IndexedDB
- Session auto-refreshes silently while online
- No per-cashier login on shift start — device session represents the store

### Offline Handling — Hard Block
- Network check runs before rendering any authenticated route
- If offline: full-screen connectivity gate is shown, no POS access
- Rationale: prevents stale transactions, ensures GST records are immediately syncable

```
[Online]  → Normal auth flow → POS accessible
[Offline] → Connectivity gate → "Internet required to continue"
           → Retry button → polls for connection → auto-resumes
```

### Multi-App Single Identity
- One Supabase Auth user account
- On login, JWT claims determine which app routes are accessible
- Each app reads `role` and `sub_role` from JWT to render correct navigation and feature access
- Attempting to access an unauthorized route redirects to role-appropriate home screen

---

## Row-Level Security Policies

Every table scoped to an entity uses this pattern:

```sql
-- Tenants can only read their own entity's data
CREATE POLICY "tenant_isolation" ON transactions
  FOR ALL USING (
    seller_id = (auth.jwt() ->> 'entity_id')::UUID
  );

-- Wholesalers can see their retailers' data
CREATE POLICY "wholesaler_sees_retailers" ON transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM entities e
      WHERE e.id = seller_id
      AND e.parent_entity_id = (auth.jwt() ->> 'entity_id')::UUID
    )
    AND (auth.jwt() ->> 'role') = 'WHOLESALER'
  );
```

---

## Auth Flow Diagrams

### First-Time Device Setup (POS Terminal)
```
Device opens pos-terminal
  → No session found → Login screen
  → Staff enters credentials (email + password)
  → Supabase Auth validates → returns JWT with custom claims
  → role = RETAILER? → POS home screen
  → role = WHOLESALER/DISTRIBUTOR? → redirect to admin-hub
  → Session persisted on device
  → Future visits → JWT auto-refresh → POS loads directly
```

### Unauthorized Role Redirect
```
CASHIER attempts to access /reports
  → Middleware checks JWT sub_role
  → sub_role = CASHIER, route requires MANAGER+
  → Redirect to /pos (cashier home)
  → No error shown — silent redirect
```

---

## Implementation Checklist

- [ ] Create `user_profiles` table with RLS
- [ ] Implement `custom_access_token_hook` Postgres function
- [ ] Register hook in Supabase Auth settings
- [ ] Build Login page (email + password, Royal Bhutan design)
- [ ] Build connectivity gate component (offline hard-block)
- [ ] Implement Next.js middleware for route protection across all apps
- [ ] Build role-redirect logic (wrong role → correct home)
- [ ] Implement permission guard component `<RequiresPermission perm="pos:void">`
- [ ] Seed initial DISTRIBUTOR admin account
- [ ] Provision SUPER_ADMIN account directly in DB (no self-registration path)
- [ ] Implement SUPER_ADMIN impersonation session (switch entity context without re-auth)
- [ ] Build SUPER_ADMIN system-wide analytics dashboard (all tenants, all sales, all activity)
- [ ] Write RLS policies for all core tables — SUPER_ADMIN bypasses RLS via `BYPASSRLS` role
- [ ] Test cross-tenant isolation (Retailer A cannot read Retailer B data)
- [ ] Implement password reset — Email (Supabase magic link) + WhatsApp OTP via whatsapp_no
- [ ] Build Marketplace public route with GA4 instrumentation (impressions, scroll, CTA clicks)
- [ ] Build Marketplace auth gate — lock search/filters/cart behind login prompt

---

## Security Notes

- JWT custom claims are set server-side via Postgres hook — cannot be spoofed by client
- `user_profiles` has RLS: users can only read their own profile
- `CASHIER` sub-role has no access to financial data or admin routes
- Device-bound sessions reduce credential exposure vs per-shift login
- Offline hard-block prevents any transaction from being created without a valid, refreshable session

---

## Resolved Decisions

**Q: Should Wholesalers be able to create Retailer accounts?**  
A: **Distributor-only by default.** Only DISTRIBUTOR can onboard new Wholesaler and Retailer accounts. Wholesalers cannot provision new entities. See [F-DIST-001](distributor-role.md) — open question remains whether Wholesalers can onboard Retailers under them.

**Q: Is there a super admin above Distributor?**  
A: **Yes — SUPER_ADMIN role** exists above DISTRIBUTOR in the hierarchy. Capabilities:
- Impersonate any entity at any role level for support/troubleshooting
- View complete system-wide sales, activity, and analytics across all tenants
- Not bound by RLS tenant isolation — sees everything
- Separate from DISTRIBUTOR — Distributors cannot impersonate or see cross-tenant data
- Must be provisioned directly in DB (no self-registration)

**Q: Password reset flow?**  
A: **Both supported** — user can choose Email (Supabase default magic link) or WhatsApp OTP. WhatsApp OTP uses the `whatsapp_no` stored on the entity record.

**Q: Marketplace public access?**  
A: **Two-tier access model:**
- **Public (unauthenticated)**: Featured product listings only, no search/filters/cart. Heavily instrumented with Google Analytics 4 (page views, product impressions, scroll depth, CTA clicks) for lead generation tracking.
- **Authenticated (logged in)**: Full search, filters, cart, and order placement unlocked. User must log in to proceed past browse-only mode.
