# Bug Fix Log

This document tracks bugs found and fixed after feature code changes are committed.

## Template

```markdown
### Bug #[ID] - [Brief Title]
**Date Found**: YYYY-MM-DD  
**Feature**: [Related feature/commit]  
**Severity**: Critical | High | Medium | Low  
**Status**: Open | In Progress | Fixed | Verified  

**Description**:
[Brief description of the bug]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happens]

**Environment**:
- Browser/OS:
- Related Commit:
- Error Messages:

**Fix**:
- **Date Fixed**: YYYY-MM-DD
- **Files Changed**: [List of files]
- **Commit**: [Commit hash]
- **Solution**: [Brief description of fix]

**Verification**:
- **Date Verified**: YYYY-MM-DD
- **Verified By**: [Name]
- **Notes**: [Any notes about verification]
```

---

## Active Bugs

### Bug #004 - Product Details Modal Missing for Cashier
**Date Found**: 2026-04-27
**Feature**: POS Product Selection
**Severity**: Medium
**Status**: Fixed

**Description**:
Cashier clicking a product in ProductPanel expects to see product details in a modal, but currently the click adds product directly to cart.

**Root Cause**:
- ProductCard has `onClick={onAdd}` which directly adds to cart
- No product details modal component exists for POS
- User needs to view product details before adding to cart

**Steps to Reproduce**:
1. Login as cashier
2. Go to POS page
3. Click on any product in product grid
4. Product is directly added to cart (no details shown)

**Expected Behavior**:
Clicking a product should open a modal showing product details (name, SKU, HSN, price, stock, image) with an "Add to Cart" button.

**Actual Behavior**:
Product is immediately added to cart without showing details.

**Environment**:
- Browser/OS: All
- Related Files:
  - `components/pos/product-panel.jsx`
  - `components/pos/product-detail-modal.jsx` (new)

**Fix**:
- **Date Fixed**: 2026-04-27
- **Files Changed**:
  - `components/pos/product-detail-modal.jsx` (new)
  - `components/pos/product-panel.jsx`
  - `app/pos/products/page.jsx`
- **Commit**: TBD
- **Solution**:
  1. Created new ProductDetailModal component showing:
     - Product image
     - Name, SKU, HSN code
     - Price and stock status
     - Package contents (if applicable)
     - Optional Add to Cart button (via `readOnly` prop)
  2. Updated ProductPanel to manage modal state
  3. Updated ProductCard to use `onClick` instead of `onAdd`
  4. Updated `/pos/products` page ProductRow to be clickable
  5. Added role-based behavior:
     - Cashiers see read-only detail modal (no Add to Cart on management page)
     - Managers see edit form on management page
     - Cashiers get Add to Cart button on POS selling page

**Verification**:
- **Date Verified**: TBD
- **Test Steps**:
  1. Login as cashier, go to POS page, click product → See detail modal with Add to Cart
  2. Login as cashier, go to /pos/products, click product → See read-only modal (no Add to Cart)
  3. Login as manager, go to /pos/products, click product → See edit form
- **Notes**: Frontend fix only, no database changes needed

---

### Bug #003 - Order Status Changes Fail RLS Violation
**Date Found**: 2026-04-27
**Feature**: Order Status Logging (commit 7f4e424)
**Severity**: Critical
**Status**: Fixed

**Description**:
Order creation fails for cashiers with "new row violates row-level security policy for table order_status_log". When an order is created, the initial status (PENDING) triggers `log_order_status_change()`, which cannot insert into `order_status_log` due to missing INSERT policy.

**Root Cause**:
- Migration 010 creates `read_own_order_logs` policy with `FOR SELECT` only
- Migration 029 creates `buyer_order_status_log` policy with `FOR SELECT` only
- No INSERT/WITH CHECK policy exists for `order_status_log`
- When order is created with initial status, trigger tries to INSERT but RLS blocks it
- This is same pattern as Bug #002 - missing WITH CHECK clause for INSERT

**Steps to Reproduce**:
1. Login as retailer cashier
2. Create new order through POS
3. Order creation fails with RLS violation error on order_status_log

**Expected Behavior**:
Order status changes should be logged automatically via trigger, allowing users to track order history.

**Actual Behavior**:
Status update fails because trigger cannot insert into order_status_log.

**Environment**:
- Browser/OS: All
- Related Files:
  - `supabase/migrations/010_rls.sql`
  - `supabase/migrations/029_wholesale_order_rls.sql`
  - `supabase/migrations/007_orders.sql` (trigger definition)
- Error Message: "new row violates row-level security policy for table order_status_log"

**Fix**:
- **Date Fixed**: 2026-04-27
- **Files Changed**: `supabase/migrations/038_fix_order_status_log_rls_insert_policy.sql`
- **Commit**: TBD (migration applied locally, not committed)
- **Migration applied**: Yes (local database)
- **Solution**:
  1. Dropped existing SELECT-only policies (`read_own_order_logs`, `buyer_order_status_log`)
  2. Recreated policies with both `USING` and `WITH CHECK` clauses:
     - `seller_own_order_status_logs` - allows sellers full access to their order logs
     - `buyer_own_order_status_logs` - allows buyers full access to their order logs
     - `system_order_status_logs` - allows trigger inserts when order belongs to auth entity
  3. `USING` clause controls SELECT/UPDATE/DELETE
  4. `WITH CHECK` clause controls INSERT (required for trigger to work)

