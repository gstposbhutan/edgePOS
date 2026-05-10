-- Migration 008: Inventory Movements

CREATE TABLE IF NOT EXISTS inventory_movements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id),
  entity_id     UUID NOT NULL REFERENCES entities(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('SALE', 'RESTOCK', 'TRANSFER', 'LOSS', 'DAMAGED', 'RETURN')),
  quantity      INT NOT NULL,
  reference_id  UUID,
  notes         TEXT,
  created_by    UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_entity  ON inventory_movements(entity_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);

CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET current_stock = current_stock + NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_movement_apply ON inventory_movements;
CREATE TRIGGER inventory_movement_apply
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();
