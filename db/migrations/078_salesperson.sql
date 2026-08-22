-- 078: Salesperson attribution on orders (Phase 4 — Sales Person / F8 flow).
-- Nullable: existing orders are unaffected; a sale without a chosen salesperson
-- keeps NULL (falls back to created_by for "who rang it"). ON DELETE SET NULL so
-- removing a team member doesn't orphan historical orders.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.salesperson_id IS 'Team member credited with the sale (F8 picker); NULL → unattributed (falls back to created_by).';
