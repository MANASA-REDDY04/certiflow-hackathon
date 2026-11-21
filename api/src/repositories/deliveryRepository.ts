import { db } from '../db/index.js';
import crypto from 'crypto';

export interface DeliveryRecord {
  id: string;
  certificate_id: string;
  channel: 'whatsapp' | 'email' | 'sms';
  recipient: string;
  status: 'queued' | 'sending' | 'delivered' | 'failed';
  idempotency_key: string;
  attempt_count: number;
  last_attempt_at: string;
  delivered_at?: string | null;
  error?: string | null;
  created_at: string;
}

const memDeliveries = new Map<string, DeliveryRecord>();

export class DeliveryRepository {
  /**
   * Record delivery attempt BEFORE calling mock-whatsapp.
   * If a delivery record with this idempotency_key already exists, increments attempt_count.
   */
  static async recordAttemptBeforeSending(params: {
    certificateId: string;
    channel: 'whatsapp' | 'email' | 'sms';
    recipient: string;
    idempotencyKey: string;
  }): Promise<DeliveryRecord> {
    const now = new Date().toISOString();

    try {
      const existing = await db.query(
        'SELECT * FROM deliveries WHERE idempotency_key = $1',
        [params.idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const updateRes = await db.query(
          `UPDATE deliveries 
           SET attempt_count = attempt_count + 1, 
               last_attempt_at = now(),
               status = 'sending'
           WHERE idempotency_key = $1
           RETURNING *`,
          [params.idempotencyKey]
        );
        return updateRes.rows[0];
      }

      const id = crypto.randomUUID();
      const insertRes = await db.query(
        `INSERT INTO deliveries (
          id, certificate_id, channel, recipient, status, idempotency_key, attempt_count, last_attempt_at
        ) VALUES (
          $1, $2, $3, $4, 'sending', $5, 1, now()
        ) RETURNING *`,
        [id, params.certificateId, params.channel, params.recipient, params.idempotencyKey]
      );

      return insertRes.rows[0];
    } catch {
      // In-memory fallback
      let rec = memDeliveries.get(params.idempotencyKey);
      if (rec) {
        rec.attempt_count += 1;
        rec.last_attempt_at = now;
        rec.status = 'sending';
      } else {
        rec = {
          id: crypto.randomUUID(),
          certificate_id: params.certificateId,
          channel: params.channel,
          recipient: params.recipient,
          status: 'sending',
          idempotency_key: params.idempotencyKey,
          attempt_count: 1,
          last_attempt_at: now,
          created_at: now,
        };
      }
      memDeliveries.set(params.idempotencyKey, rec);
      return rec;
    }
  }

  /**
   * Mark delivery attempt as successfully delivered
   */
  static async markDelivered(idempotencyKey: string): Promise<void> {
    try {
      await db.query(
        `UPDATE deliveries 
         SET status = 'delivered', delivered_at = now(), error = null 
         WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
    } catch {
      const rec = memDeliveries.get(idempotencyKey);
      if (rec) {
        rec.status = 'delivered';
        rec.delivered_at = new Date().toISOString();
        rec.error = null;
        memDeliveries.set(idempotencyKey, rec);
      }
    }
  }

  /**
   * Mark delivery attempt as failed with error details
   */
  static async markFailed(idempotencyKey: string, errorMessage: string): Promise<void> {
    try {
      await db.query(
        `UPDATE deliveries 
         SET status = 'failed', error = $1 
         WHERE idempotency_key = $2`,
        [errorMessage, idempotencyKey]
      );
    } catch {
      const rec = memDeliveries.get(idempotencyKey);
      if (rec) {
        rec.status = 'failed';
        rec.error = errorMessage;
        memDeliveries.set(idempotencyKey, rec);
      }
    }
  }
}
