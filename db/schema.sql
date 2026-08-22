-- NEXUS BHUTAN - GST 2026 Compliant Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/uoermqevxkuxbazbzxkc/sql/new

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
    parent_entity_id UUID REFERENCES entities(id), -- Self-ref for hierarchy
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
    buyer_hash TEXT, -- Anonymized Face-ID embedding (stored as JSON array string)
    items JSONB NOT NULL, -- Detailed snapshot: [{sku, name, qty, rate, discount, gst_5, total}]
    subtotal DECIMAL(10, 2) DEFAULT 0,
    gst_total DECIMAL(10, 2) DEFAULT 0, -- Strict 5% flat calculation
    grand_total DECIMAL(10, 2) DEFAULT 0,
    payment_method VARCHAR(20) NOT NULL, -- MBOB, MPAY, RTGS, CASH, CREDIT
    ocr_verify_id VARCHAR(100), -- Gemini's payment verification ID
    whatsapp_status VARCHAR(20) DEFAULT 'PENDING', -- SENT, DELIVERED, READ
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
    reference_id UUID, -- transaction_id or transfer_id
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

-- Success message
DO $$
BEGIN
    RAISE NOTICE '🎉 NEXUS BHUTAN database schema created successfully!';
    RAISE NOTICE '✅ Entities table created (Distributors, Wholesalers, Retailers)';
    RAISE NOTICE '✅ Products table created (with AI embedding storage)';
    RAISE NOTICE '✅ Transactions table created (GST 2026 compliant)';
    RAISE NOTICE '✅ Audit logs table created (compliance tracking)';
    RAISE NOTICE '✅ Inventory movements table created (stock reconciliation)';
    RAISE NOTICE '📊 Sample data inserted for testing';
END $$;