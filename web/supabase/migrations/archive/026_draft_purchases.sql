-- Migration 026: Draft Purchases (Photo-to-Stock, F-PHOTO-001)
-- Tables for storing OCR-parsed wholesale bills and their line items.
-- Also creates the `bill-photos` storage bucket for bill photo uploads.

-- ─── DRAFT PURCHASES ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  status          TEXT NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT', 'REVIEWED', 'CONFIRMED', 'CANCELLED')),
  supplier_name   TEXT,
  bill_date       DATE,
  bill_photo_url  TEXT,
  bill_photo_hash TEXT,
  total_amount    DECIMAL(12,2) DEFAULT 0,
  ocr_raw         JSONB,
  notes           TEXT,
  created_by      UUID REFERENCES user_profiles(id),
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_purchases_entity ON draft_purchases(entity_id, status);
CREATE INDEX idx_draft_purchases_hash   ON draft_purchases(bill_photo_hash) WHERE bill_photo_hash IS NOT NULL;

-- ─── DRAFT PURCHASE ITEMS ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_purchase_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_purchase_id UUID NOT NULL REFERENCES draft_purchases(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  raw_name          TEXT NOT NULL,
  quantity          INT NOT NULL,
  unit              TEXT NOT NULL DEFAULT 'pcs',
  unit_price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
  match_confidence  DECIMAL(3,2),
  match_status      TEXT NOT NULL DEFAULT 'UNMATCHED'
                    CHECK (match_status IN ('MATCHED', 'PARTIAL', 'UNMATCHED')),
  sort_order        INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_draft_purchase_items_draft ON draft_purchase_items(draft_purchase_id);

-- ─── ROW-LEVEL SECURITY ─────────────────────────────────────────────────────

ALTER TABLE draft_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_purchases_entity ON draft_purchases
  FOR ALL USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN user_profiles up ON up.id = auth.uid()
    WHERE up.entity_id = draft_purchases.entity_id
  ));

CREATE POLICY draft_purchase_items_entity ON draft_purchase_items
  FOR ALL USING (draft_purchase_id IN (
    SELECT id FROM draft_purchases WHERE entity_id IN (
      SELECT e.id FROM entities e
      JOIN user_profiles up ON up.id = auth.uid()
      WHERE up.entity_id = draft_purchases.entity_id
    )
  ));

-- ─── STORAGE BUCKET ─────────────────────────────────────────────────────────
-- The `bill-photos` bucket must be created via the Supabase dashboard
-- or via: INSERT INTO storage.buckets (id, name, public) VALUES ('bill-photos', 'bill-photos', false);

CREATE POLICY bill_photos_upload ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bill-photos');

CREATE POLICY bill_photos_read ON storage.objects
  FOR SELECT USING (bucket_id = 'bill-photos');
