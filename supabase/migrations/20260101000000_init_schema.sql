-- 20260101000000_init_schema.sql
-- CertiFlow Database Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Districts
CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Centres (Training Centres)
CREATE TABLE IF NOT EXISTS centres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    district_id UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Users (Switchable seeded users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('training_centre', 'district_officer', 'quality_team', 'state_office')),
    district_id UUID REFERENCES districts(id) ON DELETE SET NULL,
    centre_id UUID REFERENCES centres(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Batches
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    centre_id UUID NOT NULL REFERENCES centres(id) ON DELETE RESTRICT,
    district_id UUID NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
    course_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'submitted', 'district_approved', 'district_rejected',
        'quality_approved', 'quality_rejected', 'state_approved', 'issued'
    )),
    round INT NOT NULL DEFAULT 1,
    version INT NOT NULL DEFAULT 1,
    submitted_at TIMESTAMPTZ,
    step_due_at TIMESTAMPTZ,
    escalation_level INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Candidates
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    national_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Approvals (UNIQUE batch_id + round + step + officer_id)
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    round INT NOT NULL,
    step TEXT NOT NULL CHECK (step IN ('district_review', 'quality_review', 'state_approval')),
    officer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'changes_requested')),
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_batch_round_step_officer UNIQUE (batch_id, round, step, officer_id)
);

-- 7. Certificate Number Sequence
CREATE SEQUENCE IF NOT EXISTS cert_number_seq START WITH 100001 INCREMENT BY 1;

-- 8. Certificates (UNIQUE candidate+course, unique cert_number from sequence, random verify_code, pdf_sha256, status)
CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
    course_name TEXT NOT NULL,
    cert_number BIGINT NOT NULL DEFAULT nextval('cert_number_seq') UNIQUE,
    verify_code TEXT NOT NULL UNIQUE,
    pdf_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'delivered', 'revoked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_candidate_course UNIQUE (candidate_id, course_name)
);

-- 9. Deliveries
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'sms')),
    recipient TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Audit Log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to block UPDATE and DELETE on audit_log
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_district_id ON batches(district_id);
CREATE INDEX IF NOT EXISTS idx_batches_centre_id ON batches(centre_id);
CREATE INDEX IF NOT EXISTS idx_candidates_batch_id ON candidates(batch_id);
CREATE INDEX IF NOT EXISTS idx_approvals_batch_id ON approvals(batch_id);
CREATE INDEX IF NOT EXISTS idx_certificates_verify_code ON certificates(verify_code);
CREATE INDEX IF NOT EXISTS idx_deliveries_certificate_id ON deliveries(certificate_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_id ON audit_log(record_id);
