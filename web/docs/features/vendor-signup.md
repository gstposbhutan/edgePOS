# Feature: Vendor Signup (Retailer & Wholesaler)

**Feature ID**: F-SIGNUP-001
**Phase**: 1
**Status**: Code Complete
**Last Updated**: 2026-04-29

---

## Overview

Separate signup pages for retailers and wholesalers. Both create:
1. An `entities` row with the correct `role` (RETAILER or WHOLESALER)
2. An `auth.users` account for the owner
3. A `user_profiles` row with `sub_role = 'OWNER'`
4. An `owner_stores` link (for multi-store support)
5. An immediate session via magic link tokens

After signup, RETAILER owners are redirected to `/pos`, WHOLESALER owners to `/admin`.

---

## Pages

| URL | Role | Redirect |
|-----|------|----------|
| `/signup/retailer` | RETAILER | `/pos` |
| `/signup/wholesaler` | WHOLESALER | `/admin` |

Both pages link to each other ("Wholesaler? Create a wholesale account" and vice versa). The login page footer links to both.

---

## API

**`POST /api/auth/signup/vendor`** — unified endpoint used by both pages. Accepts `role: 'RETAILER' | 'WHOLESALER'` in the request body. Creates entity, auth user (`user_metadata` with role/sub_role/entity_id), user_profile, and owner_stores link. Returns magic link tokens for immediate session.

The old `/api/auth/signup/wholesaler` endpoint is superseded by this unified route.

---

## Role Model

- `role` = `RETAILER` or `WHOLESALER` (business type, stored on entities and user_profiles)
- `sub_role` = `OWNER` for the creating user; `MANAGER`, `CASHIER`, `STAFF` for added team members
- The creating user is always assigned `sub_role = OWNER`
- Ownership can be transferred to another team member from `/admin/team`
