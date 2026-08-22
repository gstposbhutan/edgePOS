-- Migration 070: Discount type (flat/percentage) + audit trail
-- Adds discount_type and discount_value to cart_items and order_items.
-- discount stores the computed flat amount; discount_value stores the original input.

-- ── cart_items ──────────────────────────────────────────────────────────
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'FLAT'
  CHECK (discount_type IN ('FLAT', 'PERCENTAGE'));
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── order_items ─────────────────────────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT 'FLAT'
  CHECK (discount_type IN ('FLAT', 'PERCENTAGE'));
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(12,2) NOT NULL DEFAULT 0;

-- ── Audit trigger for discount changes on order_items ───────────────────
CREATE OR REPLACE FUNCTION public.audit_order_item_discount()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.discount IS DISTINCT FROM NEW.discount
     OR OLD.discount_type IS DISTINCT FROM NEW.discount_type THEN
    INSERT INTO audit_logs (table_name, record_id, operation, old_values, new_values, actor_id, actor_role)
    VALUES (
      'order_items',
      NEW.id,
      'UPDATE',
      jsonb_build_object(
        'discount', OLD.discount,
        'discount_type', OLD.discount_type,
        'discount_value', OLD.discount_value
      ),
      jsonb_build_object(
        'discount', NEW.discount,
        'discount_type', NEW.discount_type,
        'discount_value', NEW.discount_value
      ),
      auth.uid(),
      (auth.jwt() ->> 'sub_role')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_item_discount_audit ON order_items;
CREATE TRIGGER trg_order_item_discount_audit
  AFTER UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_item_discount();
