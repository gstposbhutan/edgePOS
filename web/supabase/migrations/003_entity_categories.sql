-- Migration 003: Entity Categories (junction)
-- Wholesalers and Retailers can span multiple product categories

CREATE TABLE IF NOT EXISTS entity_categories (
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_categories_entity   ON entity_categories(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_categories_category ON entity_categories(category_id);
