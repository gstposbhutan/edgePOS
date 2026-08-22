-- Migration 041: Add CUSTOMER role for marketplace customers
-- Allows customers to login via WhatsApp and place orders

-- Add CUSTOMER to the role check constraint
-- First, we need to drop and recreate the constraint
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_role_check;

ALTER TABLE entities ADD CONSTRAINT entities_role_check 
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

-- Also update user_profiles role constraint if needed
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;

ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check 
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

-- Add sub_role for customers (they only have one role)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_sub_role_check;

ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_sub_role_check 
  CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN', 'CUSTOMER'));
