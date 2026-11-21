import { db } from '../db/index.js';
import { AuditRepository } from '../repositories/auditRepository.js';
import { OutboxRepository } from '../repositories/outboxRepository.js';
import { BatchRepository, BatchRecord } from '../repositories/batchRepository.js';
import { EventBus } from './eventBus.js';
import { env } from '../config/env.js';
import crypto from 'crypto';

export interface EscalationSummary {
  remindersSent: number;
  stateEscalations: number;
  processedBatches: Array<{
    batchId: string;
    newLevel: number;
    action: 'reminded' | 'escalated_to_state';
  }>;
}

export class EscalationService {
  /**
   * Scan for overdue batches past step_due_at:
   * Level 0 -> Level 1: Remind assigned officers (exactly once per level)
   * Level 1 -> Level 2: Escalate to State Office HQ (exactly once per level)
   * Uses configurable demo limits (shrink 24h/48h to seconds via env).
   */
  static async checkAndProcessEscalations(): Promise<EscalationSummary> {
    const reminderDelaySec = env.ESCALATION_REMINDER_SECONDS; // e.g. 15s in demo
    const stateEscalationDelaySec = env.ESCALATION_STATE_SECONDS; // e.g. 30s in demo

    const summary: EscalationSummary = {
      remindersSent: 0,
      stateEscalations: 0,
      processedBatches: [],
    };

    try {
      // 1. Process Level 0 -> Level 1 (Reminder to assigned officers)
      const level0Res = await db.query(
        `SELECT b.*, c.name as centre_name, d.name as district_name 
         FROM batches b
         LEFT JOIN centres c ON b.centre_id = c.id
         LEFT JOIN districts d ON b.district_id = d.id
         WHERE b.status NOT IN ('draft', 'approved', 'state_approved', 'issued', 'rejected', 'sent_back')
           AND b.step_due_at IS NOT NULL
           AND b.step_due_at <= now()
           AND b.escalation_level = 0
         FOR UPDATE SKIP LOCKED`
      );

      for (const batch of level0Res.rows) {
        await db.query(
          `UPDATE batches SET escalation_level = 1, updated_at = now() WHERE id = $1`,
          [batch.id]
        );

        // Immutable audit log
        await AuditRepository.log({
          table_name: 'batches',
          record_id: batch.id,
          action: 'sla_reminder_sent',
          actor_role: 'system_sla_monitor',
          old_data: { escalation_level: 0 },
          new_data: {
            escalation_level: 1,
            step: batch.status,
            overdue_step_due_at: batch.step_due_at,
          },
        });

        // Outbox event
        await OutboxRepository.recordEvent({
          event_type: 'BatchSlaReminderSent',
          aggregate_type: 'Batch',
          aggregate_id: batch.id,
          payload: {
            batchId: batch.id,
            step: batch.status,
            districtId: batch.district_id,
            escalationLevel: 1,
          },
        });

        // Real-time EventBus notification to district officers
        await EventBus.publish({
          id: crypto.randomUUID(),
          type: 'sla_reminder',
          title: 'Review Overdue Reminder',
          message: `Batch "${batch.course_name}" is past due date for ${batch.status.replace('_', ' ')}. Please complete review.`,
          batchId: batch.id,
          districtId: batch.district_id,
          timestamp: new Date().toISOString(),
        });

        summary.remindersSent++;
        summary.processedBatches.push({
          batchId: batch.id,
          newLevel: 1,
          action: 'reminded',
        });
      }

      // 2. Process Level 1 -> Level 2 (Escalation to State Office)
      const level1Res = await db.query(
        `SELECT b.*, c.name as centre_name, d.name as district_name 
         FROM batches b
         LEFT JOIN centres c ON b.centre_id = c.id
         LEFT JOIN districts d ON b.district_id = d.id
         WHERE b.status NOT IN ('draft', 'approved', 'state_approved', 'issued', 'rejected', 'sent_back')
           AND b.step_due_at IS NOT NULL
           AND b.step_due_at <= (now() - interval '1 second' * $1)
           AND b.escalation_level = 1
         FOR UPDATE SKIP LOCKED`,
        [stateEscalationDelaySec]
      );

      for (const batch of level1Res.rows) {
        await db.query(
          `UPDATE batches SET escalation_level = 2, updated_at = now() WHERE id = $1`,
          [batch.id]
        );

        await AuditRepository.log({
          table_name: 'batches',
          record_id: batch.id,
          action: 'sla_escalated_to_state_office',
          actor_role: 'system_sla_monitor',
          old_data: { escalation_level: 1 },
          new_data: {
            escalation_level: 2,
            step: batch.status,
            district: batch.district_name,
          },
        });

        await OutboxRepository.recordEvent({
          event_type: 'BatchEscalatedToStateOffice',
          aggregate_type: 'Batch',
          aggregate_id: batch.id,
          payload: {
            batchId: batch.id,
            step: batch.status,
            districtName: batch.district_name,
            escalationLevel: 2,
          },
        });

        // Real-time notification to State Office
        await EventBus.publish({
          id: crypto.randomUUID(),
          type: 'state_escalation',
          title: '🚨 CRITICAL: Batch Escalated to State HQ',
          message: `Batch "${batch.course_name}" in ${batch.district_name} is severely overdue at ${batch.status.replace('_', ' ')}. Escalated to State Office.`,
          batchId: batch.id,
          targetRole: 'state_office',
          timestamp: new Date().toISOString(),
        });

        summary.stateEscalations++;
        summary.processedBatches.push({
          batchId: batch.id,
          newLevel: 2,
          action: 'escalated_to_state',
        });
      }
    } catch {
      // In-memory fallback for local offline dev and tests
      return this.checkMemoryEscalations(reminderDelaySec, stateEscalationDelaySec);
    }

    return summary;
  }

