-- 090_featured_shops.sql
-- Platform-curated marketplace: only SUPER_ADMIN-featured shops appear in the public catalog listing.
ALTER TABLE "public"."entities" ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_entities_featured ON "public"."entities" (is_featured) WHERE is_featured;
