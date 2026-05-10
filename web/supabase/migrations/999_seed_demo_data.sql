-- Migration 999: Seed demo data for testing
-- Creates demo retailers with products for the shop

-- Demo retailer entity
INSERT INTO entities (id, name, role, whatsapp_no, tpn_gstin, credit_limit, is_active)
VALUES (
  '10000000-0000-4000-8000-000000000001',
  'Demo Retailer',
  'RETAILER',
  '+97517123456',
  'TPN1234567',
  50000,
  true
)
ON CONFLICT (id) DO UPDATE SET
  whatsapp_no = EXCLUDED.whatsapp_no,
  name = EXCLUDED.name;

-- Sample products (using only core columns that exist)
INSERT INTO products (id, name, sku, hsn_code, mrp, wholesale_price, unit, current_stock, is_active, image_url, created_by)
VALUES
  ('a0000001-0000-4000-8000-000000000001', 'Coca Cola 500ml', 'CC-500', '2201', 50.00, 35.00, 'pcs', 100, true, 'https://images.unsplash.com/photo-1554866585-cd948f6bdcb8?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000002-0000-4000-8000-000000000002', 'Fanta Orange 500ml', 'FO-500', '2201', 50.00, 35.00, 'pcs', 80, true, 'https://images.unsplash.com/photo-1563443861-7823f18f8e6b?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000003-0000-4000-8000-000000000003', 'Maggi Noodles 70g', 'MN-070', '1904', 15.00, 10.00, 'pcs', 200, true, 'https://images.unsplash.com/photo-1615486523577-f4bd0035c71c?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000004-0000-4000-8000-000000000004', 'Rice (White) 1kg', 'RW-1KG', '1006', 45.00, 35.00, 'kg', 50, true, 'https://images.unsplash.com/photo-1586201375761-8b6503b4b06c?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000005-0000-4000-8000-000000000005', 'Cooking Oil 1L', 'CO-1L', '1511', 150.00, 120.00, 'l', 30, true, 'https://images.unsplash.com/photo-1584981099574-0659be6fe2a0?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000006-0000-4000-8000-000000000006', 'Sugar 1kg', 'SG-1KG', '1701', 85.00, 70.00, 'kg', 100, true, 'https://images.unsplash.com/photo-1617808250212-0b3ebbd64c12?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000007-0000-4000-8000-000000000007', 'Dettol Soap 125g', 'DS-125', '3304', 45.00, 30.00, 'pcs', 60, true, 'https://images.unsplash.com/photo-1608571428908-ea4a7e983a82?w=400', '10000000-0000-4000-8000-000000000001'),
  ('a0000008-0000-4000-8000-000000000008', 'Toothpaste Colgate 100g', 'TP-100', '3306', 35.00, 25.00, 'pcs', 75, true, 'https://images.unsplash.com/photo-1606913867048-d29a9a2f0238?w=400', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Create a second retailer for variety
INSERT INTO entities (id, name, role, whatsapp_no, tpn_gstin, credit_limit, is_active)
VALUES (
  '10000000-0000-4000-8000-000000000002',
  'City Mart',
  'RETAILER',
  '+97517555555',
  'TPN7654321',
  75000,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Products for second retailer
INSERT INTO products (id, name, sku, hsn_code, mrp, wholesale_price, unit, current_stock, is_active, image_url, created_by)
VALUES
  ('b0000001-0000-4000-8000-000000000001', 'Bounty Paper Towels', 'BP-200', '4818', 25.00, 18.00, 'roll', 120, true, 'https://images.unsplash.com/photo-1584297965380-e7a959c59bf4?w=400', '10000000-0000-4000-8000-000000000002'),
  ('b0000002-0000-4000-8000-000000000002', 'Tissue Box 100s', 'TT-100', '4818', 30.00, 22.00, 'box', 90, true, 'https://images.unsplash.com/photo-1614810711076-67b3c0d1c4c5?w=400', '10000000-0000-4000-8000-000000000002'),
  ('b0000003-0000-4000-8000-000000000003', 'Handwash 500ml', 'HW-500', '3304', 120.00, 90.00, 'btl', 40, true, 'https://images.unsplash.com/photo-1594229739725-1c3bed0208e1?w=400', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;
