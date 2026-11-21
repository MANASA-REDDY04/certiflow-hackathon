import { db } from '../db/index.js';
import { AuditRepository } from './auditRepository.js';
import crypto from 'crypto';

export interface CandidateRecord {
  id: string;
  batch_id: string;
  name: string;
  national_id?: string | null;
  phone: string;
  score: number;
  created_at: string;
}

export interface CandidateInsertItem {
  name: string;
  phone: string;
  score: number;
  national_id?: string;
  course?: string;
}

const memCandidates = new Map<string, CandidateRecord[]>();

// Seed default candidates for pre-seeded batch
memCandidates.set('99999999-9999-9999-9999-999999999999', [
  {
    id: 'cand-001',
    batch_id: '99999999-9999-9999-9999-999999999999',
    name: 'Rahul Sharma',
    phone: '+919876543210',
    score: 85.5,
    created_at: new Date().toISOString(),
  },
  {
    id: 'cand-002',
    batch_id: '99999999-9999-9999-9999-999999999999',
    name: 'Priya Patel',
    phone: '+919876543211',
    score: 92.0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'cand-003',
    batch_id: '99999999-9999-9999-9999-999999999999',
    name: 'Amit Verma',
    phone: '+919876543212',
    score: 78.0,
    created_at: new Date().toISOString(),
  },
  {
    id: 'cand-004',
    batch_id: '99999999-9999-9999-9999-999999999999',
    name: 'Sunita Rao',
    phone: '+919876543213',
    score: 94.5,
    created_at: new Date().toISOString(),
  },
]);

export class CandidateRepository {
  /**
   * Get all candidates for a given batch.
   */
  static async findByBatchId(batchId: string): Promise<CandidateRecord[]> {
    try {
      const query = `
        SELECT id, batch_id, name, national_id, phone, score, created_at 
        FROM candidates 
        WHERE batch_id = $1 
        ORDER BY created_at ASC
      `;
      const result = await db.query(query, [batchId]);
      return result.rows;
    } catch {
      return memCandidates.get(batchId) || [];
    }
  }

  /**
   * Find phone numbers of candidates already certified for a specific course.
   */
  static async findCertifiedPhonesByCourse(courseName: string): Promise<Set<string>> {
    const query = `
      SELECT c.phone 
      FROM certificates cert
      JOIN candidates c ON cert.candidate_id = c.id
      WHERE LOWER(cert.course_name) = LOWER($1) AND cert.status != 'revoked'
    `;
    const result = await db.query(query, [courseName]);
    const set = new Set<string>();
    for (const row of result.rows) {
      if (row.phone) set.add(row.phone.trim());
    }
    return set;
  }

  /**
   * Insert validated candidates in a SINGLE database transaction (all-or-nothing atomicity).
   * Replaces prior candidates in this draft batch if re-uploading, and creates an audit record.
   */
  static async saveBatchCandidatesInTransaction(
    batchId: string,
    candidates: CandidateInsertItem[],
    actor: { id: string; role: string }
  ): Promise<void> {
    let client: any = null;
    try {
      client = await db.connect();
      await client.query('BEGIN');

      // Delete existing candidates if re-uploading to draft batch
      await client.query('DELETE FROM candidates WHERE batch_id = $1', [batchId]);

      // Bulk insert all candidates
      for (const cand of candidates) {
        const query = `
          INSERT INTO candidates (id, batch_id, name, national_id, phone, score)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;
        await client.query(query, [
          crypto.randomUUID(),
          batchId,
          cand.name,
          cand.phone, // national_id defaults to phone
          cand.phone,
          cand.score,
        ]);
      }

      // Record audit log within the same transaction
      await AuditRepository.log(
        {
          table_name: 'candidates',
          record_id: batchId,
          action: 'batch_candidates_uploaded',
          actor_id: actor.id,
          actor_role: actor.role,
          new_data: { candidate_count: candidates.length },
        },
        client
      );

      await client.query('COMMIT');

      // Also sync to in-memory map
      memCandidates.set(
        batchId,
        candidates.map((c) => ({
          id: crypto.randomUUID(),
          batch_id: batchId,
          name: c.name,
          phone: c.phone,
          score: c.score,
          created_at: new Date().toISOString(),
        }))
      );
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
        throw error;
      }
      // Offline fallback: save to memory store
      const items: CandidateRecord[] = candidates.map((c) => ({
        id: crypto.randomUUID(),
        batch_id: batchId,
        name: c.name,
        phone: c.phone,
        score: c.score,
        created_at: new Date().toISOString(),
      }));
      memCandidates.set(batchId, items);
    } finally {
      if (client) {
        client.release();
      }
    }
  }
}
