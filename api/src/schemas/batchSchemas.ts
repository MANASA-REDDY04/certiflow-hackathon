import { z } from 'zod';

export const createBatchSchema = z
  .object({
    course_name: z
      .string()
      .min(2, 'Course name must be at least 2 characters')
      .max(100, 'Course name must not exceed 100 characters'),
  })
  .strict();

export type CreateBatchInput = z.infer<typeof createBatchSchema>;

export const uploadCandidateJsonSchema = z
  .object({
    csvData: z.string().optional(),
    base64: z.string().optional(),
  })
  .strict();