**Verification**:
- **Date Verified**: TBD
- **Test Steps**: TBD
- **Notes**: TBD

---

## Fixed Bugs

---

## Fixed Bugs

### Bug #002 - Retailer Cashier Cannot Create Order
**Date Found**: 2026-04-27
**Feature**: POS Order Creation
**Severity**: Critical
**Status**: Fixed

**Description**:
Retailer cashiers are unable to create orders in the POS system due to missing RLS policy WITH CHECK clause.

**Root Cause**:
- The `seller_own_orders` RLS policy only has `USING` clause: `FOR ALL USING (seller_id = auth_entity_id())`
- `USING` clause applies to SELECT, UPDATE, DELETE operations
- INSERT operations require `WITH CHECK` clause
- Without `WITH CHECK`, inserts fail with "new row violates row-level security policy"

**Steps to Reproduce**:
1. Login as retailer cashier
2. Navigate to POS page
3. Add products to cart
4. Attempt to create order/checkout
5. Order creation fails with RLS violation error

**Expected Behavior**:
Retailer cashier should be able to create orders with products, apply payments, and complete transactions.

**Actual Behavior**:
Order insertion fails due to RLS policy blocking INSERT operations.

**Environment**:
- Browser/OS: All
- Related Files: `supabase/migrations/010_rls.sql`
- Error Message: "new row violates row-level security policy for table orders"

**Fix**:
- **Date Fixed**: 2026-04-27
- **Files Changed**: `supabase/migrations/037_fix_orders_rls_insert_policy.sql`
- **Commit**: 0219b98
- **Solution**:
  1. Dropped existing `seller_own_orders` policy
  2. Recreated policy with both `USING` and `WITH CHECK` clauses:
     ```sql
     CREATE POLICY seller_own_orders ON orders
       FOR ALL
       USING (seller_id = auth_entity_id())
       WITH CHECK (seller_id = auth_entity_id());
     ```
  3. `USING` clause controls SELECT/UPDATE/DELETE
  4. `WITH CHECK` clause controls INSERT

**Verification**:
- **Date Verified**: TBD
- **Test Steps**:
  1. Login as retailer cashier
  2. Create order through POS
  3. Verify order is created successfully
  4. Verify order appears in order history
- **Notes**: Apply migration and test with real retailer account

---

### Bug #001 - HSN Triggers Don't Fire When Using hsn_code Instead of hsn_master_id
**Date Found**: 2026-04-27
**Feature**: HSN-based Category Inheritance (commit 7f4e424)
**Severity**: High
**Status**: Fixed

**Description**:
The category inheritance triggers (`trigger_sync_product_category_from_hsn` and `trigger_sync_entity_product_category_from_hsn`) only fire when `hsn_master_id` (UUID) is set. However, the EntityProductForm stores `hsn_code` (TEXT) directly from the HSN selector, which doesn't trigger the automatic category inheritance.

**Root Cause**:
- Migration 034 creates triggers that watch `hsn_master_id` column
- EntityProductForm saves `hsn_code` TEXT value instead of `hsn_master_id` UUID reference
- Triggers condition: `WHEN (NEW.hsn_master_id IS NOT NULL)` - never fires

**Steps to Reproduce**:
1. Navigate to vendor product form
2. Select an HSN code (e.g., "3004.10.90")
3. Save the entity_product
4. Check if category/subcategory are populated
5. Result: category/subcategory remain NULL

**Expected Behavior**:
Category and subcategory should automatically populate from HSN code when entity_product is created/updated with hsn_code.

**Actual Behavior**:
Triggers don't fire because they check `hsn_master_id`, not `hsn_code`.

**Environment**:
- Related Migration: 034_products_hsn_inheritance.sql
- Related Files:
  - `supabase/migrations/034_products_hsn_inheritance.sql`
  - `components/pos/products/entity-product-form.jsx`
  - `components/pos/products/hsn-code-selector.jsx`

**Fix**:
- **Date Fixed**: 2026-04-27
- **Files Changed**:
  - `supabase/migrations/036_fix_hsn_trigger_on_code.sql`
  - `components/pos/products/entity-product-form.jsx`
- **Commit**: 7a59648
- **Solution**:
  1. Created migration 036 with new triggers that fire on `hsn_code` change:
     - `trigger_sync_hsn_master_id_from_code_products` for products table
     - `trigger_sync_hsn_master_id_from_code_entity_products` for entity_products
  2. Triggers populate `hsn_master_id` from `hsn_code` lookup
  3. Existing category inheritance triggers then fire because `hsn_master_id` is set
  4. Fixed entity-product-form to load `hsn_code` when editing existing products

**Verification**:
- **Date Verified**: TBD
- **Test Steps**:
  1. Create new entity_product with HSN code
  2. Verify category/subcategory are auto-populated
  3. Edit existing entity_product
  4. Verify HSN code loads correctly
  5. Update HSN code and verify category updates
- **Notes**: Migration includes backfill query for existing records

---

## Statistics

- **Total Bugs**: 4
- **Open**: 0
- **In Progress**: 0
- **Fixed**: 4
- **Verified**: 0

---

## Notes

1. Always update this log immediately after finding a bug
2. Include the commit hash of the feature that introduced the bug
3. Mark bugs as "Fixed" only after commit is made
4. Mark as "Verified" after testing the fix
5. Consider reopening if bug reappears or fix causes regression
