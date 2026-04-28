-- Migration 042: Add service role bypass policy for user_profiles
-- Allows service role client to read/write user_profiles for authentication flows

-- Drop existing policies
DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;

-- Create new policies that also allow service role
CREATE POLICY "users_read_own_profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id OR auth.jwt()->>'role' = 'service_role');

CREATE POLICY "service_role_all_user_profiles" ON user_profiles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "users_update_own_profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "service_role_insert_user_profiles" ON user_profiles
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');
