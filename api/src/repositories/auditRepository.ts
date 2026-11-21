import { db } from '../db/index.js';

export interface AuditLogInput {
  table_name: string;
  record_id?: string | null;
  action: string;
  actor_id?: string | null;
  actor_role: string;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  ip_address?: string | null;
}

export class AuditRepository {
  /**
   * Record an immutable entry in the audit_log table.
   * Note: The audit_log table is protected by a trigger blocking UPDATE and DELETE.
   */
  static async log(entry: AuditLogInput, client?: any): Promise<void> {
    const queryExecutor = client || db;
    const query = `
      INSERT INTO audit_log (
        table_name, record_id, action, actor_id, actor_role, old_data, new_data, ip_address
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;
    const values = [
      entry.table_name,
      entry.record_id || null,
      entry.action,
      entry.actor_id || null,
      entry.actor_role,
      entry.old_data ? JSON.stringify(entry.old_data) : null,
      entry.new_data ? JSON.stringify(entry.new_data) : null,
      entry.ip_address || null,
    ];

    await queryExecutor.query(query, values);
  }
}
