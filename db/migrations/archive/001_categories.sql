-- Migration 001: Categories
-- Product categories managed by Distributors

CREATE TABLE categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  distributor_id UUID,  -- FK added after entities table is created (migration 002)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Seed core categories
INSERT INTO categories (name) VALUES
  ('Food & Grocery'),
  ('Electronics'),
  ('Textiles & Clothing'),
  ('Health & Pharmacy'),
  ('Hardware & Construction'),
  ('Stationery & Office'),
  ('General Merchandise');
