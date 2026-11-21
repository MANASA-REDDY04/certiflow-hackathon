-- 20260101000004_approval_workflow_and_outbox.sql
-- Add outbox_events table for transactional event publishing and update batch status checks

CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate ON outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_unprocessed ON outbox_events(created_at) WHERE processed_at IS NULL;

-- Update batch status constraint to accommodate explicit state machine states
-- States: draft, submitted, district_review, quality_review, state_review, approved, state_approved, issued, rejected, sent_back
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_status_check;
ALTER TABLE batches ADD CONSTRAINT batches_status_check CHECK (status IN (
    'draft',
    'submitted',
    'district_review',
    'quality_review',
    'state_review',
    'approved',
    'state_approved',
    'issued',
    'rejected',
    'sent_back'
));

-- Add return reason to batches if sent back
ALTER TABLE batches ADD COLUMN IF NOT EXISTS send_back_reason TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
