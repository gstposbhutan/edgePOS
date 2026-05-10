-- Migration 044: DISABLE RLS for development
-- Re-enable with migration 045_enable_rls_prod.sql when ready

ALTER TABLE entities DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE carts DISABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE face_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE khata_repayments DISABLE ROW LEVEL SECURITY;
-- Tables created in later migrations — RLS disabled in their own migrations:
-- owner_stores (050), riders (047), wholesale_orders
-- ALTER TABLE wholesale_orders DISABLE ROW LEVEL SECURITY; -- May not exist yet

-- Note: These tables will be re-enabled in production
