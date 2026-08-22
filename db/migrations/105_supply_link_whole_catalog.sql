-- 105: whole-catalog supply links (distributor/wholesaler parity, Phase 0 F1).
--
-- Both B2B supply junctions get a category-less "whole-catalog" link (a single link covering the
-- whole catalog), matching distributor_wholesalers' v1 intent. retailer_wholesalers had a composite
-- PK (retailer_id, wholesaler_id, category_id) forcing category NOT NULL; swap it to a surrogate id
-- PK so category_id can be nullable. No FK references the old composite PK (verified), so this is safe.

-- retailer_wholesalers: surrogate id PK + nullable category.
ALTER TABLE public.retailer_wholesalers ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.retailer_wholesalers SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.retailer_wholesalers ALTER COLUMN id SET NOT NULL;
ALTER TABLE public.retailer_wholesalers DROP CONSTRAINT IF EXISTS retailer_wholesalers_pkey;
DO $$ BEGIN
  ALTER TABLE public.retailer_wholesalers ADD CONSTRAINT retailer_wholesalers_pkey PRIMARY KEY (id);
EXCEPTION WHEN invalid_table_definition THEN NULL; END $$;
ALTER TABLE public.retailer_wholesalers ALTER COLUMN category_id DROP NOT NULL;

-- Preserve per-category uniqueness, and enforce a single whole-catalog (category-less) link per pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rw_pair_category
  ON public.retailer_wholesalers (retailer_id, wholesaler_id, category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rw_pair_wholecatalog
  ON public.retailer_wholesalers (retailer_id, wholesaler_id) WHERE category_id IS NULL;

-- distributor_wholesalers already allows nullable category (UNIQUE covers per-category, but its NULLs
-- are distinct); add the same single-whole-catalog-link guard.
CREATE UNIQUE INDEX IF NOT EXISTS idx_dw_pair_wholecatalog
  ON public.distributor_wholesalers (distributor_id, wholesaler_id) WHERE category_id IS NULL;
