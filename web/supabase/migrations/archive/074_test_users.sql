-- Migration 074: Test users for all roles
-- Creates entities + auth users + profiles for system testing
-- All passwords: test1234
-- Password hash is bcrypt for 'test1234' generated via Supabase auth schema

-- ============================================================
-- Part A: Entities for each role
-- Uses ON CONFLICT (id) + excludes existing TPNs via WHERE NOT EXISTS
-- ============================================================

-- SUPER_ADMIN entity (platform operator)
INSERT INTO entities (id, name, role, tpn_gstin, whatsapp_no, is_active)
SELECT 'a0000000-0000-4000-8000-000000000001', 'Nexus Admin', 'SUPER_ADMIN', 'TPN9990001', '+97517000001', true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000001');

-- DISTRIBUTOR entity
INSERT INTO entities (id, name, role, tpn_gstin, whatsapp_no, is_active)
SELECT 'a0000000-0000-4000-8000-000000000002', 'GST Distributors', 'DISTRIBUTOR', 'TPN9990002', '+97517000002', true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000002');

-- WHOLESALER entity
INSERT INTO entities (id, name, role, tpn_gstin, whatsapp_no, credit_limit, is_active)
SELECT 'a0000000-0000-4000-8000-000000000003', 'Thimphu Wholesale', 'WHOLESALER', 'TPN9990003', '+97517000003', 500000, true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000003');

-- RETAILER entity (Dawai Tshongkhang)
INSERT INTO entities (id, name, role, tpn_gstin, whatsapp_no, credit_limit, is_active)
SELECT 'a0000000-0000-4000-8000-000000000004', 'Dawai Tshongkhang', 'RETAILER', 'TPN9990004', '+97517000004', 100000, true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000004');

-- Second RETAILER for multi-tenant testing
INSERT INTO entities (id, name, role, tpn_gstin, whatsapp_no, credit_limit, is_active)
SELECT 'a0000000-0000-4000-8000-000000000005', 'City Mart', 'RETAILER', 'TPN9990005', '+97517000005', 75000, true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000005');

-- CUSTOMER entity (no TPN required)
INSERT INTO entities (id, name, role, whatsapp_no, is_active)
SELECT 'a0000000-0000-4000-8000-000000000006', 'Tenzin Dorji', 'CUSTOMER', '+97517900001', true
WHERE NOT EXISTS (SELECT 1 FROM entities WHERE id = 'a0000000-0000-4000-8000-000000000006');

-- ============================================================
-- Part B: Auth users (direct insert into auth.users)
-- Using Supabase's crypt() for password hashing
-- All passwords: test1234
-- ============================================================

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  phone, created_at, updated_at, confirmation_token, email_change, phone_change,
  recovery_token, email_change_token_new
)
SELECT
  u.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  u.email,
  crypt('test1234', gen_salt('bf')),
  NOW(),
  NULL,
  NOW(),
  NOW(),
  '',
  '',
  '',
  '',
  ''
FROM (
  VALUES
    ('a1000000-0000-4000-a000-000000000001'::UUID, 'admin@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000002'::UUID, 'distributor@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000003'::UUID, 'wholesaler@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000004'::UUID, 'retailer@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000005'::UUID, 'retailer2@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000006'::UUID, 'cashier@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000007'::UUID, 'staff@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000008'::UUID, 'customer@nexus.bt')
) AS u(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE auth.users.id = u.id
);

-- Add identities for the auth users (required for Supabase auth to work)
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, created_at, updated_at
)
SELECT
  u.id,
  u.id,
  u.id::text,
  'email',
  jsonb_build_object(
    'sub', u.id::text,
    'email', u.email,
    'email_verified', true
  ),
  NOW(),
  NOW()
FROM (
  VALUES
    ('a1000000-0000-4000-a000-000000000001'::UUID, 'admin@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000002'::UUID, 'distributor@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000003'::UUID, 'wholesaler@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000004'::UUID, 'retailer@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000005'::UUID, 'retailer2@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000006'::UUID, 'cashier@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000007'::UUID, 'staff@nexus.bt'),
    ('a1000000-0000-4000-a000-000000000008'::UUID, 'customer@nexus.bt')
) AS u(id, email)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE auth.identities.id = u.id
);

-- ============================================================
-- Part C: User profiles (RBAC mapping)
-- ============================================================

INSERT INTO user_profiles (id, entity_id, role, sub_role, permissions, full_name)
VALUES
  -- SUPER_ADMIN owner
  ('a1000000-0000-4000-a000-000000000001',
   'a0000000-0000-4000-8000-000000000001',
   'SUPER_ADMIN', 'OWNER',
   ARRAY['all'],
   'System Admin'),

  -- DISTRIBUTOR owner
  ('a1000000-0000-4000-a000-000000000002',
   'a0000000-0000-4000-8000-000000000002',
   'DISTRIBUTOR', 'OWNER',
   ARRAY['all'],
   'Karma Tshering'),

  -- WHOLESALER owner
  ('a1000000-0000-4000-a000-000000000003',
   'a0000000-0000-4000-8000-000000000003',
   'WHOLESALER', 'OWNER',
   ARRAY['all'],
   'Pema Wangchuk'),

  -- RETAILER owner (Dawai Tshongkhang)
  ('a1000000-0000-4000-a000-000000000004',
   'a0000000-0000-4000-8000-000000000004',
   'RETAILER', 'OWNER',
   ARRAY['all'],
   'Dawa Sherpa'),

  -- RETAILER owner (City Mart)
  ('a1000000-0000-4000-a000-000000000005',
   'a0000000-0000-4000-8000-000000000005',
   'RETAILER', 'OWNER',
   ARRAY['all'],
   'Sonam Tenzin'),

  -- RETAILER cashier (Dawai Tshongkhang)
  ('a1000000-0000-4000-a000-000000000006',
   'a0000000-0000-4000-8000-000000000004',
   'RETAILER', 'CASHIER',
   ARRAY['pos:sell', 'pos:refund', 'inventory:view', 'reports:view'],
   'Leki Zam'),

  -- RETAILER staff (Dawai Tshongkhang)
  ('a1000000-0000-4000-a000-000000000007',
   'a0000000-0000-4000-8000-000000000004',
   'RETAILER', 'STAFF',
   ARRAY['pos:sell', 'inventory:view'],
   'Tshering Dorji'),

  -- CUSTOMER
  ('a1000000-0000-4000-a000-000000000008',
   'a0000000-0000-4000-8000-000000000006',
   'CUSTOMER', 'CUSTOMER',
   ARRAY['orders:create', 'orders:view', 'profile:edit'],
   'Tenzin Dorji')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Part D: Retailer-Wholesaler links
-- retailer_wholesalers requires category_id (per-category relationships)
-- Will be populated during product import when categories are assigned
-- ============================================================
