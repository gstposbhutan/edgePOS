-- Migration 031: Allow retailers to read wholesaler entities they're connected to
-- This is needed for the vendor restock feature to display wholesaler names

CREATE POLICY "retailer_read_connected_wholesalers" ON entities
  FOR SELECT USING (
    auth_role() = 'RETAILER' AND id IN (
      SELECT wholesaler_id FROM retailer_wholesalers
      WHERE retailer_id = auth_entity_id() AND active = TRUE
    )
  );
