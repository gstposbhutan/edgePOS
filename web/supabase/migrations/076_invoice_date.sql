-- Phase 2 (Pelbu UI): dedicated invoice/sale date for GST reporting.
-- Defaults to now(); an OWNER/ADMIN may back/forward-date an order at creation
-- (enforced server-side in /api/pos/orders). Previously the invoice date was
-- conflated with the row's created_at.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_date TIMESTAMPTZ DEFAULT now();

-- Backfill existing rows so reports keyed on invoice_date see all history.
UPDATE orders SET invoice_date = created_at WHERE invoice_date IS NULL;

COMMENT ON COLUMN orders.invoice_date IS
  'Invoice/sale date (GST). Defaults to now(); admin override allowed (OWNER/ADMIN only).';

CREATE INDEX IF NOT EXISTS orders_invoice_date_idx ON orders (seller_id, invoice_date);