  /**
   * In-memory escalation processor for local dev / tests
   */
  private static async checkMemoryEscalations(
    _reminderDelaySec: number,
    _stateEscalationDelaySec: number
  ): Promise<EscalationSummary> {
    const summary: EscalationSummary = {
      remindersSent: 0,
      stateEscalations: 0,
      processedBatches: [],
    };

    const batches = await BatchRepository.findBatchesByScope({
      role: 'state_office',
      centre_id: null,
      district_id: null,
    });

    const now = Date.now();

    for (const batch of batches) {
      if (['draft', 'approved', 'state_approved', 'issued', 'rejected', 'sent_back'].includes(batch.status)) {
        continue;
      }

      const dueTime = batch.step_due_at ? new Date(batch.step_due_at).getTime() : now - 1000;

      if (now >= dueTime && batch.escalation_level === 0) {
        batch.escalation_level = 1;
        summary.remindersSent++;
        summary.processedBatches.push({
          batchId: batch.id,
          newLevel: 1,
          action: 'reminded',
        });
      } else if (now >= dueTime + 1000 && batch.escalation_level === 1) {
        batch.escalation_level = 2;
        summary.stateEscalations++;
        summary.processedBatches.push({
          batchId: batch.id,
          newLevel: 2,
          action: 'escalated_to_state',
        });
      }
    }

    return summary;
  }

  /**
   * Get Stuck Batches for the State Office Dashboard
   */
  static async getStuckBatches(): Promise<any[]> {
    try {
      const query = `
        SELECT 
          b.*, 
          c.name as centre_name, 
          d.name as district_name,
          EXTRACT(EPOCH FROM (now() - b.step_due_at))::int as seconds_overdue,
          (SELECT COUNT(*)::int FROM candidates WHERE batch_id = b.id) as candidate_count
        FROM batches b
        LEFT JOIN centres c ON b.centre_id = c.id
        LEFT JOIN districts d ON b.district_id = d.id
        WHERE b.status NOT IN ('draft', 'approved', 'state_approved', 'issued', 'rejected', 'sent_back')
          AND (b.escalation_level > 0 OR (b.step_due_at IS NOT NULL AND b.step_due_at <= now()))
        ORDER BY b.escalation_level DESC, b.step_due_at ASC
      `;
      const result = await db.query(query);
      return result.rows;
    } catch {
      // Memory fallback
      const all = await BatchRepository.findBatchesByScope({
        role: 'state_office',
        centre_id: null,
        district_id: null,
      });

      return all.filter((b) => b.escalation_level > 0 || b.status === 'district_review');
    }
  }
}
