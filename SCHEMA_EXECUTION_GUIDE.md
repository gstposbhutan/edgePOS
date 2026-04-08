# 🔧 NEXUS BHUTAN - Database Schema Execution Guide

## Step-by-Step Instructions

### 1. Open Supabase SQL Editor
**Go to**: https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new

### 2. Copy the SQL Schema
The complete schema is ready in: `supabase/schema.sql`

Or execute this SQL directly:

```sql
-- NEXUS BHUTAN - GST 2026 Compliant Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Multi-tenant Foundation: Every participant in the supply chain
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- DISTRIBUTOR, WHOLESALER, RETAILER
    tpn_gstin VARCHAR(50) NOT NULL UNIQUE, -- Bhutanese Taxpayer Number
    whatsapp_no VARCHAR(20) NOT NULL, -- E.164 format
    credit_limit DECIMAL(10, 2) DEFAULT 0,
    parent_entity_id UUID REFERENCES entities(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Central Brain Vector Library: Shared repository for product identification
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    hsn_code VARCHAR(50) NOT NULL, -- Required for GST categorization
    image_embedding TEXT, -- Visual SKU matching (stored as JSON array string)
    current_stock INTEGER DEFAULT 0,
    wholesale_price DECIMAL(10, 2) DEFAULT 0,
    mrp DECIMAL(10, 2) DEFAULT 0, -- 2026 regulated maximum retail price
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Accounting Ledger: Tamper-proof record of every sale
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inv_no VARCHAR(100) NOT NULL UNIQUE, -- Formatted as SHOP-YYYY-SERIAL
    journal_no BIGINT NOT NULL, -- Sequential double-entry
    seller_id UUID NOT NULL REFERENCES entities(id),
    buyer_hash TEXT, -- Anonymized Face-ID embedding
    items JSONB NOT NULL, -- Detailed snapshot
    subtotal DECIMAL(10, 2) DEFAULT 0,
    gst_total DECIMAL(10, 2) DEFAULT 0, -- Strict 5% flat calculation
    grand_total DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(20) NOT NULL, -- MBOB, MPAY, RTGS, CASH, CREDIT
    ocr_verify_id VARCHAR(100), -- Gemini's payment verification ID
    whatsapp_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance + fraud detection tracking
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
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
    movement_type VARCHAR(20) NOT NULL, -- SALE, RESTOCK, TRANSFER, LOSS, DAMAGED
    quantity INTEGER NOT NULL,
    reference_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Performance indexes
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

-- Sample test data
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
```

### 3. Execute the SQL
- **Click "Run"** or press **Ctrl+Enter** in the SQL editor
- You should see success messages for each table creation
- Check for any error messages and resolve them

### 4. Verify Schema Creation
After execution, run this verification query:

```sql
-- Check all created tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

You should see:
- audit_logs
- entities
- inventory_movements
- products
- transactions

### 5. Verify Sample Data
```sql
-- Check entities
SELECT * FROM entities;

-- Check products
SELECT * FROM products;
```

## 🎯 What This Creates

✅ **5 Database Tables**
- `entities` - Multi-tenant supply chain participants
- `products` - Product catalog with AI embedding support
- `transactions` - GST 2026 compliant sales ledger
- `audit_logs` - Compliance and fraud detection
- `inventory_movements` - Stock tracking

✅ **15+ Performance Indexes**
- Optimized for common queries
- Support for entity relationships
- Time-based audit trails

✅ **Sample Data**
- 3 entities (Distributor, Wholesaler, Retailer)
- 3 products (Beverages, Tea, Rice)
- Ready for immediate testing

## 🔄 Next Steps After Execution

**1. Generate Prisma Client**
```bash
node update-prisma-client.js
```

**2. Test Database Connection**
```bash
node test-supabase-rest.js
```

**3. Start POS Development**
```bash
cd pos-terminal
npm run dev
```

## 💡 Troubleshooting

**If execution fails:**
1. Check for syntax errors in the SQL
2. Verify you have admin permissions
3. Check Supabase project status
4. Look for conflicting table names

**If tables don't appear:**
1. Refresh the database page
2. Check Table Viewer in Supabase dashboard
3. Verify you're in the correct project (uoermqevxkuxbazbzxkc)

## 📞 Support

- Project: NEXUS BHUTAN (edgePOS)
- Database: PostgreSQL via Supabase
- Schema: GST 2026 Compliant
- Target: Bhutan Retail Ecosystem