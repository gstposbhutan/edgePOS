// Create NEXUS BHUTAN database schema via Supabase REST API
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uoermqevxkuxbazbzxkc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ5Mzc0NywiZXhwIjoyMDkxMDY5NzQ3fQ.nEuWjLBi-xVYVHYwN28Rqtp0hDQTX7TCBy8xtnNnAN0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createSchema() {
  console.log('🔨 Creating NEXUS BHUTAN database schema...\n');

  // Create entities table
  console.log('--- Creating entities table ---');
  const { data: entitiesData, error: entitiesError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        tpn_gstin VARCHAR(50) NOT NULL UNIQUE,
        whatsapp_no VARCHAR(20) NOT NULL,
        credit_limit DECIMAL(10, 2) DEFAULT 0,
        parent_entity_id UUID REFERENCES entities(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS entities_tpn_idx ON entities(tpn_gstin);
      CREATE INDEX IF NOT EXISTS entities_parent_idx ON entities(parent_entity_id);
    `
  });

  if (entitiesError) {
    console.error('❌ Entities table error:', entitiesError.message);
  } else {
    console.log('✅ Entities table created successfully');
  }

  // Create products table
  console.log('\n--- Creating products table ---');
  const { data: productsData, error: productsError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        hsn_code VARCHAR(50) NOT NULL,
        image_embedding TEXT,
        current_stock INTEGER DEFAULT 0,
        wholesale_price DECIMAL(10, 2) DEFAULT 0,
        mrp DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS products_hsn_idx ON products(hsn_code);
      CREATE INDEX IF NOT EXISTS products_stock_idx ON products(current_stock);
    `
  });

  if (productsError) {
    console.error('❌ Products table error:', productsError.message);
  } else {
    console.log('✅ Products table created successfully');
  }

  // Create transactions table
  console.log('\n--- Creating transactions table ---');
  const { data: transactionsData, error: transactionsError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS transactions (
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
      );

      CREATE INDEX IF NOT EXISTS transactions_inv_idx ON transactions(inv_no);
      CREATE INDEX IF NOT EXISTS transactions_seller_idx ON transactions(seller_id);
      CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions(created_at);
    `
  });

  if (transactionsError) {
    console.error('❌ Transactions table error:', transactionsError.message);
  } else {
    console.log('✅ Transactions table created successfully');
  }

  // Create audit_logs table
  console.log('\n--- Creating audit_logs table ---');
  const { data: auditData, error: auditError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        table_name VARCHAR(100) NOT NULL,
        record_id UUID NOT NULL,
        operation VARCHAR(20) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        actor_id UUID REFERENCES entities(id),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS audit_logs_table_idx ON audit_logs(table_name);
      CREATE INDEX IF NOT EXISTS audit_logs_record_idx ON audit_logs(record_id);
      CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);
    `
  });

  if (auditError) {
    console.error('❌ Audit logs table error:', auditError.message);
  } else {
    console.log('✅ Audit logs table created successfully');
  }

  // Create inventory_movements table
  console.log('\n--- Creating inventory_movements table ---');
  const { data: inventoryData, error: inventoryError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id),
        entity_id UUID NOT NULL REFERENCES entities(id),
        movement_type VARCHAR(20) NOT NULL,
        quantity INTEGER NOT NULL,
        reference_id UUID,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        notes TEXT
      );

      CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id);
      CREATE INDEX IF NOT EXISTS inventory_movements_entity_idx ON inventory_movements(entity_id);
      CREATE INDEX IF NOT EXISTS inventory_movements_type_idx ON inventory_movements(movement_type);
      CREATE INDEX IF NOT EXISTS inventory_movements_timestamp_idx ON inventory_movements(timestamp);
    `
  });

  if (inventoryError) {
    console.error('❌ Inventory movements table error:', inventoryError.message);
  } else {
    console.log('✅ Inventory movements table created successfully');
  }

  // Verify tables were created
  console.log('\n--- Verifying schema ---');
  const { data: tables, error: verifyError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', ['entities', 'products', 'transactions', 'audit_logs', 'inventory_movements']);

  if (verifyError) {
    console.error('❌ Verification error:', verifyError.message);
  } else {
    console.log('✅ Successfully created tables:', tables.map(t => t.table_name));
  }

  console.log('\n🎉 Database schema creation completed!');
  console.log('📋 You can now use Prisma with the generated schema');
}

createSchema().catch(console.error);