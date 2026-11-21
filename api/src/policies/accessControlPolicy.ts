/**
 * CertiFlow Access Control Policy Engine
 * 
 * Implements the central authorization policy function: can(user, action, batch).
 * Evaluates whether an authenticated user (with role, district, and training centre
 * read EXCLUSIVELY from the verified JWT) is permitted to perform a mutating action.
 */

export type UserRole = 'training_centre' | 'district_officer' | 'quality_team' | 'state_office';

export interface PolicyUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  district_id: string | null;
  centre_id: string | null;
}

export type PolicyAction =
  | 'batch:create'
  | 'batch:update'
  | 'batch:submit'
  | 'batch:review_district'
  | 'batch:review_quality'
  | 'batch:approve_state'
  | 'batch:escalate'
  | 'candidate:add'
  | 'candidate:remove'
  | 'certificate:issue'
  | 'certificate:deliver';

export interface BatchContext {
  id: string;
  centre_id: string;
  district_id: string;
  status: string;
  round?: number;
  version?: number;
  submitted_at?: Date | string | null;
  step_due_at?: Date | string | null;
  escalation_level?: number;
}

/**
 * Central policy function can(user, action, batch)
 * Used by every mutating route to enforce authorization boundaries.
 * 
 * Rules:
 * 1. Role, District, and Centre MUST come strictly from the JWT payload, NEVER from request bodies.
 * 2. Training Centres may only create, modify, or submit batches belonging to their assigned centre.
 * 3. District Officers may only review/approve batches within their assigned district.
 * 4. Quality Team may only review batches that have received district approval.
 * 5. State Office performs final approval and certificate issuance.
 */
export function can(user: PolicyUser, action: PolicyAction, batch?: BatchContext | null): boolean {
  if (!user || !user.role) return false;

  switch (action) {
    case 'batch:create':
      // Only training centres can create batches; must have an assigned centre_id
      return user.role === 'training_centre' && !!user.centre_id;

    case 'batch:update':
      // Only training centres can update batches; must be their own centre and in draft
      if (user.role !== 'training_centre') return false;
      if (!batch) return false;
      return batch.centre_id === user.centre_id && batch.status === 'draft';

    case 'batch:submit':
      // Only training centres can submit batches for district review
      if (user.role !== 'training_centre') return false;
      if (!batch) return false;
      return batch.centre_id === user.centre_id && batch.status === 'draft';

    case 'candidate:add':
    case 'candidate:remove':
      // Adding/removing candidates is only permitted during draft status by the centre
      if (user.role !== 'training_centre') return false;
      if (!batch) return false;
      return batch.centre_id === user.centre_id && batch.status === 'draft';

    case 'batch:review_district':
      // District officers can only review batches belonging to their assigned district
      if (user.role !== 'district_officer') return false;
      if (!batch) return false;
      return (
        !!user.district_id &&
        batch.district_id === user.district_id &&
        batch.status === 'submitted'
      );

    case 'batch:review_quality':
      // Quality team reviews district-approved batches across the state
      if (user.role !== 'quality_team') return false;
      if (!batch) return false;
      return batch.status === 'district_approved';

    case 'batch:approve_state':
      // State office performs final approval on quality-reviewed batches
      if (user.role !== 'state_office') return false;
      if (!batch) return false;
      return batch.status === 'quality_approved';

    case 'batch:escalate':
      // District officers, quality team, and state office can trigger escalation
      return (
        user.role === 'district_officer' ||
        user.role === 'quality_team' ||
        user.role === 'state_office'
      );

    case 'certificate:issue':
      // Only State Office can issue official certificates
      if (user.role !== 'state_office') return false;
      if (!batch) return true;
      return batch.status === 'state_approved';

    case 'certificate:deliver':
      // State office and quality team can trigger certificate delivery
      return user.role === 'state_office' || user.role === 'quality_team';

    default:
      return false;
  }
}

// Descriptive aliases
export const canPerformAction = can;
export const checkAccessPolicy = can;
