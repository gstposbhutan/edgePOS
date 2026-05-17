-- Migration 029: Wholesale order RLS + buyer restock trigger
-- Enables retailers to create/view WHOLESALE purchase orders,
-- and auto-restocks retailer inventory when orders are delivered.

-- ── Buyer-side RLS on orders ──────────────────────────────────────────────

CREATE POLICY "buyer_own_wholesale_orders" ON orders
  FOR SELECT USING (
    buyer_id = auth_entity_id()
  );

CREATE POLICY "retailer_create_wholesale_order" ON orders
  FOR INSERT WITH CHECK (
    buyer_id = auth_entity_id()
    AND order_type = 'WHOLESALE'
  );

-- Retailers need to update their own wholesale orders (for cancellation)
CREATE POLICY "buyer_update_wholesale_orders" ON orders
  FOR UPDATE USING (
    buyer_id = auth_entity_id()
    AND order_type = 'WHOLESALE'
  );

-- ── Buyer-side RLS on order_items ────────────────────────────────────────

CREATE POLICY "order_items_buyer_read" ON order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

CREATE POLICY "order_items_buyer_insert" ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

-- ── Buyer-side RLS on order_status_log ──────────────────────────────────

CREATE POLICY "buyer_order_status_log" ON order_status_log
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE buyer_id = auth_entity_id())
  );

-- ── Retailer connections visibility ──────────────────────────────────────

CREATE POLICY "retailer_own_connections" ON retailer_wholesalers
  FOR SELECT USING (
    retailer_id = auth_entity_id()
  );

-- ── Wholesaler can also read connections where they are the supplier ─────

CREATE POLICY "wholesaler_own_connections" ON retailer_wholesalers
  FOR SELECT USING (
    wholesaler_id = auth_entity_id()
  );

-- ── Index for buyer-side order queries ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_buyer_type ON orders(buyer_id, order_type);

-- ── Restock trigger: auto-create RESTOCK movements for buyer on delivery ─

CREATE OR REPLACE FUNCTION restock_buyer_on_delivery()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('DELIVERED', 'COMPLETED')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.order_type = 'WHOLESALE'
     AND NEW.buyer_id IS NOT NULL THEN

    INSERT INTO inventory_movements (id, product_id, entity_id, movement_type, quantity, reference_id, timestamp)
    SELECT
      gen_random_uuid(),
      oi.product_id,
      NEW.buyer_id,
      'RESTOCK',
      oi.quantity,
      NEW.id,
      NOW()
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id IS NOT NULL
      AND oi.status = 'ACTIVE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_restock_buyer ON orders;
CREATE TRIGGER orders_restock_buyer
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION restock_buyer_on_delivery();
