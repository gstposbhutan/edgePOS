-- 128 — property templates gain a SUBCATEGORY level, keyed to the HSN category/subcategory tree.
-- Part of the category consolidation (docs/pelbu/CATEGORY-CONSOLIDATION.md): the HSN-derived
-- category + subcategory on products is the single taxonomy. subcategory '' = category-level
-- (applies to every subcategory unless a more specific (category, subcategory) row exists).
-- Existing 7 rows become category-level (subcategory ''). Idempotent.

ALTER TABLE pos.category_property_templates
  ADD COLUMN IF NOT EXISTS subcategory text NOT NULL DEFAULT '';

-- Re-key uniqueness (category) → (category, subcategory).
ALTER TABLE pos.category_property_templates
  DROP CONSTRAINT IF EXISTS category_property_templates_category_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_property_templates_cat_subcat_key') THEN
    ALTER TABLE pos.category_property_templates
      ADD CONSTRAINT category_property_templates_cat_subcat_key UNIQUE (category, subcategory);
  END IF;
END $$;

-- The live category→subcategory tree, distinct off the products admins actually have (the JS
-- client would otherwise cap at 1000 rows). subcategory '' where a product has none.
CREATE OR REPLACE FUNCTION pos.category_tree()
  RETURNS TABLE(category text, subcategory text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pos', 'public'
AS $$
  SELECT DISTINCT p.category, COALESCE(NULLIF(btrim(p.subcategory), ''), '') AS subcategory
  FROM products p
  WHERE p.category IS NOT NULL AND btrim(p.category) <> ''
  ORDER BY 1, 2;
$$;
