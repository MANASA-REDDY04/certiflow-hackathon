import { db } from '../db/index.js';
import crypto from 'crypto';

export interface OutboxEventInput {
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, any>;
}

export class OutboxRepository {
  /**
   * Record an outbox event in the same transaction as state changes.
   */
  static async recordEvent(event: OutboxEventInput, client?: any): Promise<void> {
    const queryExecutor = client || db;
    const query = `
      INSERT INTO outbox_events (id, event_type, aggregate_type, aggregate_id, payload, created_at)
      VALUES ($1, $2, $3, $4, $5, now())
    `;
    const values = [
      crypto.randomUUID(),
      event.event_type,
      event.aggregate_type,
      event.aggregate_id,
      JSON.stringify(event.payload),
    ];

    await queryExecutor.query(query, values);
  }
}
