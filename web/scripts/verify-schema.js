// Verify NEXUS BHUTAN Database Schema Creation
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uoermqevxkuxbazbzxkc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ5Mzc0NywiZXhwIjoyMDkxMDY5NzQ3fQ.nEuWjLBi-xVYVHYwN28Rqtp0hDQTX7TCBy8xtnNnAN0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifySchema() {
  console.log('🔍 Verifying NEXUS BHUTAN database schema...\n');

  const expectedTables = [
    'entities',
    'products',
    'transactions',
    'audit_logs',
    'inventory_movements'
  ];

  let tablesFound = 0;
  let tablesMissing = 0;

  // Test each expected table
  for (const tableName of expectedTables) {
    console.log(`🔎 Checking ${tableName}...`);

    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ ${tableName}: NOT FOUND (${error.message})`);
        tablesMissing++;
      } else {
        console.log(`✅ ${tableName}: FOUND (data available)`);
        tablesFound++;
      }
    } catch (err) {
      console.log(`❌ ${tableName}: ERROR - ${err.message}`);
      tablesMissing++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`✅ Tables found: ${tablesFound}/${expectedTables.length}`);
  console.log(`❌ Tables missing: ${tablesMissing}/${expectedTables.length}`);

  if (tablesFound === expectedTables.length) {
    console.log('\n🎉 SUCCESS! All tables created successfully!');

    // Show sample data
    console.log('\n📋 Sample data verification:');

    const { data: entities } = await supabase.from('entities').select('*').limit(3);
    if (entities && entities.length > 0) {
      console.log('\n✅ Entities found:');
      entities.forEach(entity => {
        console.log(`   - ${entity.name} (${entity.role})`);
      });
    }

    const { data: products } = await supabase.from('products').select('*').limit(3);
    if (products && products.length > 0) {
      console.log('\n✅ Products found:');
      products.forEach(product => {
        console.log(`   - ${product.name} (₹${product.mrp})`);
      });
    }

    console.log('\n🚀 Next steps:');
    console.log('1. Generate Prisma Client: node update-prisma-client.js');
    console.log('2. Start POS development: cd desktop && npm run dev');
    console.log('3. Test database operations');

  } else {
    console.log('\n⚠️ SCHEMA NOT COMPLETE');
    console.log('\n📋 Action required:');
    console.log('1. Go to: https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new');
    console.log('2. Copy the SQL from supabase/schema.sql');
    console.log('3. Execute it in the SQL editor');
    console.log('4. Run this verification script again');
  }
}

verifySchema().catch(console.error);