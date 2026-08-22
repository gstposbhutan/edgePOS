-- Favourites — lets a distributor / wholesaler bookmark entities they discover while
-- browsing the network (a distributor saves wholesalers/retailers; a wholesaler saves
-- retailers). Pure bookmark: actor → target, one row per pair (the unique constraint
-- makes a repeated "favourite" a no-op rather than a duplicate). Cascades clean up if
-- either side's entity is deleted.

CREATE TABLE IF NOT EXISTS public.favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_entity_id  uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_entity_id, target_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_favourites_actor ON public.favourites (actor_entity_id);
