-- Migration 040: Demo WhatsApp Login Setup
-- Creates a demo retailer entity with WhatsApp number for testing
-- WhatsApp login requires: entity → user_profile → auth_user
--
-- For demo, use: email: cashier@teststore.bt, password: TestCashier@2026

-- Ensure demo entity exists with WhatsApp number
INSERT INTO entities (id, name, role, whatsapp_no, tpn_gstin, credit_limit, is_active)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Demo Store',
  'RETAILER',
  '+97517100001',
  'TPN0000001',
  50000,
  true
)
ON CONFLICT (id) DO UPDATE SET
  whatsapp_no = EXCLUDED.whatsapp_no;

-- Note: user_profile and auth.users must exist for WhatsApp login to work.
-- Run: npm run test:seed to create test users, or signup via email first.
