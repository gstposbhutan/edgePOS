-- Migration 024: Marketplace Page (F-MARKET-001)
-- Adds marketplace visibility toggle on products and store branding columns on entities.

-- ─── PRODUCTS: visible_on_web ──────────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS visible_on_web BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_marketplace
ON products (entity_id, visible_on_web, current_stock)
WHERE visible_on_web = TRUE AND current_stock > 0;

-- ─── ENTITIES: marketplace columns ─────────────────────────────────────────

ALTER TABLE entities ADD COLUMN IF NOT EXISTS shop_slug TEXT UNIQUE;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS marketplace_bio TEXT;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS marketplace_logo_url TEXT;

-- Partial unique index so NULL slugs don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_shop_slug
ON entities (shop_slug)
WHERE shop_slug IS NOT NULL;
