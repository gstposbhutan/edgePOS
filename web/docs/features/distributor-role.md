# Feature: Distributor Role — Platform Operator

**Feature ID**: F-DIST-001  
**Phase**: 1 (Foundation)  
**Status**: Scoped  
**Last Updated**: 2026-04-07

---

## Overview

Distributors are **platform operators**, not supply chain participants. They do not move goods, hold inventory, or process orders. Their function is ecosystem governance — onboarding and managing Wholesalers and Retailers within their assigned product category domain.

Multiple Distributors can exist simultaneously, each scoped to a distinct product category (e.g. Electronics, Food & Grocery, Textiles). A Distributor cannot see data belonging to another Distributor's category.

---

## Role Definition

| Attribute | Value |
|-----------|-------|
| Goods movement | None |
| Inventory | None |
| POS access | None |
| Marketplace access | None |
| Primary tool | Admin Hub |
| Data scope | Their category's Wholesalers + Retailers only |
| Above them | SUPER_ADMIN only |

---

## Category Scoping

Each Distributor is associated with one or more product categories. This drives their RLS boundary.

### Schema Addition — `categories` table

```sql
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,   -- e.g. 'Electronics', 'Food & Grocery'
  distributor_id  UUID NOT NULL REFERENCES entities(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Schema Addition — `entity_categories` junction table
Wholesalers and Retailers can span multiple categories. Replaces single `category_id` FK on `entities`.

```sql
CREATE TABLE entity_categories (
  entity_id    UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, category_id)
);
```

### Schema Addition — `product_categories` junction table
Products can belong to multiple categories.

```sql
CREATE TABLE product_categories (
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
```

### Schema Addition — `retailer_wholesalers` junction table
A Retailer can source from multiple Wholesalers. Replaces the single `parent_entity_id` assumption.
Relationship is per-category — a Retailer uses Wholesaler A for Electronics, Wholesaler B for Food.

```sql
CREATE TABLE retailer_wholesalers (
  retailer_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id),
  is_primary    BOOLEAN DEFAULT FALSE,  -- Primary supplier for this category
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (retailer_id, wholesaler_id, category_id)
);
```

### Impact on `entities` table
- **Remove** `parent_entity_id` (single-parent assumption no longer valid)
- Retailer ↔ Wholesaler relationships live in `retailer_wholesalers`
- Entity ↔ Category relationships live in `entity_categories`

### RLS: Distributor sees only their categories

```sql
-- Distributor can see entities associated with their categories
CREATE POLICY "distributor_category_scope" ON entities
  FOR SELECT USING (
    id IN (
      SELECT ec.entity_id FROM entity_categories ec
      JOIN categories c ON c.id = ec.category_id
      WHERE c.distributor_id = (auth.jwt() ->> 'entity_id')::UUID
    )
    OR id = (auth.jwt() ->> 'entity_id')::UUID
  );
```

### RLS: Wholesaler sees only their associated Retailers

```sql
-- Wholesaler can see Retailers they are linked to
CREATE POLICY "wholesaler_retailer_scope" ON entities
  FOR SELECT USING (
    id IN (
      SELECT retailer_id FROM retailer_wholesalers
      WHERE wholesaler_id = (auth.jwt() ->> 'entity_id')::UUID
      AND active = TRUE
    )
    OR id = (auth.jwt() ->> 'entity_id')::UUID
  );
