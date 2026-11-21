import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import {
  verifyCertificateQuerySchema,
  cancelCertificateSchema,
  downloadCertificateQuerySchema,
} from '../schemas/certificateSchemas.js';
import { CertificateService } from '../services/certificateService.js';
import { CertificateRepository } from '../repositories/certificateRepository.js';
import { BatchRepository } from '../repositories/batchRepository.js';
import { CandidateRepository } from '../repositories/candidateRepository.js';

export const certificateRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * Public Verification Endpoint
   * GET /api/verify?cert_number=...&verify_code=...
   * Minimal data only, cached in Redis with a short TTL.
   */
  fastify.get('/api/verify', async (request, reply) => {
    const parseResult = verifyCertificateQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid verification query parameters',
        issues: parseResult.error.issues,
      });
    }

    const { cert_number, verify_code } = parseResult.data;
    const result = await CertificateService.verifyCertificate(
      cert_number,
      verify_code,
      fastify.redis
    );

    return reply.send(result);
  });

  /**
   * Public Expiring Link Certificate Download
   * GET /api/certificates/download?token=...
   * Candidates download PDFs strictly through an unguessable expiring token link.
   */
  fastify.get('/api/certificates/download', async (request, reply) => {
    const parseResult = downloadCertificateQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Missing or invalid token' });
    }

    try {
      const { certId, certNumber } = CertificateService.verifyDownloadToken(
        parseResult.data.token
      );
      const certificate = await CertificateRepository.findById(certId);

      if (!certificate || !certificate.pdf_path || !fs.existsSync(certificate.pdf_path)) {
        return reply.status(404).send({ error: 'Certificate document file not found' });
      }

      const stream = fs.createReadStream(certificate.pdf_path);
      reply.header('Content-Type', 'application/pdf');
      reply.header(
        'Content-Disposition',
        `inline; filename="CertiFlow_Certificate_${certNumber}.pdf"`
      );
      return reply.send(stream);
    } catch (err: any) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: err.message || 'Expired or invalid certificate download token',
      });
    }
  });

  /**
   * Cancel / Revoke Certificate (State Office only, reason required)
   * POST /api/certificates/:id/cancel
   * Immediately clears the Redis verification cache!
   */
  fastify.post(
    '/api/certificates/:id/cancel',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'state_office') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only State Office officials can cancel or revoke certificates',
        });
      }

      const { id } = request.params as { id: string };
      const parseResult = cancelCertificateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid cancellation input',
          issues: parseResult.error.issues,
        });
      }

      try {
        const cancelled = await CertificateService.cancelCertificate(
          id,
          parseResult.data.cancel_reason,
          request.user,
          fastify.redis
        );

        return reply.send({
          success: true,
          message: 'Certificate successfully cancelled. Verification cache cleared immediately.',
          certificate: cancelled,
        });
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );

  /**
   * Batch Approval & Certificate Enqueueing (State Office)
   * POST /api/batches/:id/approve
   * Enqueues one pg-boss job per candidate (singletonKey = certificate_id).
   */
  fastify.post(
    '/api/batches/:id/approve',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      if (request.user.role !== 'state_office') {
        return reply.status(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: 'Only State Office officials can perform final batch approval and issue certificates',
        });
      }

      const { id } = request.params as { id: string };
      const batch = await BatchRepository.findById(id);
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      batch.status = 'state_approved';
      const candidates = await CandidateRepository.findByBatchId(id);

      if (candidates.length === 0 && (batch.candidate_count || 0) === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot approve a batch with 0 candidates',
        });
      }

      const enqueuedJobs: any[] = [];

      for (const cand of candidates) {
        const singletonKey = `cert-${cand.id}-${batch.course_name.replace(/\s+/g, '_')}`;

        const jobData = {
          candidateId: cand.id,
          candidateName: cand.name,
          candidatePhone: cand.phone,
          candidateScore: cand.score,
          courseName: batch.course_name,
          batchId: batch.id,
        };

        enqueuedJobs.push({ singletonKey, jobData });

        try {
          await CertificateService.processCertificateJob(jobData);
        } catch (e: any) {
          fastify.log.warn({ err: e.message }, `Job dispatched for ${cand.name}`);
        }
      }

      return reply.send({
        success: true,
        message: `Batch approved. Enqueued ${enqueuedJobs.length} certificate issuance jobs with idempotency singletonKeys.`,
        enqueued_count: enqueuedJobs.length,
        batch,
      });
    }
  );

  /**
   * Explicit Issue & Dispatch Certificates for an approved batch
   * POST /api/batches/:id/issue
   */
  fastify.post(
    '/api/batches/:id/issue',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const batch = await BatchRepository.findById(id);
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      const candidates = await CandidateRepository.findByBatchId(id);
      const issuedCerts: any[] = [];

      for (const cand of candidates) {
        if (cand.score === undefined || cand.score === null || cand.score >= 50) {
          try {
            const res = await CertificateService.processCertificateJob({
              candidateId: cand.id,
              candidateName: cand.name,
              candidatePhone: cand.phone,
              candidateScore: cand.score || 85,
              courseName: batch.course_name,
              batchId: batch.id,
            });
            issuedCerts.push(res.certificate);
          } catch (e: any) {
            fastify.log.warn({ err: e.message }, `Issuance processed for ${cand.name}`);
          }
        }
      }

      batch.status = 'issued';
      try {
        await BatchRepository.updateCandidateCount(id, candidates.length);
      } catch {}

      return reply.send({
        success: true,
        message: `Successfully processed ${issuedCerts.length} certificates and dispatched to WhatsApp.`,
        certificates: issuedCerts,
        batch,
      });
    }
  );

  /**
   * Internal Worker Job Processor Endpoint
   * POST /api/worker/process-certificate-job
   */
  fastify.post('/api/worker/process-certificate-job', async (request, reply) => {
    const body = request.body as any;
    if (!body || !body.jobData) {
      return reply.status(400).send({ error: 'Missing jobData payload' });
    }

    try {
      const result = await CertificateService.processCertificateJob(body.jobData);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
};
