-- Migration 043: Add service role bypass policy for entities
-- Allows service role client to create entities for customer signup

CREATE POLICY "service_role_all_entities" ON entities
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "service_role_insert_entities" ON entities
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
