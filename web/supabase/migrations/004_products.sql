-- Migration 004: Products (Central Brain Vector Library)
-- Shared product knowledge across all entities in Bhutan

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  sku              TEXT UNIQUE,
  hsn_code         TEXT NOT NULL,
  image_url        TEXT,
  image_embedding  vector(1536),
  current_stock    INT DEFAULT 0,
  wholesale_price  DECIMAL(12,2),
  mrp              DECIMAL(12,2),
  unit             TEXT DEFAULT 'pcs',
  is_active        BOOLEAN DEFAULT TRUE,
  created_by       UUID REFERENCES entities(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to pre-existing products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku              TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_embedding  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock    INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price  DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS mrp              DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit             TEXT DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active        BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by       UUID REFERENCES entities(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS product_categories (
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product  ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- Alter image_embedding to vector type if it exists as a different type
DO $$ BEGIN
  ALTER TABLE products ALTER COLUMN image_embedding TYPE vector(1536)
    USING image_embedding::vector(1536);
EXCEPTION WHEN others THEN NULL;
END $$;

-- Create ivfflat index only if column is vector type
DO $$ BEGIN
  CREATE INDEX idx_products_embedding ON products
    USING ivfflat (image_embedding vector_cosine_ops)
    WITH (lists = 100);
EXCEPTION WHEN duplicate_table THEN NULL;
       WHEN undefined_object  THEN NULL;
       WHEN others            THEN NULL;
END $$;
