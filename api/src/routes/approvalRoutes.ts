import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { decisionRequestSchema } from '../schemas/approvalSchemas.js';
import { ApprovalStateMachine } from '../services/approvalStateMachine.js';
import { ApprovalRepository } from '../repositories/approvalRepository.js';
import { BatchRepository } from '../repositories/batchRepository.js';
import { CandidateRepository } from '../repositories/candidateRepository.js';

export const approvalRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  /**
   * POST /api/batches/:id/decision
   * Execute Approve / Reject / Send Back decision in ONE transaction.
   * If two simultaneous approvals race, exactly one advances and the loser gets 409 Conflict.
   */
  fastify.post(
    '/api/batches/:id/decision',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = decisionRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Invalid decision payload',
          issues: parseResult.error.issues,
        });
      }

      const { decision, reason, comments } = parseResult.data;

      try {
        const result = await ApprovalStateMachine.executeDecision({
          batchId: id,
          officer: request.user,
          decision,
          reason,
          comments,
        });

        return reply.status(200).send({
          success: true,
          message: `Decision '${decision}' recorded successfully`,
          ...result,
        });
      } catch (err: any) {
        const statusCode = err.statusCode || (err.message.includes('Conflict') ? 409 : 400);
        return reply.status(statusCode).send({
          statusCode,
          error: statusCode === 409 ? 'Conflict' : statusCode === 403 ? 'Forbidden' : 'Bad Request',
          message: err.message,
        });
      }
    }
  );

  /**
   * POST /api/batches/:id/resubmit
   * Training centre resubmits a batch that was sent back.
   * Increments `round`, resets status to `district_review`, and invalidates prior approvals.
   */
  fastify.post(
    '/api/batches/:id/resubmit',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const batch = await ApprovalStateMachine.resubmitBatch(id, request.user);
        return reply.send({
          success: true,
          message: `Batch resubmitted for round ${batch.round}. Previous approvals invalidated for this new round.`,
          batch,
        });
      } catch (err: any) {
        return reply.status(err.statusCode || 400).send({
          statusCode: err.statusCode || 400,
          error: 'Bad Request',
          message: err.message,
        });
      }
    }
  );

  /**
   * GET /api/batches/:id/timeline
   * Chronological timeline of every decision across all rounds
   */
  fastify.get(
    '/api/batches/:id/timeline',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const timeline = await ApprovalRepository.findTimelineByBatchId(id);
      return reply.send({ batchId: id, timeline });
    }
  );

  /**
   * GET /api/queue/waiting-for-me
   * Return batches currently waiting on the authenticated officer's action
   */
  fastify.get(
    '/api/queue/waiting-for-me',
    { preHandler: [(fastify as any).authenticate] },
    async (request, reply) => {
      const user = request.user;
      const allBatches = await BatchRepository.findBatchesByScope({
        role: user.role,
        centre_id: user.centre_id,
        district_id: user.district_id,
      });

      const waiting: any[] = [];

      for (const batch of allBatches) {
        // Compute candidate stats for reviewing officers
        const candidates = await CandidateRepository.findByBatchId(batch.id);
        const scores = candidates.map((c) => Number(c.score)).filter((s) => !isNaN(s));
        const passCount = scores.filter((s) => s >= 50).length;
        const avgScore =
          scores.length > 0
            ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
            : 0;
        const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;
        const minScore = scores.length > 0 ? Math.min(...scores) : 0;
        const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

        const basePayload = {
          ...batch,
          candidates,
          candidate_count: candidates.length,
          stats: {
            total: candidates.length,
            avg_score: avgScore,
            pass_count: passCount,
            pass_rate: passRate,
            min_score: minScore,
            max_score: maxScore,
          },
        };

        if (user.role === 'district_officer') {
          if (
            (batch.status === 'district_review' || batch.status === 'submitted') &&
            batch.district_id === user.district_id
          ) {
            // Check if this officer hasn't approved in this round yet
            const hasVoted = await ApprovalRepository.hasOfficerVoted(
              batch.id,
              batch.round,
              'district_review',
              user.id
            );
            if (!hasVoted) {
              const approvedCount = await ApprovalRepository.countApprovedOfficers(
                batch.id,
                batch.round,
                'district_review'
              );
              waiting.push({
                ...basePayload,
                needed_approvals: 2,
                current_approvals: approvedCount,
              });
            }
          }
        } else if (user.role === 'quality_team') {
          if (batch.status === 'quality_review') {
            waiting.push(basePayload);
          }
        } else if (user.role === 'state_office') {
          if (batch.status === 'state_review') {
            waiting.push(basePayload);
          }
        } else if (user.role === 'training_centre') {
          if (batch.status === 'sent_back') {
            waiting.push(basePayload);
          }
        }
      }

      return reply.send({ queue: waiting });
    }
  );
};
