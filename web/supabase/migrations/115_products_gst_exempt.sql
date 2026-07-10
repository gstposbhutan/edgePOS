-- 115: GST-exempt products (Phase 5).
--
-- Bhutan GST 2026 is a flat 5% on taxable goods, but some products are GST-exempt (0%). Add a boolean
-- flag; a product is either standard-rated (5%) or exempt (0%). Additive + defaulted false, so every
-- existing product stays taxable and no current behaviour changes until a product is flagged and the
-- sales engines honour it. Reporting distinguishes taxable vs exempt turnover.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS gst_exempt boolean NOT NULL DEFAULT false;

-- Persist the exemption on the line too, so historical GST reports stay stable if a product's flag
-- later changes, and so SO→SI conversion (which rebuilds GST from unit_price) doesn't re-tax an
-- exempt line. Defaulted false; the sales engines set it from the product at sale time.
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS gst_exempt boolean NOT NULL DEFAULT false;
