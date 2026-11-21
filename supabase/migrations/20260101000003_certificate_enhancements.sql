-- 20260101000003_certificate_enhancements.sql
-- Add PDF storage path, cancellation reasons, and delivery tracking fields

ALTER TABLE certificates ADD COLUMN IF NOT EXISTS pdf_path TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_certificates_cert_number_verify ON certificates(cert_number, verify_code);
CREATE INDEX IF NOT EXISTS idx_deliveries_idempotency_key ON deliveries(idempotency_key);
