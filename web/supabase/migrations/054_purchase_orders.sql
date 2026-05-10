-- Migration 054: Purchase Orders & Purchase Invoices
-- Extends the orders table to support vendor procurement workflow:
-- PURCHASE_ORDER (commitment, no stock change) →
-- PURCHASE_INVOICE (confirmed receipt, triggers batch creation + restock)

-- ─── 1. EXTEND ORDER_TYPE ────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN (
    'POS_SALE', 'WHOLESALE', 'MARKETPLACE',
    'PURCHASE_ORDER', 'PURCHASE_INVOICE'
  ));

-- ─── 2. EXTEND STATUS ────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    -- existing statuses
    'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
    'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED',
    'PAYMENT_FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED',
    'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED',
    'REFUND_PROCESSING', 'REFUNDED',
    'REPLACEMENT_REQUESTED', 'REPLACEMENT_DISPATCHED', 'REPLACEMENT_DELIVERED',
    -- purchase-specific statuses
    'SENT',                -- PO sent to supplier
    'PARTIALLY_RECEIVED',  -- some items received
    'PAID'                 -- invoice paid
  ));

-- ─── 3. NEW COLUMNS ON ORDERS ────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name      TEXT,        -- free-text supplier name
  ADD COLUMN IF NOT EXISTS supplier_ref       TEXT,        -- supplier's own PO/invoice ref
  ADD COLUMN IF NOT EXISTS expected_delivery  DATE,        -- expected goods arrival date
  ADD COLUMN IF NOT EXISTS received_at        TIMESTAMPTZ; -- when invoice was confirmed/received

CREATE INDEX IF NOT EXISTS idx_orders_purchase_order_id
  ON orders(purchase_order_id) WHERE purchase_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_purchase_type
  ON orders(order_type, buyer_id)
  WHERE order_type IN ('PURCHASE_ORDER', 'PURCHASE_INVOICE');

-- ─── 4. NEW COLUMNS ON ORDER_ITEMS ───────────────────────────────────────────
-- These capture batch details entered when converting a PO to an Invoice
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_cost        DECIMAL(12,2), -- purchase price paid
  ADD COLUMN IF NOT EXISTS batch_number     TEXT,
  ADD COLUMN IF NOT EXISTS batch_barcode    TEXT,
  ADD COLUMN IF NOT EXISTS expires_at       DATE,
  ADD COLUMN IF NOT EXISTS manufactured_at  DATE;

-- ─── 5. EXTEND KHATA PARTY_TYPE FOR SUPPLIERS ────────────────────────────────
ALTER TABLE khata_accounts
  DROP CONSTRAINT IF EXISTS khata_accounts_party_type_check;
ALTER TABLE khata_accounts
  ADD CONSTRAINT khata_accounts_party_type_check
    CHECK (party_type IN ('CONSUMER', 'RETAILER', 'WHOLESALER', 'SUPPLIER'));

-- ─── 6. RESTOCK TRIGGER ON INVOICE CONFIRMATION ──────────────────────────────
-- Fires when a PURCHASE_INVOICE transitions to CONFIRMED.
-- For each active order_item: creates a product_batch + RESTOCK movement.
-- buyer_id = the retailer/vendor who is receiving the goods.

CREATE OR REPLACE FUNCTION restock_on_invoice_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_item       RECORD;
  v_batch_id   UUID;
  v_batch_no   TEXT;
  v_mrp        DECIMAL(12,2);
  v_sell       DECIMAL(12,2);
BEGIN
  IF NEW.order_type = 'PURCHASE_INVOICE'
     AND NEW.status = 'CONFIRMED'
     AND OLD.status IS DISTINCT FROM 'CONFIRMED'
     AND NEW.buyer_id IS NOT NULL THEN

    FOR v_item IN
      SELECT oi.*
      FROM order_items oi
      WHERE oi.order_id = NEW.id
        AND oi.product_id IS NOT NULL
        AND oi.status = 'ACTIVE'
    LOOP
      -- Build batch number
      v_batch_no := COALESCE(
        NULLIF(TRIM(v_item.batch_number), ''),
        'PI-' || NEW.order_no || '-' || SUBSTRING(v_item.id::TEXT, 1, 8)
      );

      -- Get current product MRP and selling price as fallbacks
      SELECT mrp, COALESCE(selling_price, mrp)
        INTO v_mrp, v_sell
        FROM products WHERE id = v_item.product_id;

      -- Create batch
      INSERT INTO product_batches (
        product_id, entity_id, batch_number, barcode,
        manufactured_at, expires_at,
        quantity, unit_cost, mrp, selling_price, status, notes
      ) VALUES (
        v_item.product_id,
        NEW.buyer_id,
        v_batch_no,
        NULLIF(TRIM(COALESCE(v_item.batch_barcode, '')), ''),
        v_item.manufactured_at,
        v_item.expires_at,
        v_item.quantity,
        COALESCE(v_item.unit_cost, v_item.unit_price),
        v_mrp,
        v_sell,
        'ACTIVE',
        'Created from Purchase Invoice: ' || NEW.order_no
      )
      ON CONFLICT (product_id, entity_id, batch_number) DO NOTHING
      RETURNING id INTO v_batch_id;

      -- If batch was created (not a duplicate), create RESTOCK movement
      IF v_batch_id IS NOT NULL THEN
        INSERT INTO inventory_movements
          (product_id, entity_id, movement_type, quantity, reference_id, batch_id, notes)
        VALUES (
          v_item.product_id,
          NEW.buyer_id,
          'RESTOCK',
          v_item.quantity,
          NEW.id,
          v_batch_id,
          'Auto-restocked from Purchase Invoice: ' || NEW.order_no
        );

        -- Update product wholesale_price if unit_cost provided on the invoice line
        IF v_item.unit_cost IS NOT NULL THEN
          UPDATE products
          SET wholesale_price = v_item.unit_cost, updated_at = NOW()
          WHERE id = v_item.product_id;
        END IF;
      END IF;

    END LOOP;

    -- Stamp the received_at timestamp
    UPDATE orders SET received_at = NOW() WHERE id = NEW.id;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS orders_restock_on_invoice_confirm ON orders;
CREATE TRIGGER orders_restock_on_invoice_confirm
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION restock_on_invoice_confirm();
