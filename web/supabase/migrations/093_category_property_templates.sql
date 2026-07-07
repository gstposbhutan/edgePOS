-- 093_category_property_templates.sql
-- Platform-admin-managed custom-property templates per (HSN-derived) category. Each template lists
-- the properties a product in that category should carry (key/label/type[/options]); the product form
-- renders these as fields (saved into products.specifications) and the AI enrichment targets them.
CREATE TABLE IF NOT EXISTS "public"."category_property_templates" (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category   text UNIQUE NOT NULL,
  properties jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ "key","label","type":"text|number|select","options":[] }]
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."category_property_templates" ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read the templates (the product form needs them). Writes go through the
-- admin API on a service client, so no write policy is granted here.
DROP POLICY IF EXISTS cpt_read ON "public"."category_property_templates";
CREATE POLICY cpt_read ON "public"."category_property_templates" FOR SELECT TO authenticated USING (true);

-- Seed sensible defaults for the categories already in use.
INSERT INTO "public"."category_property_templates" (category, properties) VALUES
 ('Furniture',   '[{"key":"material","label":"Material","type":"text"},{"key":"dimensions","label":"Dimensions","type":"text"},{"key":"colour","label":"Colour","type":"text"},{"key":"weight","label":"Weight","type":"text"}]'::jsonb),
 ('Electronics', '[{"key":"screen_size","label":"Screen size","type":"text"},{"key":"power","label":"Power","type":"text"},{"key":"voltage","label":"Voltage","type":"text"},{"key":"warranty","label":"Warranty","type":"text"}]'::jsonb),
 ('Bedding',     '[{"key":"size","label":"Size","type":"text"},{"key":"material","label":"Material","type":"text"},{"key":"colour","label":"Colour","type":"text"}]'::jsonb),
 ('Bathroom',    '[{"key":"material","label":"Material","type":"text"},{"key":"colour","label":"Colour","type":"text"}]'::jsonb),
 ('Textiles',    '[{"key":"fabric","label":"Fabric","type":"text"},{"key":"size","label":"Size","type":"text"},{"key":"colour","label":"Colour","type":"text"}]'::jsonb),
 ('Furnishing',  '[{"key":"fabric","label":"Fabric","type":"text"},{"key":"size","label":"Size","type":"text"},{"key":"colour","label":"Colour","type":"text"}]'::jsonb),
 ('Tableware',   '[{"key":"material","label":"Material","type":"text"},{"key":"capacity","label":"Capacity","type":"text"}]'::jsonb)
ON CONFLICT (category) DO NOTHING;
