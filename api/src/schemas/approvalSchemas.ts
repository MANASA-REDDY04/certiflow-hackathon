import { z } from 'zod';

export const decisionRequestSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'send_back']),
    reason: z.string().optional(),
    comments: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.decision === 'reject' || data.decision === 'send_back') {
        const text = (data.reason || data.comments || '').trim();
        return text.length >= 5;
      }
      return true;
    },
    {
      message: 'A mandatory reason of at least 5 characters is required when rejecting or sending back a batch',
      path: ['reason'],
    }
  );

export type DecisionRequestInput = z.infer<typeof decisionRequestSchema>;
