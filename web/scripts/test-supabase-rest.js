// Test Supabase connection via REST API
const { createClient } = require('@supabase/supabase-js');

// Use the anon key for testing
const supabaseUrl = 'https://uoermqevxkuxbazbzxkc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTM3NDcsImV4cCI6MjA5MTA2OTc0N30.qwrOTvcfaA_qWFtbS16TAxDzPkcsBSgkjbEGlrzHPBo';

// Use service role key for admin operations
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ5Mzc0NywiZXhwIjoyMDkxMDY5NzQ3fQ.nEuWjLBi-xVYVHYwN28Rqtp0hDQTX7TCBy8xtnNnAN0';

async function testSupabaseConnection() {
  console.log('🔍 Testing Supabase REST API connection...\n');

  // Test with anon key (limited permissions)
  console.log('--- Testing with Anon Key ---');
  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Try to query the database
    const { data, error } = await supabaseAnon
      .from('pg_tables')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Anon Key Error:', error.message);
    } else {
      console.log('✅ SUCCESS! Connected with Anon Key');
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.error('❌ Anon Key Exception:', err.message);
  }

  // Test with service role key (full permissions)
  console.log('\n--- Testing with Service Role Key ---');
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Try to get database info
    const { data, error } = await supabaseService
      .rpc('get_database_info');

    if (error) {
      console.error('❌ Service Role Error:', error.message);
    } else {
      console.log('✅ SUCCESS! Connected with Service Role Key');
      console.log('Database info:', data);
    }
  } catch (err) {
    console.error('❌ Service Role Exception:', err.message);
  }

  // Try a simple query
  console.log('\n--- Testing Simple Query ---');
  try {
    const { data, error } = await supabaseService
      .from('entities')
      .select('*')
      .limit(1);

    if (error) {
      console.log('📝 Table "entities" does not exist yet (expected)');
      console.log('   This means we need to create our schema first!');
    } else {
      console.log('✅ Table "entities" already exists!');
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.error('❌ Query Exception:', err.message);
  }

  console.log('\n📋 Next Steps:');
  console.log('1. If connection works: Use Supabase JS client for database operations');
  console.log('2. If tables don\'t exist: We need to create schema via Supabase dashboard');
  console.log('3. For Prisma: We may need to get correct database password or use alternative approach');
}

testSupabaseConnection().catch(console.error);