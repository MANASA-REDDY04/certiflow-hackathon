import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { createBatchSchema, uploadCandidateJsonSchema } from '../schemas/batchSchemas.js';
import { BatchService } from '../services/batchService.js';
import { BatchRepository } from '../repositories/batchRepository.js';

export const batchRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * GET /api/batches
   * List batches scoped strictly to the authenticated user's permissions.
   */
  fastify.get(
    '/api/batches',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const batches = await BatchService.listBatches(request.user);
      return reply.send({ batches });
    }
  );

  /**
   * GET /api/batches/template
   * Download official CSV template
   */
  fastify.get('/api/batches/template', async (_request, reply) => {
    const csvContent =
      'name,phone,course,score\n' +
      'Rahul Sharma,+919876543210,Solar Panel Technician,85.5\n' +
      'Priya Patel,+919876543211,Solar Panel Technician,92.0\n' +
      'Amit Verma,+919876543212,Solar Panel Technician,78.0\n' +
      'Sunita Rao,+919876543213,Solar Panel Technician,94.5\n';

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="candidate_template.csv"');
    return reply.send(csvContent);
  });

  /**
   * GET /api/batches/:id
   * Get single batch with its candidate list.
   */
  fastify.get(
    '/api/batches/:id',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await BatchService.getBatchWithCandidates(id, request.user);
        return reply.send(result);
      } catch (err: any) {
        if (err.message.includes('Forbidden')) {
          return reply.status(403).send({ error: err.message });
        }
        return reply.status(404).send({ error: err.message || 'Batch not found' });
      }
    }
  );

  /**
   * POST /api/batches
   * Create a new draft batch for the user's training centre.
   */
  fastify.post(
    '/api/batches',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      request.authorize('batch:create');

      const parseResult = createBatchSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid request body',
          issues: parseResult.error.issues,
        });
      }

      try {
        const batch = await BatchService.createBatch(
          request.user,
          parseResult.data.course_name
        );
        return reply.status(201).send({ batch });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * POST /api/batches/:id/candidates/upload
   * Upload and validate CSV or XLSX candidate records.
   * If any error exists, returns exact errors and saves NOTHING.
   */
  fastify.post(
    '/api/batches/:id/candidates/upload',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const batch = await BatchRepository.findById(id);
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      request.authorize('batch:update', batch);

      // Extract file buffer from multipart or JSON payload
      let fileBuffer: Buffer | null = null;

      if ((request as any).isMultipart && (request as any).isMultipart()) {
        const part = await (request as any).file();
        if (part) {
          fileBuffer = await part.toBuffer();
        }
      } else if (request.body && typeof request.body === 'object') {
        const bodyParse = uploadCandidateJsonSchema.safeParse(request.body);
        if (bodyParse.success) {
          if (bodyParse.data.csvData) {
            fileBuffer = Buffer.from(bodyParse.data.csvData, 'utf-8');
          } else if (bodyParse.data.base64) {
            fileBuffer = Buffer.from(bodyParse.data.base64, 'base64');
          }
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'No candidate file provided. Please upload a CSV or XLSX file.',
        });
      }

      try {
        const result = await BatchService.uploadCandidates(id, fileBuffer, request.user);

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: 'Validation failed',
            message: `${result.errors.length} validation error(s) found in candidate file. 0 candidates were saved.`,
            errors: result.errors,
            totalRows: result.totalRows,
            rowResults: result.rowResults || [],
          });
        }

        return reply.status(200).send({
          success: true,
          message: `Successfully validated and saved ${result.candidates.length} candidates in one transaction.`,
          candidate_count: result.candidates.length,
          candidates: result.candidates,
          rowResults: result.rowResults || [],
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * POST /api/batches/:id/submit
   * Submit batch for district review.
   */
  fastify.post(
    '/api/batches/:id/submit',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const batch = await BatchRepository.findById(id);
      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      request.authorize('batch:submit', batch);

      try {
        const updatedBatch = await BatchService.submitBatch(id, request.user);
        return reply.send({
          success: true,
          message: 'Batch submitted successfully for district review',
          batch: updatedBatch,
        });
      } catch (err: any) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: err.message,
        });
      }
    }
  );
};
