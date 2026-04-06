// Execute NEXUS BHUTAN Database Schema using multiple approaches
const { execSync } = require('child_process');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uoermqevxkuxbazbzxkc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ5Mzc0NywiZXhwIjoyMDkxMDY5NzQ3fQ.nEuWjLBi-xVYVHYwN28Rqtp0hDQTX7TCBy8xtnNnAN0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSchemaViaCLI() {
  console.log('🔨 Attempting to execute schema via Supabase CLI...\n');

  try {
    // Try using Supabase CLI to execute the SQL
    console.log('📋 Method 1: Supabase CLI execution');
    const result = execSync('npx supabase db execute --file supabase/schema.sql --project-id uoermqevxkuxbazbzxkc --linked', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 30000
    });

    console.log('✅ CLI execution result:', result);
    return true;

  } catch (cliError) {
    console.log('⚠️ CLI method failed:', cliError.message);

    // Try Method 2: Direct API calls for each table
    console.log('\n📋 Method 2: Creating tables via API calls');
    await createTablesViaAPI();

    // Try Method 3: Use Postgres.js directly
    console.log('\n📋 Method 3: Direct PostgreSQL connection');
    await createTablesViaPostgres();
  }
}

async function createTablesViaAPI() {
  console.log('🔨 Creating tables via Supabase REST API...');

  const tables = [
    {
      name: 'entities',
      sql: `CREATE TABLE IF NOT EXISTS entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        tpn_gstin VARCHAR(50) NOT NULL UNIQUE,
        whatsapp_no VARCHAR(20) NOT NULL,
        credit_limit DECIMAL(10, 2) DEFAULT 0,
        parent_entity_id UUID REFERENCES entities(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'products',
      sql: `CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        hsn_code VARCHAR(50) NOT NULL,
        image_embedding TEXT,
        current_stock INTEGER DEFAULT 0,
        wholesale_price DECIMAL(10, 2) DEFAULT 0,
        mrp DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'transactions',
      sql: `CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        inv_no VARCHAR(100) NOT NULL UNIQUE,
        journal_no BIGINT NOT NULL,
        seller_id UUID NOT NULL REFERENCES entities(id),
        buyer_hash TEXT,
        items JSONB NOT NULL,
        subtotal DECIMAL(10, 2) DEFAULT 0,
        gst_total DECIMAL(10, 2) DEFAULT 0,
        grand_total DECIMAL(10, 2) DEFAULT 0,
        payment_method VARCHAR(20) NOT NULL,
        ocr_verify_id VARCHAR(100),
        whatsapp_status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'audit_logs',
      sql: `CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(100) NOT NULL,
        record_id UUID NOT NULL,
        operation VARCHAR(20) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        actor_id UUID REFERENCES entities(id),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`
    },
    {
      name: 'inventory_movements',
      sql: `CREATE TABLE IF NOT EXISTS inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id),
        entity_id UUID NOT NULL REFERENCES entities(id),
        movement_type VARCHAR(20) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_id UUID,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notes TEXT
      )`
    }
  ];

  for (const table of tables) {
    console.log(`Creating ${table.name}...`);

    try {
      // Use Supabase's RPC to execute raw SQL
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: table.sql
      });

      if (error) {
        console.log(`⚠️ ${table.name}: ${error.message}`);
      } else {
        console.log(`✅ ${table.name}: Created successfully`);
      }
    } catch (err) {
      console.log(`❌ ${table.name}: ${err.message}`);
    }
  }
}

async function createTablesViaPostgres() {
  console.log('🔨 Creating tables via direct PostgreSQL connection...');

  const { Client } = require('pg');
  const client = new Client({
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres',
    password: 'TigeTiger@17649720',
    ssl: {
      rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected!');

    // Read the schema file
    const schemaSQL = fs.readFileSync('supabase/schema.sql', 'utf8');

    console.log('Executing schema...');
    await client.query(schemaSQL);
    console.log('✅ Schema executed successfully!');

    await client.end();

    // Verify the tables were created
    await verifyTables();

  } catch (error) {
    console.log('❌ PostgreSQL connection failed:', error.message);
    console.log('Trying with different credentials...');

    try {
      const client2 = new Client({
        host: 'aws-1-ap-southeast-1.pooler.supabase.com',
        port: 5432,
        database: 'postgres',
        user: 'postgres.uoermqevxkuxbazbzxkc',
        password: 'TigeTiger@17649720',
        ssl: {
          rejectUnauthorized: false
        },
        connectionTimeoutMillis: 10000
      });

      await client2.connect();
      console.log('✅ Connected with alternative credentials!');

      const schemaSQL = fs.readFileSync('supabase/schema.sql', 'utf8');
      await client2.query(schemaSQL);
      console.log('✅ Schema executed successfully!');

      await client2.end();
      await verifyTables();

    } catch (error2) {
      console.log('❌ Alternative connection also failed:', error2.message);
      console.log('\n💡 Manual execution required');
      console.log('Please execute the schema in Supabase SQL Editor:');
      console.log('https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new');
    }
  }
}

async function verifyTables() {
  console.log('\n🔍 Verifying tables were created...');

  const expectedTables = ['entities', 'products', 'transactions', 'audit_logs', 'inventory_movements'];
  let foundCount = 0;

  for (const tableName of expectedTables) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);

      if (error) {
        console.log(`❌ ${tableName}: Not found`);
      } else {
        console.log(`✅ ${tableName}: Found!`);
        foundCount++;
      }
    } catch (err) {
      console.log(`❌ ${tableName}: Error - ${err.message}`);
    }
  }

  console.log(`\n📊 Tables created: ${foundCount}/${expectedTables.length}`);

  if (foundCount === expectedTables.length) {
    console.log('🎉 SUCCESS! Database schema created successfully!');
    console.log('\n🚀 Next steps:');
    console.log('1. node update-prisma-client.js');
    console.log('2. cd pos-terminal && npm run dev');
  }

  return foundCount === expectedTables.length;
}

// Try all methods
executeSchemaViaCLI().catch(console.error);