// Execute NEXUS BHUTAN Database Schema via Supabase REST API
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://uoermqevxkuxbazbzxkc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZXJtcWV2eGt1eGJhemJ6eGtjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTQ5Mzc0NywiZXhwIjoyMDkxMDY5NzQ3fQ.nEuWjLBi-xVYVHYwN28Rqtp0hDQTX7TCBy8xtnNnAN0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// SQL Schema to execute
const schemaSQL = `
-- NEXUS BHUTAN - GST 2026 Compliant Database Schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Multi-tenant Foundation: Every participant in the supply chain
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

-- Central Brain Vector Library: Shared repository for product identification
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

-- Accounting Ledger: Tamper-proof record of every sale
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

-- Compliance + fraud detection tracking
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

-- Stock flow tracking for reconciliation
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS entities_tpn_idx ON entities(tpn_gstin);
CREATE INDEX IF NOT EXISTS entities_parent_idx ON entities(parent_entity_id);

CREATE INDEX IF NOT EXISTS products_hsn_idx ON products(hsn_code);
CREATE INDEX IF NOT EXISTS products_stock_idx ON products(current_stock);

CREATE INDEX IF NOT EXISTS transactions_inv_idx ON transactions(inv_no);
CREATE INDEX IF NOT EXISTS transactions_seller_idx ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS transactions_created_idx ON transactions(created_at);

CREATE INDEX IF NOT EXISTS audit_logs_table_idx ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS audit_logs_record_idx ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS inventory_movements_entity_idx ON inventory_movements(entity_id);
CREATE INDEX IF NOT EXISTS inventory_movements_type_idx ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS inventory_movements_timestamp_idx ON inventory_movements(timestamp);

-- Insert sample data for testing
INSERT INTO entities (name, role, tpn_gstin, whatsapp_no, credit_limit) VALUES
('NEXUS BHUTAN HQ', 'DISTRIBUTOR', '12345678901', '+97517777777', 1000000),
('THIMPHU WHOLESALER', 'WHOLESALER', '12345678902', '+97517888888', 500000),
('PARO RETAILER', 'RETAILER', '12345678903', '+97517999999', 100000)
ON CONFLICT (tpn_gstin) DO NOTHING;

INSERT INTO products (name, hsn_code, current_stock, wholesale_price, mrp) VALUES
('Coca Cola 500ml', '22011010', 1000, 25.00, 30.00),
('Bhutan Tea Premium', '09021010', 500, 150.00, 180.00),
('Rice Basmati 1kg', '10063010', 750, 80.00, 95.00)
ON CONFLICT DO NOTHING;
`;

async function executeSchema() {
  console.log('🔨 Executing NEXUS BHUTAN database schema...\n');

  try {
    // Execute the SQL using RPC (Remote Procedure Call)
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: schemaSQL
    });

    if (error) {
      console.error('❌ Schema execution error:', error.message);

      // Try alternative approach - execute SQL statements individually
      console.log('\n🔄 Trying alternative approach...');
      await executeSchemaManually();
    } else {
      console.log('✅ Schema executed successfully!');
      console.log('Data:', data);
    }

    // Verify tables were created
    await verifySchema();

  } catch (err) {
    console.error('❌ Exception:', err.message);
    console.log('\n💡 Alternative: Execute schema manually in Supabase SQL Editor');
    console.log('1. Go to: https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new');
    console.log('2. Copy the schema from supabase/schema.sql');
    console.log('3. Execute it in the SQL editor');
  }
}

async function executeSchemaManually() {
  console.log('📋 Executing schema step by step...');

  const statements = [
    'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    'CREATE TABLE IF NOT EXISTS entities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL, tpn_gstin VARCHAR(50) NOT NULL UNIQUE, whatsapp_no VARCHAR(20) NOT NULL, credit_limit DECIMAL(10, 2) DEFAULT 0, parent_entity_id UUID REFERENCES entities(id), created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) NOT NULL, hsn_code VARCHAR(50) NOT NULL, image_embedding TEXT, current_stock INTEGER DEFAULT 0, wholesale_price DECIMAL(10, 2) DEFAULT 0, mrp DECIMAL(10, 2) DEFAULT 0, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS transactions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), inv_no VARCHAR(100) NOT NULL UNIQUE, journal_no BIGINT NOT NULL, seller_id UUID NOT NULL REFERENCES entities(id), buyer_hash TEXT, items JSONB NOT NULL, subtotal DECIMAL(10, 2) DEFAULT 0, gst_total DECIMAL(10, 2) DEFAULT 0, grand_total DECIMAL(10, 2) DEFAULT 0, payment_method VARCHAR(20) NOT NULL, ocr_verify_id VARCHAR(100), whatsapp_status VARCHAR(20) DEFAULT \'PENDING\', created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), table_name VARCHAR(100) NOT NULL, record_id UUID NOT NULL, operation VARCHAR(20) NOT NULL, old_values JSONB, new_values JSONB, actor_id UUID REFERENCES entities(id), timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS inventory_movements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES products(id), entity_id UUID NOT NULL REFERENCES entities(id), movement_type VARCHAR(20) NOT NULL, quantity INTEGER NOT NULL, reference_id UUID, timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(), notes TEXT)'
  ];

  for (let i = 0; i < statements.length; i++) {
    console.log(`Executing statement ${i + 1}/${statements.length}...`);

    try {
      // Use a raw SQL query via the REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: statements[i] })
      });

      if (!response.ok) {
        console.log(`ℹ️ Statement ${i + 1}: ${response.status} ${response.statusText}`);
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.log(`⚠️ Statement ${i + 1} failed:`, err.message);
    }
  }
}

async function verifySchema() {
  console.log('\n🔍 Verifying schema creation...');

  try {
    // Try to query the entities table
    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('*')
      .limit(3);

    if (entitiesError) {
      console.log('⚠️ Entities table:', entitiesError.message);
    } else {
      console.log('✅ Entities table created with', entities.length, 'rows');
      entities.forEach(entity => {
        console.log(`   - ${entity.name} (${entity.role})`);
      });
    }

    // Try to query the products table
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .limit(3);

    if (productsError) {
      console.log('⚠️ Products table:', productsError.message);
    } else {
      console.log('✅ Products table created with', products.length, 'rows');
      products.forEach(product => {
        console.log(`   - ${product.name} (₹${product.mrp})`);
      });
    }

    console.log('\n🎉 Database schema verification completed!');

  } catch (err) {
    console.error('❌ Verification error:', err.message);
  }
}

// Run the schema execution
executeSchema().then(() => {
  console.log('\n📋 Next steps:');
  console.log('1. If tables were created: Run node update-prisma-client.js');
  console.log('2. If creation failed: Execute schema manually in Supabase SQL Editor');
  console.log('3. Continue with POS terminal development');
}).catch(console.error);