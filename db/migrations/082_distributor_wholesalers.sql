-- Distributor ↔ wholesaler links — the supply tier above retailer_wholesalers. A wholesaler
-- restocks from the distributors it is linked to here, exactly the way a retailer restocks from
-- its linked wholesalers. Same shape as retailer_wholesalers: a per-category relationship row
-- (category nullable for now — a single link covers the whole catalog) with a primary flag and
-- an active flag. Cascades clean up if either side's entity is deleted.

CREATE TABLE IF NOT EXISTS public.distributor_wholesalers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distributor_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  wholesaler_id  uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  category_id    uuid REFERENCES public.categories(id),   -- nullable for v1
  is_primary boolean NOT NULL DEFAULT false,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (distributor_id, wholesaler_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_dw_wholesaler ON public.distributor_wholesalers (wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_dw_distributor ON public.distributor_wholesalers (distributor_id);
