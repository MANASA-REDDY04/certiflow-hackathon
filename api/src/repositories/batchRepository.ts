import { db } from '../db/index.js';
import { AuditRepository } from './auditRepository.js';
import crypto from 'crypto';

export interface BatchRecord {
  id: string;
  centre_id: string;
  centre_name?: string;
  district_id: string;
  district_name?: string;
  course_name: string;
  status: string;
  round: number;
  version: number;
  submitted_at: string | null;
  step_due_at: string | null;
  escalation_level: number;
  candidate_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ScopeFilter {
  role: string;
  centre_id: string | null;
  district_id: string | null;
}

// In-memory fallback repository store when DB is not currently connected
const memBatches = new Map<string, BatchRecord>();

// Pre-seed default batch for demo
memBatches.set('99999999-9999-9999-9999-999999999999', {
  id: '99999999-9999-9999-9999-999999999999',
  centre_id: '22222222-2222-2222-2222-222222222222',
  centre_name: 'Apex Skills Training Centre',
  district_id: '11111111-1111-1111-1111-111111111111',
  district_name: 'Central District',
  course_name: 'Solar Panel Technician',
  status: 'draft',
  round: 1,
  version: 1,
  submitted_at: null,
  step_due_at: null,
  escalation_level: 0,
  candidate_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

export class BatchRepository {
  /**
   * Find batches scoped by user role:
   * - Training centres see only their own centre's batches
   * - District officers see only their district's batches
   * - Quality team and State office see all batches
   */
  static async findBatchesByScope(scope: ScopeFilter): Promise<BatchRecord[]> {
    try {
      let query = `
        SELECT b.*, c.name as centre_name, d.name as district_name,
               (SELECT COUNT(*)::int FROM candidates WHERE batch_id = b.id) as candidate_count
        FROM batches b
        LEFT JOIN centres c ON b.centre_id = c.id
        LEFT JOIN districts d ON b.district_id = d.id
      `;
      const params: any[] = [];

      if (scope.role === 'training_centre' && scope.centre_id) {
        query += ` WHERE b.centre_id = $1`;
        params.push(scope.centre_id);
      } else if (scope.role === 'district_officer' && scope.district_id) {
        query += ` WHERE b.district_id = $1`;
        params.push(scope.district_id);
      }

      query += ` ORDER BY b.created_at DESC`;

      const result = await db.query(query, params);
      return result.rows;
    } catch {
      // In-memory fallback
      let list = Array.from(memBatches.values());
      if (scope.role === 'training_centre' && scope.centre_id) {
        list = list.filter((b) => b.centre_id === scope.centre_id);
      } else if (scope.role === 'district_officer' && scope.district_id) {
        list = list.filter((b) => b.district_id === scope.district_id);
      }
      return list;
    }
  }

  /**
   * Find single batch by ID
   */
  static async findById(batchId: string): Promise<BatchRecord | null> {
    try {
      const query = `
        SELECT b.*, c.name as centre_name, d.name as district_name,
               (SELECT COUNT(*)::int FROM candidates WHERE batch_id = b.id) as candidate_count
        FROM batches b
        LEFT JOIN centres c ON b.centre_id = c.id
        LEFT JOIN districts d ON b.district_id = d.id
        WHERE b.id = $1
      `;
      const result = await db.query(query, [batchId]);
      return result.rows[0] || null;
    } catch {
      return memBatches.get(batchId) || null;
    }
  }

  /**
   * Create a new draft batch
   */
  static async create(data: {
    centre_id: string;
    district_id: string;
    course_name: string;
  }): Promise<BatchRecord> {
    const id = crypto.randomUUID();

    try {
      const query = `
        INSERT INTO batches (id, centre_id, district_id, course_name, status, round, version)
        VALUES ($1, $2, $3, $4, 'draft', 1, 1)
        RETURNING *
      `;
      const result = await db.query(query, [id, data.centre_id, data.district_id, data.course_name]);
      return result.rows[0];
    } catch {
      const record: BatchRecord = {
        id,
        centre_id: data.centre_id,
        centre_name: 'Apex Skills Training Centre',
        district_id: data.district_id,
        district_name: 'Central District',
        course_name: data.course_name,
        status: 'draft',
        round: 1,
        version: 1,
        submitted_at: null,
        step_due_at: null,
        escalation_level: 0,
        candidate_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      memBatches.set(id, record);
      return record;
    }
  }

  /**
   * Transition batch status from 'draft' to 'submitted'
   */
  static async submit(
    batchId: string,
    actor: { id: string; role: string }
  ): Promise<BatchRecord> {
    try {
      const query = `
        UPDATE batches 
        SET status = 'submitted', 
            submitted_at = now(), 
            step_due_at = now() + interval '3 days',
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `;
      const result = await db.query(query, [batchId]);
      const updated = result.rows[0];

      // Audit log entry
      await AuditRepository.log({
        table_name: 'batches',
        record_id: batchId,
        action: 'batch_submitted',
        actor_id: actor.id,
        actor_role: actor.role,
        old_data: { status: 'draft' },
        new_data: { status: 'submitted' },
      });

      return updated;
    } catch {
      const record = memBatches.get(batchId);
      if (!record) throw new Error('Batch not found');

      record.status = 'submitted';
      record.submitted_at = new Date().toISOString();
      const due = new Date();
      due.setDate(due.getDate() + 3);
      record.step_due_at = due.toISOString();
      record.updated_at = new Date().toISOString();

      memBatches.set(batchId, record);
      return record;
    }
  }

  /**
   * Update candidate count on memory record
   */
  static updateCandidateCount(batchId: string, count: number): void {
    const record = memBatches.get(batchId);
    if (record) {
      record.candidate_count = count;
      memBatches.set(batchId, record);
    }
  }
}
