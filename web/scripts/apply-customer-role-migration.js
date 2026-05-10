const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyMigration() {
  console.log('Applying CUSTOMER role migration...')

  // Use raw SQL through the client
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .limit(1)

  // Test connection
  if (error) {
    console.error('Database connection failed:', error.message)
    console.log('\nPlease run this SQL manually in your Supabase SQL Editor:')
    console.log(`
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_role_check;
ALTER TABLE entities ADD CONSTRAINT entities_role_check
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_sub_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_sub_role_check
  CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN', 'CUSTOMER'));
    `)
    process.exit(1)
  }

  console.log('Connected to database successfully!')
  console.log('\nPlease run this SQL manually in your Supabase SQL Editor:')
  console.log(`
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_role_check;
ALTER TABLE entities ADD CONSTRAINT entities_role_check
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('SUPER_ADMIN', 'DISTRIBUTOR', 'WHOLESALER', 'RETAILER', 'CUSTOMER'));

ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_sub_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_sub_role_check
  CHECK (sub_role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF', 'ADMIN', 'CUSTOMER'));
  `)
}

applyMigration().catch(console.error)
