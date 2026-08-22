-- 091_product_ai_metadata.sql
-- Richer product listings: a taggable video (YouTube / Instagram / TikTok / any URL) + AI-enriched
-- metadata (brand, tags, specifications) and a flag marking rows enriched by the AI engine.
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "video_url"      text;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "brand"          text;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "tags"           jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "specifications" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "public"."products" ADD COLUMN IF NOT EXISTS "ai_enriched"    boolean NOT NULL DEFAULT false;
