-- Migration 007: Orders + Order Lifecycle Tables

CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type           TEXT NOT NULL CHECK (order_type IN ('POS_SALE', 'WHOLESALE', 'MARKETPLACE')),
  order_no             TEXT UNIQUE NOT NULL,
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                         'DRAFT', 'PENDING_PAYMENT', 'PAYMENT_VERIFYING', 'CONFIRMED',
                         'PROCESSING', 'DISPATCHED', 'DELIVERED', 'COMPLETED',
                         'PAYMENT_FAILED', 'CANCELLATION_REQUESTED', 'CANCELLED',
                         'REFUND_REQUESTED', 'REFUND_APPROVED', 'REFUND_REJECTED',
                         'REFUND_PROCESSING', 'REFUNDED',
                         'REPLACEMENT_REQUESTED', 'REPLACEMENT_DISPATCHED', 'REPLACEMENT_DELIVERED'
                       )),
  seller_id            UUID NOT NULL REFERENCES entities(id),
  buyer_id             UUID REFERENCES entities(id),
  buyer_whatsapp       TEXT,
  buyer_hash           TEXT,  -- cast to vector(512) post-insert via trigger once pgvector confirmed
  items                JSONB NOT NULL,
  subtotal             DECIMAL(12,2) NOT NULL,
  gst_total            DECIMAL(12,2) NOT NULL,
  grand_total          DECIMAL(12,2) NOT NULL,
  payment_method       TEXT CHECK (payment_method IN ('MBOB', 'MPAY', 'RTGS', 'CASH', 'CREDIT')),
  payment_ref          TEXT,
  payment_verified_at  TIMESTAMPTZ,
  ocr_verify_id        TEXT,
  retry_count          INT DEFAULT 0,
  max_retries          INT DEFAULT 3,
  whatsapp_status      TEXT DEFAULT 'PENDING' CHECK (whatsapp_status IN ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  digital_signature    TEXT,
  created_by           UUID REFERENCES user_profiles(id),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT
);

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_seller  ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer   ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- Order status log — append-only
CREATE TABLE IF NOT EXISTS order_status_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID REFERENCES user_profiles(id),
  actor_role  TEXT,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_log_order ON order_status_log(order_id);

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_log (order_id, from_status, to_status, metadata)
    VALUES (NEW.id, OLD.status, NEW.status, jsonb_build_object('updated_at', NOW()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_status_log ON orders;
CREATE TRIGGER orders_status_log
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Payment attempts
CREATE TABLE IF NOT EXISTS payment_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id),
  attempt_number   INT NOT NULL,
  payment_method   TEXT NOT NULL,
  gateway          TEXT,
  amount           DECIMAL(12,2) NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED')),
  gateway_ref      TEXT,
  gateway_response JSONB,
  failure_code     TEXT,
  failure_reason   TEXT,
  initiated_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  UNIQUE (order_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order ON payment_attempts(order_id);

-- Refunds
CREATE TABLE IF NOT EXISTS refunds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  refund_type   TEXT NOT NULL CHECK (refund_type IN ('FULL', 'PARTIAL')),
  refund_method TEXT NOT NULL,
  amount        DECIMAL(12,2) NOT NULL,
  gst_reversal  DECIMAL(12,2) NOT NULL,
  reason        TEXT NOT NULL,
  requested_by  UUID NOT NULL REFERENCES user_profiles(id),
  approved_by   UUID REFERENCES user_profiles(id),
  status        TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                  'REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED'
                )),
  gateway_ref   TEXT,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);

-- Replacements
CREATE TABLE IF NOT EXISTS replacements (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id    UUID NOT NULL REFERENCES orders(id),
  replacement_order_id UUID REFERENCES orders(id),
  reason               TEXT NOT NULL,
  requested_by         UUID NOT NULL REFERENCES user_profiles(id),
  approved_by          UUID REFERENCES user_profiles(id),
  status               TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
                         'REQUESTED', 'APPROVED', 'REJECTED', 'DISPATCHED', 'DELIVERED'
                       )),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
