import { db } from '../db/index.js';
import crypto from 'crypto';

export interface ApprovalRecord {
  id: string;
  batch_id: string;
  round: number;
  step: 'district_review' | 'quality_review' | 'state_approval';
  officer_id: string;
  officer_name?: string;
  officer_role?: string;
  status: 'approved' | 'rejected' | 'changes_requested';
  comments?: string | null;
  created_at: string;
}

// In-memory approvals fallback
const memApprovals: ApprovalRecord[] = [];

export class ApprovalRepository {
  /**
   * Insert approval record within transaction.
   * UNIQUE (batch_id, round, step, officer_id) constraint enforces one vote per officer per step in that round.
   */
  static async insertApproval(
    data: {
      batch_id: string;
      round: number;
      step: 'district_review' | 'quality_review' | 'state_approval';
      officer_id: string;
      status: 'approved' | 'rejected' | 'changes_requested';
      comments?: string | null;
    },
    client?: any
  ): Promise<ApprovalRecord> {
    const id = crypto.randomUUID();
    const queryExecutor = client || db;

    try {
      const query = `
        INSERT INTO approvals (id, batch_id, round, step, officer_id, status, comments, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now())
        RETURNING *
      `;
      const result = await queryExecutor.query(query, [
        id,
        data.batch_id,
        data.round,
        data.step,
        data.officer_id,
        data.status,
        data.comments || null,
      ]);
      return result.rows[0];
    } catch (err: any) {
      // Catch unique constraint violation and bubble up as 409 conflict
      if (err.code === '23505' || err.message?.includes('unique_batch_round_step_officer')) {
        const conflictErr: any = new Error(
          `Officer has already submitted a decision for this step in round ${data.round}`
        );
        conflictErr.statusCode = 409;
        throw conflictErr;
      }
      throw err;
    }
  }

  /**
   * Count distinct approved officers for a given batch, round, and step
   */
  static async countApprovedOfficers(
    batchId: string,
    round: number,
    step: string,
    client?: any
  ): Promise<number> {
    const queryExecutor = client || db;
    try {
      const query = `
        SELECT COUNT(DISTINCT officer_id)::int as count 
        FROM approvals 
        WHERE batch_id = $1 AND round = $2 AND step = $3 AND status = 'approved'
      `;
      const result = await queryExecutor.query(query, [batchId, round, step]);
      return result.rows[0].count;
    } catch {
      return memApprovals.filter(
        (a) =>
          a.batch_id === batchId &&
          a.round === round &&
          a.step === step &&
          a.status === 'approved'
      ).length;
    }
  }

  /**
   * Check if a specific officer has already voted in this round and step
   */
  static async hasOfficerVoted(
    batchId: string,
    round: number,
    step: string,
    officerId: string,
    client?: any
  ): Promise<boolean> {
    const queryExecutor = client || db;
    try {
      const query = `
        SELECT 1 FROM approvals 
        WHERE batch_id = $1 AND round = $2 AND step = $3 AND officer_id = $4
      `;
      const result = await queryExecutor.query(query, [batchId, round, step, officerId]);
      return result.rows.length > 0;
    } catch {
      return memApprovals.some(
        (a) =>
          a.batch_id === batchId &&
          a.round === round &&
          a.step === step &&
          a.officer_id === officerId
      );
    }
  }

  /**
   * Find all chronological decisions and approvals for batch timeline
   */
  static async findTimelineByBatchId(batchId: string): Promise<ApprovalRecord[]> {
    try {
      const query = `
        SELECT 
          a.id, 
          a.batch_id, 
          a.round, 
          a.step, 
          a.officer_id, 
          u.name as officer_name, 
          u.role as officer_role,
          a.status, 
          a.comments, 
          a.created_at
        FROM approvals a
        LEFT JOIN users u ON a.officer_id = u.id
        WHERE a.batch_id = $1
        ORDER BY a.created_at ASC
      `;
      const result = await db.query(query, [batchId]);
      return result.rows;
    } catch {
      return memApprovals
        .filter((a) => a.batch_id === batchId)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
  }

  /**
   * In-memory record helper for local offline dev and tests
   */
  static recordMemoryApproval(approval: ApprovalRecord): void {
    const existing = memApprovals.find(
      (a) =>
        a.batch_id === approval.batch_id &&
        a.round === approval.round &&
        a.step === approval.step &&
        a.officer_id === approval.officer_id
    );

    if (existing) {
      const conflictErr: any = new Error(
        `Officer has already submitted a decision for this step in round ${approval.round}`
      );
      conflictErr.statusCode = 409;
      throw conflictErr;
    }

    memApprovals.push(approval);
  }
}
