-- Migration 005: Retailer ↔ Wholesaler relationships
-- Replaces parent_entity_id. A Retailer can source from multiple Wholesalers per category.

CREATE TABLE IF NOT EXISTS retailer_wholesalers (
  retailer_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  wholesaler_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary    BOOLEAN DEFAULT FALSE,
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (retailer_id, wholesaler_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_rw_retailer   ON retailer_wholesalers(retailer_id);
CREATE INDEX IF NOT EXISTS idx_rw_wholesaler ON retailer_wholesalers(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_rw_category   ON retailer_wholesalers(category_id);