```

---

## Distributor Capabilities (Admin Hub)

### Account Management
- Create, edit, suspend, and deactivate Wholesaler accounts within their category
- Create, edit, suspend, and deactivate Retailer accounts within their category
- Set default credit limits for newly onboarded Retailers (overridable by Wholesaler)
- View full user roster for every entity in their category

### Ecosystem Monitoring
- Dashboard: total Wholesalers, total Retailers, active vs inactive entities
- Category-level sales volume (aggregated, not per-transaction detail)
- Low-stock alerts across all Retailers in their category
- Credit utilisation overview across all Retailers

### Reporting
- Category-level GST summary (aggregated from all entities in their category)
- Monthly activity report (transactions count, revenue, refunds, cancellations)
- Entity performance comparison (which Wholesalers/Retailers are most/least active)
- Export reports to CSV/PDF for regulatory or internal review

### What Distributors Cannot Do
- View individual transaction line items (only aggregated totals)
- Approve or deny refunds (that is Retailer/Wholesaler Owner responsibility)
- Access another Distributor's category data
- Impersonate entities (SUPER_ADMIN only)
- Access POS Terminal or Marketplace

---

## Hierarchy Summary

Entities are no longer strictly tree-structured. Retailers can have multiple Wholesaler relationships across categories.

```
SUPER_ADMIN
  │
  ├── DISTRIBUTOR (Electronics)
  │     ├── WHOLESALER A (Electronics Thimphu)
  │     └── WHOLESALER B (Electronics Paro)
  │
  └── DISTRIBUTOR (Food & Grocery)
        ├── WHOLESALER C (Food Thimphu)
        └── WHOLESALER D (Food Paro)

RETAILER 1 (General Store, Thimphu)
  ├── sources Electronics  → from WHOLESALER A  [primary]
  ├── sources Electronics  → from WHOLESALER B  [secondary]
  └── sources Food         → from WHOLESALER C  [primary]

RETAILER 2 (Electronics Shop, Paro)
  └── sources Electronics  → from WHOLESALER B  [primary]
```

A Retailer is visible to **every Wholesaler they are linked to** via `retailer_wholesalers`, and visible to **every Distributor** whose category the Retailer operates in via `entity_categories`.

---

## Multi-Distributor Isolation

- Distributor A (Electronics) has zero visibility into Distributor B (Food & Grocery) data
- Products, entities, transactions, and reports are all scoped by `category_id`
- A Wholesaler or Retailer belongs to exactly one category (and therefore one Distributor)
- SUPER_ADMIN is the only role that sees across all Distributors

---

## Onboarding Flow (Distributor Creates Wholesaler)

```
Distributor logs into Admin Hub
  → Navigate to "Manage Wholesalers"
  → Click "Add Wholesaler"
  → Enter: Business name, TPN/GSTIN, WhatsApp number, contact name
  → System creates entity record (role: WHOLESALER, category_id: distributor's category)
  → System creates Supabase Auth user + user_profile
  → Onboarding WhatsApp message sent with login credentials
  → Wholesaler appears in Distributor's roster
```

Same flow applies for Retailer onboarding (can be done by Distributor or delegated to the Wholesaler the Retailer belongs to — **to be confirmed**).

---

## Implementation Checklist

- [ ] Create `categories` table
- [ ] Create `entity_categories` junction table (entity ↔ category, many-to-many)
- [ ] Create `product_categories` junction table (product ↔ category, many-to-many)
- [ ] Create `retailer_wholesalers` junction table (retailer ↔ wholesaler per category)
- [ ] Remove `parent_entity_id` from `entities` (replaced by junction tables)
- [ ] Seed initial product categories
- [ ] Write RLS policy: Distributor scoped to their category's entities
- [ ] Write RLS policy: Distributor sees aggregated (not line-item) transaction data
- [ ] Build Admin Hub: Distributor dashboard (ecosystem overview)
- [ ] Build Admin Hub: Wholesaler management (create, edit, suspend)
- [ ] Build Admin Hub: Retailer management (create, edit, suspend)
- [ ] Build Admin Hub: Category-level GST and activity reports
- [ ] Build onboarding flow with WhatsApp credential delivery
- [ ] Add `category_id` JWT claim for Distributor users

---

## Resolved Decisions

**Q: Can a Wholesaler or Retailer span multiple categories?**  
A: **Yes.** Both Wholesalers and Retailers can operate across multiple product categories. Single `category_id` FK replaced with `entity_categories` and `product_categories` junction tables. `parent_entity_id` on `entities` removed — superseded by `retailer_wholesalers` junction table.

**Q: Who onboards Retailers?**  
A: **Distributor-only.** Wholesalers cannot create Retailer accounts. Once a Retailer is onboarded by a Distributor, multiple Wholesalers can be associated to that Retailer via `retailer_wholesalers` based on the product categories they supply.
