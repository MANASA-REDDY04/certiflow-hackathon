import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server.js';
import { FastifyInstance } from 'fastify';
import { BatchRepository } from '../src/repositories/batchRepository.js';
import { EscalationService } from '../src/services/escalationService.js';

describe('SLA Escalations, Trace and Health Checks', () => {
  let app: FastifyInstance;
  let farahToken: string;
  let devToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Farah: State Office
    farahToken = app.jwt.sign({
      sub: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      name: 'Farah',
      email: 'farah@certiflow.local',
      role: 'state_office',
      district_id: null,
      centre_id: null,
    });

    // Dev: District Officer
    devToken = app.jwt.sign({
      sub: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      name: 'Dev',
      email: 'dev@certiflow.local',
      role: 'district_officer',
      district_id: '11111111-1111-1111-1111-111111111111',
      centre_id: null,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Health and Readiness Endpoints', () => {
    it('GET / returns 200 with service discovery and documentation links', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: { accept: 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.name).toBe('CertiFlow API');
      expect(data.documentation).toBe('/docs');
      expect(data.openapi).toBe('/openapi.json');
      expect(data.status).toBe('online');
    });

    it('GET / redirects browser requests (accept: text/html) to /docs', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: { accept: 'text/html' },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/docs');
    });

    it('GET /healthz returns 200 with status ok and uptime', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/healthz',
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.status).toBe('ok');
      expect(typeof data.uptime).toBe('number');
      expect(data.timestamp).toBeDefined();
    });

    it('GET /readyz returns readiness probe status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/readyz',
      });

      // Status code is 200 if connected or 503 if services are in offline dev mode
      expect([200, 503]).toContain(res.statusCode);
      const data = JSON.parse(res.body);
      expect(data.status).toBeDefined();
      expect(data.database).toBeDefined();
      expect(data.redis).toBeDefined();
    });
  });

  describe('SLA Escalation Engine', () => {
    it('escalates overdue batches Level 0 -> Level 1 (reminder) and Level 1 -> Level 2 (state) exactly once per level', async () => {
      // Create a test batch that is overdue
      const overdueBatch = await BatchRepository.create({
        centre_id: '22222222-2222-2222-2222-222222222222',
        district_id: '11111111-1111-1111-1111-111111111111',
        course_name: 'Overdue SLA Test Batch',
      });

      overdueBatch.status = 'district_review';
      overdueBatch.escalation_level = 0;
      // Set step_due_at in the past
      overdueBatch.step_due_at = new Date(Date.now() - 5000).toISOString();

      // First Scan: should advance Level 0 -> Level 1 (remind officers)
      const firstScan = await EscalationService.checkAndProcessEscalations();
      expect(firstScan.remindersSent).toBeGreaterThanOrEqual(1);

      const foundReminded = firstScan.processedBatches.find(
        (b) => b.batchId === overdueBatch.id
      );
      expect(foundReminded).toBeDefined();
      expect(foundReminded?.newLevel).toBe(1);
      expect(foundReminded?.action).toBe('reminded');
      expect(overdueBatch.escalation_level).toBe(1);

      // Second Scan immediately: should advance Level 1 -> Level 2 (escalate to state office)
      const secondScan = await EscalationService.checkAndProcessEscalations();
      expect(secondScan.stateEscalations).toBeGreaterThanOrEqual(1);

      const foundEscalated = secondScan.processedBatches.find(
        (b) => b.batchId === overdueBatch.id
      );
      expect(foundEscalated).toBeDefined();
      expect(foundEscalated?.newLevel).toBe(2);
      expect(foundEscalated?.action).toBe('escalated_to_state');
      expect(overdueBatch.escalation_level).toBe(2);

      // Third Scan: batch is already at Level 2, so it should NOT escalate again
      const thirdScan = await EscalationService.checkAndProcessEscalations();
      const duplicateProcessed = thirdScan.processedBatches.find(
        (b) => b.batchId === overdueBatch.id
      );
      expect(duplicateProcessed).toBeUndefined();
      expect(overdueBatch.escalation_level).toBe(2);
    });
  });

  describe('Stuck Batches Board & Trace Route', () => {
    it('GET /api/batches/stuck rejects non-state-office officers (403)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/batches/stuck',
        headers: {
          Authorization: `Bearer ${devToken}`, // district officer
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('GET /api/batches/stuck returns stuck batches for State Office (Farah)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/batches/stuck',
        headers: {
          Authorization: `Bearer ${farahToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(Array.isArray(data.stuck_batches)).toBe(true);
    });

    it('GET /api/batches/:id/trace returns audit_logs, deliveries, and outbox_events', async () => {
      const batch = await BatchRepository.create({
        centre_id: '22222222-2222-2222-2222-222222222222',
        district_id: '11111111-1111-1111-1111-111111111111',
        course_name: 'Trace Verification Batch',
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/batches/${batch.id}/trace`,
        headers: {
          Authorization: `Bearer ${farahToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.batch).toBeDefined();
      expect(data.batch.id).toBe(batch.id);
      expect(Array.isArray(data.audit_logs)).toBe(true);
      expect(Array.isArray(data.deliveries)).toBe(true);
      expect(Array.isArray(data.outbox_events)).toBe(true);
    });
  });
});
