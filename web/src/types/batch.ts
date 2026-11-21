export interface Batch {
  id: string;
  centre_id: string;
  centre_name?: string;
  district_id: string;
  district_name?: string;
  course_name: string;
  status: string;
  round: number;
  version: number;
  candidate_count: number;
  submitted_at: string | null;
  step_due_at: string | null;
  created_at: string;
  candidates?: Candidate[];
  send_back_reason?: string;
  rejection_reason?: string;
}

export interface Candidate {
  id?: string;
  name: string;
  phone: string;
  course: string;
  score: number;
  certificate?: {
    id: string;
    cert_number: number;
    verify_code: string;
    status: string;
    pdf_path?: string | null;
    pdf_sha256?: string | null;
  } | null;
}

export interface ValidationError {
  row: number;
  column: string;
  message: string;
}

export const STATUS_STEPS = [
  { key: 'draft', label: '1. Draft' },
  { key: 'submitted', label: '2. Submitted' },
  { key: 'district_review', label: '3. District Review' },
  { key: 'quality_review', label: '4. Quality QA' },
  { key: 'state_review', label: '5. State Approval' },
  { key: 'issued', label: '6. Issued' },
];

export function getStatusStepIndex(status: string): number {
  switch (status) {
    case 'draft':
      return 0;
    case 'submitted':
      // Awaiting district officers — highlight "2. Submitted"
      return 1;
    case 'district_review':
      // District officers are actively reviewing — highlight "3. District Review"
      return 2;
    case 'quality_review':
      // 2 District officers approved; Quality QA is active
      return 3;
    case 'state_review':
      // District (and Quality if required) approved; State Office review is active
      return 4;
    case 'approved':
    case 'state_approved':
      // State Office approved; issuance in progress — highlight "6. Issued" as pending
      return 5;
    case 'issued':
      // Complete end-to-end issuance — all steps done (index 5 = last step)
      return 5;
    case 'sent_back':
      // Returned to Training Centre for corrections
      return 0;
    case 'rejected':
      // Terminal rejection
      return -1;
    default:
      return 0;
  }
}
