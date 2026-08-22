-- 111: per-warehouse inventory foundation (distributor/wholesaler parity, Phase 2 / F5).
--
-- Adds a per-(product, warehouse) on-hand dimension WITHOUT disturbing products.current_stock, which
-- ~35 read sites treat as the entity-wide total. Design:
--   • products.current_stock stays the entity total (sum across all the entity's warehouses) — every
--     existing read keeps working. apply_inventory_movement still bumps it on every movement.
--   • NEW warehouse_stock(product_id, warehouse_id, entity_id, quantity) holds per-location on-hand.
--   • inventory_movements + product_batches get a nullable warehouse_id. A movement with a
--     warehouse_id ALSO upserts warehouse_stock; a movement without one (retailer / legacy) only
--     touches current_stock, exactly as today.
-- So this is purely additive: nothing sets warehouse_id yet, so warehouse_stock stays empty and all
-- existing behaviour is unchanged until the new tier flows (console inventory, PO/PI, B2B) start
-- stamping a warehouse.

-- Location columns (nullable — retailer/single-shop flows leave them NULL).
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.product_batches    ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse ON public.inventory_movements (warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_batches_warehouse ON public.product_batches (warehouse_id) WHERE warehouse_id IS NOT NULL;

-- Per-(product, warehouse) on-hand. Maintained by apply_inventory_movement, mirroring how
-- products.current_stock is kept. quantity is signed-sum of movements in that warehouse.
CREATE TABLE IF NOT EXISTS public.warehouse_stock (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  entity_id    uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  quantity     integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_stock_product_warehouse_key UNIQUE (product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON public.warehouse_stock (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_entity ON public.warehouse_stock (entity_id);
ALTER TABLE public.warehouse_stock OWNER TO postgres;
DO $$ BEGIN
  EXECUTE 'GRANT ALL ON TABLE public.warehouse_stock TO anon, authenticated, service_role';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Extend the stock-apply trigger: keep the entity total, and additionally maintain per-warehouse
-- on-hand when the movement is located. (Was: just UPDATE products.current_stock.)
CREATE OR REPLACE FUNCTION "public"."apply_inventory_movement"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Entity-wide total (unchanged — the scalar ~35 sites read).
  UPDATE products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;

  -- Per-warehouse on-hand (only for located movements — tiers). Sums back to current_stock.
  IF NEW.warehouse_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (product_id, warehouse_id, entity_id, quantity, updated_at)
    VALUES (NEW.product_id, NEW.warehouse_id, NEW.entity_id, NEW.quantity, now())
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET quantity = warehouse_stock.quantity + EXCLUDED.quantity, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;
