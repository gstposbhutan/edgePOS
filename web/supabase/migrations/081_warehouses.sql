-- Warehouses — the buildings / depots a wholesaler stores stock in. This is a records-only
-- model: a warehouse is just a named location (with an address) that a vendor can mark as
-- their primary site and toggle active. Per-warehouse inventory is deliberately out of scope
-- for now — entity-level stock (product_batches) stays the source of truth, so nothing here
-- splits stock by location yet. Cascades clean up if the owning entity is deleted.

CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  name       text NOT NULL,
  address    text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_entity ON public.warehouses (entity_id);
