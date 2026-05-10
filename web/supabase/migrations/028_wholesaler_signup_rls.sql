-- Migration 028: Wholesaler signup RLS policies
-- Allows entity owners/managers to manage team member profiles,
-- and wholesalers to update their own entity details.

-- Team read: owners and managers can see all profiles in their entity
CREATE POLICY "entity_owners_read_team" ON user_profiles
  FOR SELECT USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() IN ('OWNER', 'MANAGER')
  );

-- Team create: owners can add new team members
CREATE POLICY "entity_owners_manage_team" ON user_profiles
  FOR INSERT WITH CHECK (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Team update: owners can edit team member roles/permissions
CREATE POLICY "entity_owners_update_team" ON user_profiles
  FOR UPDATE USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Team delete: owners can remove team members
CREATE POLICY "entity_owners_delete_team" ON user_profiles
  FOR DELETE USING (
    entity_id = auth_entity_id()
    AND auth_sub_role() = 'OWNER'
  );

-- Wholesaler/distributor can update their own entity
CREATE POLICY "wholesaler_update_own_entity" ON entities
  FOR UPDATE USING (
    id = auth_entity_id()
    AND auth_role() IN ('WHOLESALER', 'DISTRIBUTOR')
  );
