-- 20260101000002_add_candidate_score.sql
-- Add score column to candidates table and allow flexible national_id

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS score NUMERIC(5, 2);
ALTER TABLE candidates ALTER COLUMN national_id DROP NOT NULL;

-- Index to fast check if candidate is already certified for a course
CREATE INDEX IF NOT EXISTS idx_candidates_phone_batch ON candidates(phone, batch_id);
