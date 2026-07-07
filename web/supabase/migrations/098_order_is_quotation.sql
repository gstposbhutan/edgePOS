-- Sell-side folds into the POS: a saved draft is either a Sales Order (committed,
-- to fulfil) or a Quotation (a non-binding quote). Both are order_type='SALES_ORDER',
-- status='DRAFT'; this flag distinguishes them. Default false = Sales Order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_quotation boolean NOT NULL DEFAULT false;
