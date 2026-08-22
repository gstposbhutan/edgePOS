-- Migration 025: WhatsApp Ordering (F-WA-ORDER-001)
-- Adds order source tracking, fuzzy-match support, and consumer accounts for WhatsApp-originated orders.

-- ─── PG_TRGM EXTENSION ─────────────────────────────────────────────────────
-- Required for fuzzy product name matching (similarity >= 0.7).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- ─── ORDERS TABLE ADDITIONS ────────────────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT NOT NULL DEFAULT 'POS'
  CHECK (order_source IN ('POS', 'WHATSAPP', 'MARKETPLACE_WEB'));

ALTER TABLE orders ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

-- Fast rate-limit lookups: count orders per phone per day
CREATE INDEX IF NOT EXISTS idx_orders_buyer_phone_date ON orders (buyer_phone, created_at)
  WHERE order_source = 'WHATSAPP';

-- ─── ORDER ITEMS TABLE ADDITIONS ───────────────────────────────────────────

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS matched BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS raw_request_text TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS match_confidence DECIMAL(3,2);

-- ─── CONSUMER ACCOUNTS ────────────────────────────────────────────────────
-- Minimal customer profile keyed by WhatsApp phone number.

CREATE TABLE IF NOT EXISTS consumer_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_order_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consumer_accounts_phone ON consumer_accounts(phone);

-- ─── FUZZY MATCH RPC ──────────────────────────────────────────────────────
-- Used by the gateway to match customer text against product names.

CREATE OR REPLACE FUNCTION fuzzy_match_product(
  p_name TEXT,
  p_entity_id UUID,
  p_threshold DECIMAL DEFAULT 0.7
)
RETURNS TABLE (id UUID, name TEXT, mrp DECIMAL, score DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.mrp,
    similarity(p.name, p_name) AS score
  FROM products p
  WHERE p.entity_id = p_entity_id
    AND p.is_active = true
    AND similarity(p.name, p_name) >= p_threshold
  ORDER BY score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;
